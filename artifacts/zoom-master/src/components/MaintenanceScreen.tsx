import { useT } from "../i18n/LanguageContext";

interface Props {
  /** Custom message from admin panel — shown under the ZOOM title. */
  message?: string;
}

/** Full-screen maintenance lock — same visual style as boot splash. */
export function MaintenanceScreen({ message }: Props) {
  const { t } = useT();
  const subtitle = (message || "").trim() || t("maint.default");

  return (
    <div
      className="zoom-splash-screen"
      role="status"
      aria-live="polite"
      aria-label={t("maint.title")}
      style={{ zIndex: 2147483645 }}
    >
      <div className="zoom-splash-inner">
        <div className="zoom-splash-spinner" aria-hidden />
        <div className="zoom-splash-title">ZOOM</div>
        <div className="zoom-splash-sub zoom-splash-sub-maint">{subtitle}</div>
      </div>
    </div>
  );
}
