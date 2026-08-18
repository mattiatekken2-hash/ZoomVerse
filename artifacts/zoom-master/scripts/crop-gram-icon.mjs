import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const projectRoot = "C:/Users/matti/Downloads/ZoomVerse-main/ZoomVerse-clone/artifacts/zoom-master";
const outDir = join(projectRoot, "public", "assets");
const bannerUrl =
  "https://static.bittime.com/cms-static/upload/Pavel_Durov_Announces_the_Gram_Crypto_Wallet_on_Telegram_with_Free_Crypto_Transfers_45f8bdc644.png";

const DIAMOND_PATH =
  "M66.523 11.333H33.477c-4.401 0-6.601 0-8.592.616a13.792 13.792 0 0 0-4.808 2.625c-1.594 1.341-2.784 3.192-5.164 6.894L4.408 37.81c-1.572 2.446-2.358 3.67-2.572 4.956a6.322 6.322 0 0 0 .362 3.37c.482 1.212 1.51 2.24 3.567 4.296l39.033 39.034c1.821 1.82 2.731 2.731 3.781 3.072.924.3 1.918.3 2.842 0 1.05-.34 1.96-1.251 3.78-3.072l39.035-39.034c2.056-2.056 3.084-3.084 3.566-4.296a6.32 6.32 0 0 0 .362-3.37c-.214-1.287-1-2.51-2.572-4.956L85.087 21.47c-2.38-3.703-3.57-5.554-5.164-6.895a13.792 13.792 0 0 0-4.808-2.625c-1.99-.616-4.191-.616-8.592-.616z";
const STAR_PATH =
  "M60.268 24.224c.537-1.45 2.59-1.45 3.126 0l3.71 10.027a2.2 2.2 0 0 0 1.3 1.3l10.027 3.71c1.451.537 1.451 2.59 0 3.126l-10.027 3.71a2.2 2.2 0 0 0-1.3 1.3l-3.71 10.027c-.537 1.451-2.59 1.451-3.126 0l-3.71-10.027a2.2 2.2 0 0 0-1.3-1.3l-10.027-3.71c-1.451-.537-1.451-2.589 0-3.126l10.027-3.71a2.2 2.2 0 0 0 1.3-1.3l3.71-10.027z";

/** True for banner blue tile / star cutout pixels. */
function isBlueBackground(r, g, b) {
  if (b < 95) return false;
  if (r > 210 && g > 210 && b > 210) return false;
  return b >= r + 12 && b >= g - 8;
}

const res = await fetch(bannerUrl);
const buf = Buffer.from(await res.arrayBuffer());
const { width = 0, height = 0 } = await sharp(buf).metadata();
console.log(`banner: ${width}x${height}`);

const cropSize = Math.round(height * 0.42);
const left = Math.round(width * 0.66);
const top = Math.round((height - cropSize) / 2);

await mkdir(outDir, { recursive: true });

const cropped = await sharp(buf)
  .extract({ left, top, width: cropSize, height: cropSize })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data, info } = cropped;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (isBlueBackground(r, g, b)) data[i + 3] = 0;
}

const diamondOnlyPng = join(outDir, "gram-diamond-icon.png");
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim()
  .extend({
    top: 16,
    bottom: 16,
    left: 16,
    right: 16,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(diamondOnlyPng);

const diamondSvg = join(outDir, "gram-diamond-icon.svg");
const svg = `<!-- White Gram diamond only — official paths, transparent background -->
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    fill="#FFFFFF"
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="${DIAMOND_PATH} ${STAR_PATH}"
  />
</svg>
`;
await import("node:fs/promises").then((fs) => fs.writeFile(diamondSvg, svg, "utf8"));

console.log(`saved: ${diamondOnlyPng}`);
console.log(`saved: ${diamondSvg}`);
