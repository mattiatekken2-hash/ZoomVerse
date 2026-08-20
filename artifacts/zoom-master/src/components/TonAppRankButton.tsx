/**
 * Live TON App ranking badge — image served by ton.app (updates with rank).
 * Tap opens the Zoom Bot listing for votes / discovery.
 */
import { useState, type CSSProperties } from "react";
import { GramDiamondIcon } from "./GramDiamondIcon";
import { useT } from "../i18n/LanguageContext";

export const TON_APP_LISTING_URL = "https://ton.app/games/zoom-bot?id=5847";
export const TON_APP_BADGE_URL = "https://ton.app/a2/badge/topapp?appId=5847";

function openExternalUrl(url: string) {
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } };
    }).Telegram?.WebApp;
    if (tg?.openTelegramLink && url.startsWith("https://t.me/")) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch { /**/ }
  window.open(url, "_blank", "noopener,noreferrer");
}

interface Props {
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

export function TonAppRankButton({ className, style, testId = "lab-ton-app-vote" }: Props) {
  const { t } = useT();
  const [badgeFailed, setBadgeFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => openExternalUrl(TON_APP_LISTING_URL)}
      aria-label={t("lab.tonAppVoteAria")}
      title={t("lab.tonAppVoteAria")}
      data-testid={testId}
      className={`flex items-center justify-center active:scale-95 pointer-events-auto ${className ?? ""}`}
      style={{
        minHeight: 36,
        minWidth: 40,
        padding: badgeFailed ? 0 : "4px 8px",
        borderRadius: 999,
        background: "rgba(0, 0, 0, 0.62)",
        border: "1px solid rgba(140, 215, 255, 0.28)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 4px 14px rgba(120, 200, 255, 0.18)",
        cursor: "pointer",
        transition: "transform 0.12s",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      {!badgeFailed ? (
        <img
          src={TON_APP_BADGE_URL}
          alt={t("lab.tonAppBadgeAlt")}
          onError={() => setBadgeFailed(true)}
          loading="lazy"
          draggable={false}
          style={{
            height: 22,
            width: "auto",
            maxWidth: 88,
            display: "block",
            objectFit: "contain",
          }}
        />
      ) : (
        <span
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GramDiamondIcon size={22} />
        </span>
      )}
    </button>
  );
}
