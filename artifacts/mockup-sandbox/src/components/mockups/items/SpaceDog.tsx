import { useState } from "react";

// ── Color palettes by rarity (same as Zoom Master) ─────────────────────
const RARITY_COLORS: Record<string, { core: string; glow: string; accent: string; label: string }> = {
  BASIC:    { core: "#d0d4e0", glow: "#b0b8cc", accent: "#4a5270", label: "BASIC" },
  RARE:     { core: "#4facfe", glow: "#a0d4ff", accent: "#1a5fa0", label: "RARE" },
  EPIC:     { core: "#c471ed", glow: "#d898f0", accent: "#7a30a0", label: "EPIC" },
  GOLD:     { core: "#ffd700", glow: "#ffe082", accent: "#b8860b", label: "GOLD" },
  MYTHIC:   { core: "#ff4500", glow: "#ff7a55", accent: "#5a0000", label: "MYTHIC" },
  PLASMA:   { core: "#00e676", glow: "#69f0ae", accent: "#1b5e20", label: "PLASMA" },
};

// ── CSS keyframes for the breathing glow ─────────────────────────────
const DogKeyframes = () => (
  <style>{`
    @keyframes dog-breathe {
      0%   { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.08); opacity: 1; }
    }
    @keyframes dog-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    @keyframes tail-wag {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(8deg); }
    }
    @keyframes ear-twitch {
      0%, 90%, 100% { transform: rotate(0deg); }
      95% { transform: rotate(-6deg); }
    }
    @keyframes collar-glow {
      0%, 100% { box-shadow: 0 0 6px var(--glow), 0 0 12px var(--glow); }
      50% { box-shadow: 0 0 10px var(--glow), 0 0 20px var(--glow), 0 0 30px var(--glow); }
    }
  `}</style>
);

// ── Single Space Dog orb ───────────────────────────────────────────────
function SpaceDogOrb({ rarity, size = 90, showLabel = true }: {
  rarity: string;
  size?: number;
  showLabel?: boolean;
}) {
  const colors = RARITY_COLORS[rarity] || RARITY_COLORS.BASIC;
  const id = `dog-${rarity}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          animation: "dog-float 3s ease-in-out infinite",
        }}
      >
        {/* Outer glow halo */}
        <div
          style={{
            position: "absolute",
            width: size * 2.2,
            height: size * 2.2,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.glow}55 0%, ${colors.glow}20 40%, transparent 70%)`,
            filter: `blur(${size * 0.2}px)`,
            animation: "dog-breathe 3s ease-in-out infinite alternate",
            pointerEvents: "none",
          }}
        />

        {/* SVG Dog */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          style={{
            filter: `drop-shadow(0 0 ${size * 0.08}px ${colors.glow})`,
            zIndex: 2,
          }}
        >
          <defs>
            {/* Body gradient */}
            <radialGradient id={`${id}-body`} cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor={colors.core} />
              <stop offset="40%" stopColor={colors.glow} />
              <stop offset="75%" stopColor={colors.accent} />
              <stop offset="100%" stopColor={colors.accent} />
            </radialGradient>
            {/* Ear inner gradient */}
            <linearGradient id={`${id}-ear`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.core} />
              <stop offset="100%" stopColor={colors.glow} />
            </linearGradient>
            {/* Collar gradient */}
            <radialGradient id={`${id}-collar`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor={colors.core} />
              <stop offset="100%" stopColor={colors.accent} />
            </radialGradient>
            {/* Eye highlight */}
            <radialGradient id={`${id}-eye`} cx="40%" cy="35%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#e0e0e0" />
              <stop offset="100%" stopColor="#808080" />
            </radialGradient>
            {/* Nose */}
            <radialGradient id={`${id}-nose`} cx="40%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#333" />
              <stop offset="100%" stopColor="#111" />
            </radialGradient>
            {/* Space helmet glass */}
            <radialGradient id={`${id}-helmet`} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </radialGradient>
          </defs>

          {/* Tail */}
          <path
            d="M 75 55 Q 92 45 88 30 Q 85 20 80 25"
            fill="none"
            stroke={colors.accent}
            strokeWidth="5"
            strokeLinecap="round"
            style={{ transformOrigin: "75px 55px", animation: "tail-wag 1.2s ease-in-out infinite" }}
          />

          {/* Back body */}
          <ellipse cx="52" cy="62" rx="22" ry="16" fill={`url(#${id}-body)`} />

          {/* Front legs */}
          <ellipse cx="40" cy="76" rx="5" ry="10" fill={colors.accent} />
          <ellipse cx="52" cy="76" rx="5" ry="10" fill={colors.accent} />

          {/* Back legs */}
          <ellipse cx="62" cy="76" rx="5" ry="10" fill={colors.accent} />
          <ellipse cx="72" cy="72" rx="5" ry="9" fill={colors.accent} />

          {/* Head */}
          <ellipse cx="38" cy="42" rx="20" ry="18" fill={`url(#${id}-body)`} />

          {/* Snout */}
          <ellipse cx="28" cy="48" rx="10" ry="8" fill={colors.glow} />
          {/* Nose */}
          <ellipse cx="24" cy="46" rx="4" ry="3" fill="url(#${id}-nose)" />
          {/* Mouth */}
          <path d="M 22 51 Q 28 55 33 51" fill="none" stroke={colors.accent} strokeWidth="1.5" strokeLinecap="round" />

          {/* Ears (twitching left) */}
          <ellipse cx="32" cy="30" rx="7" ry="10" fill={`url(#${id}-ear)`} transform="rotate(-12 32 30)" style={{ transformOrigin: "32px 30px", animation: "ear-twitch 4s ease-in-out infinite" }} />
          <ellipse cx="46" cy="30" rx="7" ry="10" fill={`url(#${id}-ear)`} transform="rotate(8 46 30)" />

          {/* Eyes with helmet reflection */}
          <ellipse cx="34" cy="40" rx="3.5" ry="4" fill="url(#${id}-eye)" />
          <ellipse cx="44" cy="40" rx="3.5" ry="4" fill="url(#${id}-eye)" />
          {/* Pupils */}
          <ellipse cx="33" cy="40" rx="1.5" ry="2" fill="#111" />
          <ellipse cx="43" cy="40" rx="1.5" ry="2" fill="#111" />
          {/* Eye sparkle */}
          <circle cx="35" cy="38" r="1" fill="#fff" opacity="0.8" />
          <circle cx="45" cy="38" r="1" fill="#fff" opacity="0.8" />

          {/* Space helmet collar */}
          <ellipse cx="42" cy="56" rx="18" ry="6" fill="none" stroke={colors.core} strokeWidth="3" />

          {/* Collar tag */}
          <circle cx="42" cy="60" r="4" fill="url(#${id}-collar)" style={{ animation: "collar-glow 2s ease-in-out infinite" }} />
          <text x="42" y="62" textAnchor="middle" fontSize="3" fill={colors.accent} fontWeight="bold">Z</text>

          {/* Space helmet glass overlay */}
          <ellipse cx="40" cy="42" rx="24" ry="20" fill={`url(#${id}-helmet)`} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

          {/* Helmet highlight */}
          <ellipse cx="30" cy="30" rx="8" ry="5" fill="rgba(255,255,255,0.15)" transform="rotate(-20 30 30)" />
        </svg>
      </div>

      {showLabel && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            color: colors.core,
            textShadow: `0 0 8px ${colors.glow}`,
            textTransform: "uppercase",
          }}
        >
          {colors.label}
        </span>
      )}
    </div>
  );
}

// ── Main demo component ──────────────────────────────────────────────────
export function SpaceDog() {
  const [selected, setSelected] = useState<string>("BASIC");
  const rarities = ["BASIC", "RARE", "EPIC", "PLASMA", "MYTHIC", "GOLD"];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 30%, #1a1f3a 0%, #0d1120 60%, #060812 100%)",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        gap: 32,
      }}
    >
      <DogKeyframes />

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#e8eafc",
            margin: 0,
            letterSpacing: 2,
            textTransform: "uppercase",
            textShadow: "0 0 16px rgba(200,210,255,0.35)",
          }}
        >
          Space Dog
        </h1>
        <p style={{ fontSize: 12, color: "#8b92b4", marginTop: 4 }}>
          Nuovo item tipo — esempio di come aggiungere 20 item al gioco
        </p>
      </div>

      {/* Big preview */}
      <div
        style={{
          padding: 32,
          borderRadius: 20,
          background: "rgba(255,255,255,0.03)",
          border: `1.5px solid ${RARITY_COLORS[selected].glow}33`,
          boxShadow: `0 0 40px ${RARITY_COLORS[selected].glow}22`,
          transition: "border-color 0.4s, box-shadow 0.4s",
        }}
      >
        <SpaceDogOrb rarity={selected} size={140} showLabel={false} />
      </div>

      {/* Rarity selector */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {rarities.map((r) => (
          <button
            key={r}
            onClick={() => setSelected(r)}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: `1.5px solid ${RARITY_COLORS[r].core}`,
              background: selected === r ? `${RARITY_COLORS[r].core}22` : "rgba(255,255,255,0.03)",
              color: RARITY_COLORS[r].core,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              boxShadow: selected === r ? `0 0 16px ${RARITY_COLORS[r].glow}44` : "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${RARITY_COLORS[r].core}15`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = selected === r ? `${RARITY_COLORS[r].core}22` : "rgba(255,255,255,0.03)";
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Grid of all rarities */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          padding: 20,
          borderRadius: 16,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {rarities.map((r) => (
          <SpaceDogOrb key={r} rarity={r} size={70} showLabel={true} />
        ))}
      </div>

      {/* Info panel */}
      <div
        style={{
          maxWidth: 420,
          padding: 20,
          borderRadius: 14,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 13,
          color: "#8b92b4",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "#e8eafc" }}>Come funziona:</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Svg disegnato a mano (nessuna immagine esterna)</li>
          <li>Colori per rarità riutilizzati dai pianeti esistenti</li>
          <li>Animazioni CSS pura (glow, floating, coda, orecchio)</li>
          <li>Perfetto per Telegram WebApp — leggero e fluido</li>
          <li>Scalabile con <code>size</code> prop (70px, 140px, ecc.)</li>
        </ul>
      </div>
    </div>
  );
}
