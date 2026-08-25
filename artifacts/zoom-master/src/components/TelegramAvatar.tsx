import { useEffect, useState } from "react";

/** Telegram default-avatar palette (no photo). */
const TG_COLORS = [
  "#FF516A",
  "#FF8652",
  "#FFA85C",
  "#54CB68",
  "#28C9B7",
  "#2A9EF1",
  "#A695E1",
  "#E671A5",
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return TG_COLORS[h % TG_COLORS.length];
}

function initialOf(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const ch = [...n].find((c) => /[A-Za-z0-9\u00C0-\u024F]/.test(c));
  return (ch ?? n[0]).toUpperCase();
}

interface Props {
  photoUrl?: string | null;
  name?: string | null;
  seed?: string | null;
  size?: number;
}

/** Photo if present, otherwise Telegram-style colored circle + initial. */
export function TelegramAvatar({ photoUrl, name, seed, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photoUrl]);

  const showPhoto = !!photoUrl && !failed;
  if (showPhoto) {
    return (
      <img
        src={photoUrl as string}
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        style={{
          width: size,
          height: size,
          border: "2px solid rgba(255,255,255,0.2)",
        }}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  const letter = initialOf(name);
  const bg = colorFor(seed || name || letter);

  return (
    <div
      aria-hidden
      className="flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {letter}
    </div>
  );
}
