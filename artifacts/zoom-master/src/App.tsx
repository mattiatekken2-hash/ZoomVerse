import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameState, isFarmActive, isSunActive, SUN_CONFIG } from "./hooks/useGameState";
import { NebulaBackground } from "./components/NebulaBackground";
import { LabPage } from "./pages/LabPage";
import { FarmPage } from "./pages/FarmPage";
import { MarketPage } from "./pages/MarketPage";
import { EarnPage } from "./pages/EarnPage";
import { RankPage } from "./pages/RankPage";
import { ShopPage } from "./pages/ShopPage";
import { haptic } from "./utils/haptic";

type Tab = "lab" | "farm" | "market" | "earn" | "rank" | "shop";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "lab", label: "LAB", icon: "⬡" },
  { id: "farm", label: "FARM", icon: "🪐" },
  { id: "market", label: "MARKET", icon: "💫" },
  { id: "earn", label: "EARN", icon: "🎁" },
  { id: "rank", label: "RANK", icon: "🏆" },
];

const pageVariants = {
  enter: { opacity: 0, y: 12, scale: 0.98 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.99 },
};

const pageTransition = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] };

export default function App() {
  const [tab, setTab] = useState<Tab>("lab");
  const {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet,
    unlockSlot, claimDaily, activateSun, acquireSun, collectSun,
  } = useGameState();

  const planetRate = state.planets.filter(isFarmActive).reduce((a, p) => a + p.rate, 0);
  const sunRate = state.sun && isSunActive(state.sun) ? SUN_CONFIG.rate : 0;
  const totalRate = planetRate + sunRate;

  const renderPage = () => {
    switch (tab) {
      case "lab":
        return (
          <LabPage
            balance={state.balance}
            taps={state.taps}
            goal={state.goal}
            planets={state.planets}
            maxSlots={state.maxSlots}
            currentCraftRarity={state.currentCraftRarity}
            pendingPlanet={state.pendingPlanet}
            onCraft={craft}
            onClaim={claimCraft}
          />
        );
      case "farm":
        return (
          <FarmPage
            planets={state.planets}
            sun={state.sun}
            balance={state.balance}
            maxSlots={state.maxSlots}
            onCollect={collectPlanet}
            onCollectSun={collectSun}
            onActivateSun={activateSun}
            onUnlockSlot={unlockSlot}
            onBurn={burnPlanet}
            onStartFarming={startFarming}
            onStopFarming={stopFarming}
            onSell={listPlanet}
            onUnlist={unlistPlanet}
          />
        );
      case "market":
        return (
          <MarketPage
            balance={state.balance}
            myListings={state.planets}
            maxSlots={state.maxSlots}
            onBuy={buyPlanet}
            onUnlist={unlistPlanet}
          />
        );
      case "earn":
        return (
          <EarnPage
            referralCode={state.referralCode}
            referralCount={state.referralCount}
            lastDailyClaimAt={state.lastDailyClaimAt}
            onClaimDaily={claimDaily}
            onRedeemCode={redeemCode}
          />
        );
      case "rank":
        return (
          <RankPage
            balance={state.balance}
            seasonPoolEarned={state.seasonPoolEarned}
            activeFarmRate={totalRate}
            totalTonSpent={state.totalTonSpent}
            feedEvents={state.feedEvents}
          />
        );
      case "shop":
        return <ShopPage balance={state.balance} hasSun={!!state.sun?.isOwned} onAcquireSun={acquireSun} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col overflow-hidden relative" style={{ height: "100dvh", background: "#060810" }}>
      <NebulaBackground />

      <header
        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 relative z-20"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="font-black text-lg tracking-widest neon-text cursor-pointer"
          onClick={() => { haptic(5); setTab("lab"); }}
        >
          ZOOM
        </div>
        <div className="flex items-center gap-3">
          {totalRate > 0 && (
            <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              +{totalRate.toLocaleString()}/hr
            </div>
          )}
          <div
            className="glass-neon flex items-center gap-1.5 px-3.5 py-2 rounded-full font-black text-sm cursor-pointer"
            onClick={() => { haptic(5); setTab("shop"); }}
            data-testid="balance-display"
          >
            <span style={{ fontSize: 13 }}>🪐</span>
            <span className="neon-text">{Math.floor(state.balance).toLocaleString()}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative z-10" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav
        className="flex-shrink-0 relative z-20"
        style={{
          height: 70,
          background: "rgba(6,8,16,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex h-full">
          {NAV.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all duration-150 active:scale-90"
                onClick={() => { haptic(5); setTab(item.id); }}
                data-testid={`nav-${item.id}`}
                style={{ color: isActive ? "#00f2fe" : "rgba(255,255,255,0.2)" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full"
                    style={{ background: "#00f2fe", boxShadow: "0 0 10px rgba(0,242,254,0.9)" }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <motion.div
                  animate={{ scale: isActive ? 1.15 : 1 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    fontSize: 17,
                    textShadow: isActive ? "0 0 12px rgba(0,242,254,0.9)" : "none",
                  }}
                >
                  {item.icon}
                </motion.div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
