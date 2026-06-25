import { useEffect, useMemo, useState } from "react";
import { levelFromTaps } from "../utils/levelCurve";

interface Props {
  totalTaps: number;
  photoUrl?: string | null;
  /** First name / username used for the fallback initial. */
  name?: string | null;
}

export function AvatarXP({ totalTaps, photoUrl, name }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [photoUrl]);
  const info = useMemo(() => levelFromTaps(totalTaps), [totalTaps]);
  const isMax = info.isMax;

  const accent = isMax ? "#ffd24a" : "#ff3355";
  const accentSoft = isMax ? "rgba(255,210,74," : "rgba(255,51,85,";

  const showPhoto = !!photoUrl && !imgFailed;
  const initial = (name?.trim()?.[0] || "★").toUpperCase();
  const fallbackBg = isMax ? "#2a2000" : "#1a0008";

  const AVATAR = 34;
  const BAR_W = 5;
  const BAR_H = AVATAR;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0" aria-label={`Level ${info.level}`}>
      {/* Vertical XP bar (fills bottom -> top) */}
      <div
        style={{
          width: BAR_W,
          height: BAR_H,
          borderRadius: BAR_W,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${accentSoft}0.25)`,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${Math.round(info.progress * 100)}%`,
            background: isMax
              ? "linear-gradient(180deg, #fff2c2, #ffd24a)"
              : "linear-gradient(180deg, #ff8899, #ff3355)",
            boxShadow: `0 0 8px ${accentSoft}0.7)`,
            transition: "height 0.35s ease",
          }}
        />
      </div>

      {/* Avatar + level badge */}
      <div style={{ position: "relative", width: AVATAR, height: AVATAR }}>
        <div
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: "50%",
            overflow: "hidden",
            border: `1.5px solid ${accentSoft}${isMax ? "0.85" : "0.5"})`,
            boxShadow: isMax
              ? "0 0 14px rgba(255,210,74,0.6), inset 0 0 6px rgba(255,210,74,0.25)"
              : `0 0 8px ${accentSoft}0.3)`,
            background: "rgba(255,51,85,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {showPhoto ? (
            <img
              src={photoUrl as string}
              alt=""
              width={AVATAR}
              height={AVATAR}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <span
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: accent,
                textShadow: `0 0 6px ${accentSoft}0.6)`,
              }}
            >
              {initial}
            </span>
          )}
        </div>

        {/* Level number badge */}
        <div
          style={{
            position: "absolute",
            bottom: -3,
            right: -4,
            minWidth: 16,
            height: 14,
            padding: "0 3px",
            borderRadius: 7,
            background: isMax
              ? "linear-gradient(135deg, #ffe28a, #ffb347)"
              : "linear-gradient(135deg, #1a0008, #0a0004)",
            border: `1px solid ${accentSoft}${isMax ? "0.9" : "0.6"})`,
            boxShadow: `0 0 6px ${accentSoft}0.5)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              lineHeight: 1,
              color: isMax ? "#3a2400" : accent,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {info.level}
          </span>
        </div>
      </div>
    </div>
  );
}
