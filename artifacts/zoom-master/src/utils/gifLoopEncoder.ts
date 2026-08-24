/**
 * Tiny GIF89a encoder for a seamless looping spin (loop count 0).
 * Palette is built from a 16-bit histogram so encoding stays fast on phones.
 */

function rgb565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

function unpack565(v: number): [number, number, number] {
  return [(v >> 8) & 0xf8, (v >> 3) & 0xfc, (v << 3) & 0xf8];
}

function nearestIndex(r: number, g: number, b: number, palette: Uint8Array, count: number): number {
  let best = 0;
  let bestD = 1e12;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const dr = r - palette[o]!;
    const dg = g - palette[o + 1]!;
    const db = b - palette[o + 2]!;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function luma565(k: number): number {
  const r = (k >> 8) & 0xf8;
  const g = (k >> 3) & 0xfc;
  const b = (k << 3) & 0xf8;
  return r * 3 + g * 6 + b;
}

function buildPalette(frames: Uint8ClampedArray[], colorCount: number): Uint8Array {
  const hist = new Float64Array(65536);
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4) {
      const key = rgb565(px[i]!, px[i + 1]!, px[i + 2]!);
      // Background navy dominates the frame. Down-weight it so model colors
      // actually get GIF palette slots (otherwise the mesh vanishes).
      hist[key]! += luma565(key) < 56 ? 0.02 : 1;
    }
  }
  const ranked: Array<{ k: number; n: number }> = [];
  for (let k = 0; k < 65536; k++) {
    const n = hist[k]!;
    if (n) ranked.push({ k, n });
  }
  ranked.sort((a, b) => b.n - a.n);
  const palette = new Uint8Array(colorCount * 3);
  const used = Math.min(colorCount, Math.max(1, ranked.length));
  for (let i = 0; i < used; i++) {
    const [r, g, b] = unpack565(ranked[i]!.k);
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  }
  // Unused slots default to 0,0,0 which steals dark model pixels.
  for (let i = used; i < colorCount; i++) {
    const src = (i % used) * 3;
    palette[i * 3] = palette[src]!;
    palette[i * 3 + 1] = palette[src + 1]!;
    palette[i * 3 + 2] = palette[src + 2]!;
  }
  return palette;
}

function indexFrame(
  rgba: Uint8ClampedArray,
  palette: Uint8Array,
  colorCount: number,
  lookup: Int16Array,
): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const key = rgb565(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    let idx = lookup[key]!;
    if (idx < 0) {
      idx = nearestIndex(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, palette, colorCount);
      lookup[key] = idx;
    }
    out[p] = idx;
  }
  return out;
}

class BitWriter {
  bytes: number[] = [];
  acc = 0;
  bits = 0;

  write(value: number, width: number) {
    this.acc |= (value & ((1 << width) - 1)) << this.bits;
    this.bits += width;
    while (this.bits >= 8) {
      this.bytes.push(this.acc & 0xff);
      this.acc >>= 8;
      this.bits -= 8;
    }
  }

  flush() {
    if (this.bits > 0) this.bytes.push(this.acc & 0xff);
    this.acc = 0;
    this.bits = 0;
  }
}

function lzw(minCode: number, indexes: Uint8Array): number[] {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const bw = new BitWriter();
  let codeSize = minCode + 1;
  let next = eoi + 1;
  const dict = new Map<string, number>();

  const reset = () => {
    dict.clear();
    for (let i = 0; i < clear; i++) dict.set(String.fromCharCode(i), i);
    codeSize = minCode + 1;
    next = eoi + 1;
  };

  reset();
  bw.write(clear, codeSize);
  let w = String.fromCharCode(indexes[0]!);
  for (let i = 1; i < indexes.length; i++) {
    const c = String.fromCharCode(indexes[i]!);
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
      continue;
    }
    bw.write(dict.get(w)!, codeSize);
    if (next < 4096) {
      dict.set(wc, next++);
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      bw.write(clear, codeSize);
      reset();
    }
    w = c;
  }
  bw.write(dict.get(w)!, codeSize);
  bw.write(eoi, codeSize);
  bw.flush();
  return bw.bytes;
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    out.push(n);
    out.push(...data.slice(i, i + n));
  }
  out.push(0);
  return out;
}

/** Encode RGBA frames as an infinitely looping GIF. Delay is in 1/100s. */
export function encodeLoopingGif(
  width: number,
  height: number,
  frames: Uint8ClampedArray[],
  delayCs: number,
): Uint8Array {
  const colorCount = 128;
  const palette = buildPalette(frames, colorCount);
  const lookup = new Int16Array(65536).fill(-1);
  const gctBits = 7;
  const packed = 0x80 | 0x70 | (gctBits - 1);
  const out: number[] = [];
  const u16 = (n: number) => {
    out.push(n & 0xff, (n >> 8) & 0xff);
  };

  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  u16(width);
  u16(height);
  out.push(packed, 0x00, 0x00);
  for (let i = 0; i < 1 << gctBits; i++) {
    out.push(palette[i * 3] || 0, palette[i * 3 + 1] || 0, palette[i * 3 + 2] || 0);
  }
  // Netscape 2.0 loop forever
  out.push(0x21, 0xff, 0x0b);
  for (const ch of "NETSCAPE2.0") out.push(ch.charCodeAt(0));
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  const minCode = gctBits;
  for (const rgba of frames) {
    const indexed = indexFrame(rgba, palette, colorCount, lookup);
    out.push(0x21, 0xf9, 0x04, 0x04);
    u16(delayCs);
    out.push(0x00, 0x00);
    out.push(0x2c, 0x00, 0x00, 0x00, 0x00);
    u16(width);
    u16(height);
    out.push(0x00, minCode);
    out.push(...subBlocks(lzw(minCode, indexed)));
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

export function gifToBase64(gif: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < gif.length; i += chunk) {
    bin += String.fromCharCode(...gif.subarray(i, i + chunk));
  }
  return btoa(bin);
}
