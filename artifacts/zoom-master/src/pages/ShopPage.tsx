interface ShopPageProps {
  balance: number;
}

const ITEMS = [
  { id: "boost-2x", name: "2x Craft Speed", desc: "Halve the taps needed to craft", cost: 500, icon: "⚡", color: "#00f2fe" },
  { id: "rate-boost", name: "Farm Rate +50%", desc: "All planets earn 50% more", cost: 1200, icon: "🌱", color: "#00e676" },
  { id: "rare-up", name: "Rare+ Odds", desc: "Doubles rare planet chances", cost: 800, icon: "✨", color: "#ffd700" },
  { id: "auto-craft", name: "Auto Crafter", desc: "Crafts one planet every 2 minutes", cost: 2500, icon: "🤖", color: "#c471ed" },
];

export function ShopPage({ balance }: ShopPageProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-xl tracking-tight">Shop</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Power up your operation</p>
      </div>

      <div className="px-4 py-2 flex flex-col gap-3">
        {ITEMS.map((item) => {
          const canAfford = balance >= item.cost;
          return (
            <div
              key={item.id}
              className="rounded-2xl border p-4 flex items-center gap-4"
              style={{
                borderColor: canAfford ? item.color + "33" : "rgba(255,255,255,0.06)",
                background: canAfford ? item.color + "08" : "transparent",
              }}
              data-testid={`shop-item-${item.id}`}
            >
              <div
                className="text-2xl w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: item.color + "15" }}
              >
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{item.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
              <button
                className="flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-30"
                style={{
                  background: canAfford ? item.color : "rgba(255,255,255,0.05)",
                  color: canAfford ? "#000" : "rgba(255,255,255,0.3)",
                  boxShadow: canAfford ? `0 0 12px ${item.color}60` : "none",
                }}
                disabled={!canAfford}
                data-testid={`button-buy-${item.id}`}
              >
                {item.cost}
              </button>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-4 text-center text-xs text-muted-foreground opacity-50">
        Shop upgrades coming soon — keep farming!
      </div>
    </div>
  );
}
