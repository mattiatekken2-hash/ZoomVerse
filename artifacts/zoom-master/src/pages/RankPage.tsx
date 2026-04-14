interface RankPageProps {
  balance: number;
  totalEarned: number;
  craftsCompleted: number;
}

const TIERS = [
  { name: "Cadet", minEarned: 0, color: "#888", icon: "○" },
  { name: "Pilot", minEarned: 500, color: "#00f2fe", icon: "◎" },
  { name: "Commander", minEarned: 2000, color: "#00e676", icon: "◉" },
  { name: "Admiral", minEarned: 10000, color: "#ffd700", icon: "★" },
  { name: "Galaxy Lord", minEarned: 50000, color: "#c471ed", icon: "✦" },
  { name: "Void Master", minEarned: 200000, color: "#ff416c", icon: "⬡" },
];

const MOCK_LEADERBOARD = [
  { rank: 1, name: "cosmicwolf", earned: 485200, color: "#ff416c" },
  { rank: 2, name: "stardust99", earned: 312500, color: "#c471ed" },
  { rank: 3, name: "voidwalker", earned: 198700, color: "#ffd700" },
  { rank: 4, name: "nebula_king", earned: 87300, color: "#00f2fe" },
  { rank: 5, name: "YOU", earned: 0, color: "#00e676", isYou: true },
];

export function RankPage({ totalEarned, craftsCompleted }: RankPageProps) {
  const currentTier = [...TIERS].reverse().find((t) => totalEarned >= t.minEarned) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];

  const progress = nextTier
    ? Math.min((totalEarned - currentTier.minEarned) / (nextTier.minEarned - currentTier.minEarned), 1)
    : 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-xl tracking-tight">Ranking</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Your planetary standing</p>
      </div>

      <div className="px-5 py-4 flex-shrink-0">
        <div
          className="rounded-2xl border p-4 flex flex-col gap-3"
          style={{ borderColor: currentTier.color + "44", background: currentTier.color + "08" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="text-4xl font-black w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: currentTier.color + "20", color: currentTier.color, boxShadow: `0 0 20px ${currentTier.color}40` }}
            >
              {currentTier.icon}
            </div>
            <div>
              <div className="font-black text-lg tracking-wide" style={{ color: currentTier.color }}>
                {currentTier.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {Math.floor(totalEarned).toLocaleString()} coins earned &bull; {craftsCompleted} crafts
              </div>
            </div>
          </div>

          {nextTier && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progress to {nextTier.name}</span>
                <span style={{ color: nextTier.color }}>{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress * 100}%`,
                    background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier.color})`,
                    boxShadow: `0 0 8px ${nextTier.color}80`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1 text-right">
                {nextTier.minEarned.toLocaleString()} coins needed
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="text-xs text-muted-foreground font-semibold tracking-widest uppercase mb-3">
          Global Leaderboard
        </div>
        <div className="flex flex-col gap-2">
          {MOCK_LEADERBOARD.map((entry) => (
            <div
              key={entry.rank}
              className="rounded-xl border flex items-center gap-3 px-4 py-3"
              style={{
                borderColor: entry.isYou ? entry.color + "44" : "rgba(255,255,255,0.06)",
                background: entry.isYou ? entry.color + "10" : "transparent",
              }}
              data-testid={`leaderboard-rank-${entry.rank}`}
            >
              <div
                className="font-black text-sm w-6 text-center flex-shrink-0"
                style={{ color: entry.rank <= 3 ? entry.color : "rgba(255,255,255,0.4)" }}
              >
                {entry.rank}
              </div>
              <div
                className="flex-1 font-bold text-sm"
                style={{ color: entry.isYou ? entry.color : "rgba(255,255,255,0.85)" }}
              >
                {entry.name}
                {entry.isYou && (
                  <span className="text-xs font-normal ml-1 opacity-60">(you)</span>
                )}
              </div>
              <div className="text-xs font-bold text-muted-foreground">
                {entry.isYou ? Math.floor(totalEarned).toLocaleString() : entry.earned.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
