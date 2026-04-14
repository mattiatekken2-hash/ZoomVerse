import { useState } from "react";
import { useGameState } from "./hooks/useGameState";
import { LabPage } from "./pages/LabPage";
import { FarmPage } from "./pages/FarmPage";
import { ShopPage } from "./pages/ShopPage";
import { RankPage } from "./pages/RankPage";

type Tab = "lab" | "farm" | "shop" | "rank";

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: "lab", label: "LAB", icon: "◈" },
  { id: "farm", label: "FARM", icon: "⬡" },
  { id: "shop", label: "SHOP", icon: "◇" },
  { id: "rank", label: "RANK", icon: "★" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("lab");
  const { state, craft, removePlanet, unlockSlot } = useGameState();

  const totalRate = state.planets.reduce((a, p) => a + p.rate, 0);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "100dvh", background: "#020308" }}
    >
      <header className="flex items-center justify-between px-5 py-4 flex-shrink-0 relative z-10">
        <div className="font-black text-lg tracking-widest neon-text">ZOOM.</div>
        <div className="flex items-center gap-3">
          {totalRate > 0 && (
            <div className="text-xs text-muted-foreground font-medium">
              +{totalRate}/hr
            </div>
          )}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full border font-black text-sm"
            style={{
              borderColor: "rgba(0,242,254,0.25)",
              background: "rgba(0,242,254,0.06)",
              boxShadow: "0 0 12px rgba(0,242,254,0.1)",
            }}
            data-testid="balance-display"
          >
            <span style={{ fontSize: 12 }}>🪐</span>
            <span className="neon-text">{Math.floor(state.balance).toLocaleString()}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        <div style={{ display: tab === "lab" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <LabPage
            balance={state.balance}
            taps={state.taps}
            goal={state.goal}
            planets={state.planets}
            maxSlots={state.maxSlots}
            onCraft={craft}
          />
        </div>
        <div style={{ display: tab === "farm" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <FarmPage
            planets={state.planets}
            maxSlots={state.maxSlots}
            balance={state.balance}
            onRemove={removePlanet}
            onUnlock={unlockSlot}
          />
        </div>
        <div style={{ display: tab === "shop" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <ShopPage balance={state.balance} />
        </div>
        <div style={{ display: tab === "rank" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <RankPage
            balance={state.balance}
            totalEarned={state.totalEarned}
            craftsCompleted={state.craftsCompleted}
          />
        </div>
      </main>

      <nav
        className="flex flex-shrink-0 border-t"
        style={{
          height: 72,
          borderColor: "rgba(255,255,255,0.05)",
          background: "rgba(2,3,8,0.95)",
          backdropFilter: "blur(12px)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-90"
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              style={{
                color: isActive ? "#00f2fe" : "rgba(255,255,255,0.25)",
              }}
            >
              <div
                className="text-xl transition-all duration-200"
                style={{
                  textShadow: isActive ? "0 0 10px rgba(0,242,254,0.8)" : "none",
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                }}
              >
                {item.icon}
              </div>
              <div
                className="text-xs font-bold tracking-widest"
                style={{ fontSize: 9 }}
              >
                {item.label}
              </div>
              {isActive && (
                <div
                  className="absolute top-0 h-0.5 w-8 rounded-full"
                  style={{ background: "#00f2fe", boxShadow: "0 0 8px rgba(0,242,254,0.8)" }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
