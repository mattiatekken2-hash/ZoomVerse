import { useT } from "../i18n/LanguageContext";
import { WhiteCollectionWidget } from "../components/WhiteCollectionWidget";
import { EarthCollectionWidget } from "../components/EarthCollectionWidget";
import { BlackCollectionWidget } from "../components/BlackCollectionWidget";
import { SupernovaCollectionWidget } from "../components/SupernovaCollectionWidget";
interface CollectionsPageProps {
  telegramId: string | null;
  sunCount: number;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  visible?: boolean;
}

export function CollectionsPage({
  telegramId,
  sunCount,
  whiteCollectionUnlocked,
  whiteCollectionBundles,
  earthCollectionUnlocked,
  earthCollectionBundles,
  blackCollectionUnlocked,
  blackCollectionBundles,
  supernovaCollectionUnlocked,
  supernovaCollectionBundles,
  visible = true,
}: CollectionsPageProps) {
  const { t } = useT();
  if (!visible) return null;

  return (
    <div className="flex flex-col h-full relative overflow-y-auto" style={{ padding: 16 }}>
      <div
        className="font-black text-lg tracking-widest mb-4"
        style={{ color: "#00f2fe", textShadow: "0 0 12px rgba(0,242,254,0.6)" }}
      >
        {t("collections.title")}
      </div>
      <div className="flex flex-col gap-4 pb-20">
        <WhiteCollectionWidget telegramId={telegramId} unlocked={whiteCollectionUnlocked} ownedBundles={whiteCollectionBundles} sunCount={sunCount} />
        <EarthCollectionWidget telegramId={telegramId} unlocked={earthCollectionUnlocked} ownedBundles={earthCollectionBundles} sunCount={sunCount} />
        <BlackCollectionWidget telegramId={telegramId} unlocked={blackCollectionUnlocked} ownedBundles={blackCollectionBundles} />
        <SupernovaCollectionWidget telegramId={telegramId} unlocked={supernovaCollectionUnlocked} ownedBundles={supernovaCollectionBundles} />
      </div>
    </div>
  );
}
