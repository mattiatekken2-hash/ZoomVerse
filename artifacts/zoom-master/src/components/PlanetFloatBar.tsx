// CS:GO-style perfection bar shown under a planet's name in the Lab
// (FarmPage) and on every marketplace card. Purely cosmetic, drives no
// economic outcome.
//
// Anatomy:
//   • Track    — full-width muted background.
//   • Fill     — colored portion equal to (float * 100)%, gradient from
//                "Battle-Scarred" red on the left to "Perfect" gold on
//                the right so the eye reads the position as a quality
//                score even before noticing the number.
//   • Label    — "0.847 · Field-Tested" (number + tier name).

import { formatFloat, getFloatTier } from "../utils/planetFloat";
import { useT } from "../i18n/LanguageContext";

const TIER_KEY: Record<string, string> = {
  "Perfect": "float.perfect",
  "Pristine": "float.pristine",
  "Field-Tested": "float.fieldTested",
  "Well-Worn": "float.wellWorn",
  "Battle-Scarred": "float.battleScarred",
};
interface Props {
  // Float value in [0, 1].
  value: number;
  // Compact variant for marketplace cards (smaller height, no tier
  // label inline). Defaults to false (full Lab variant).
  compact?: boolean;
}

export function PlanetFloatBar({ value, compact = false }: Props) {
  const { t } = useT();
  // Defensive clamp — getDisplayFloat already returns [0, 1] but keep
  // this here so the component is safe to import standalone.
  const v = Math.max(0, Math.min(1, value));
  const pct = v * 100;
  const tier = getFloatTier(v);
  const trackHeight = compact ? 4 : 6;
  const tierLabel = t(TIER_KEY[tier.label] ?? "");

  return (
    <div className="w-full" data-testid="planet-float-bar">
      <div
        className="w-full rounded-full overflow-hidden"
        style={{
          height: trackHeight,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, #ff5252 0%, #c471ed 25%, #4facfe 55%, #00f2fe 80%, #ffd700 100%)",
            boxShadow: v >= 0.95 ? `0 0 8px ${tier.color}aa` : "none",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {!compact && (
        <div
          className="flex items-center justify-between mt-1"
          style={{ fontSize: 9 }}
        >
          <span className="font-mono font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
            {formatFloat(v)}
          </span>
          {/* Tier text label intentionally hidden in the Lab/Farm —
              the colored fill bar already communicates the tier and
              the explicit "FLOAT.PRISTINE" wording felt noisy. */}
          <span aria-hidden style={{ display: "none", color: tier.color }}>
            {tierLabel.toUpperCase()}
          </span>
        </div>
      )}
      {compact && (
        <div className="mt-0.5" style={{ fontSize: 8 }}>
          <span className="font-mono font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
            {formatFloat(v)}
          </span>
        </div>
      )}
    </div>
  );
}
