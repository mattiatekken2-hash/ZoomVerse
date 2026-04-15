import { useState } from "react";


interface EarnPageProps {
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  referralSpeedBonus: number;
  referredBy: string | null;
  claimedMilestones: number[];
  onClaimDaily: () => void;
  onRedeemCode: (code: string) => { success: boolean; amount?: number; isSun?: boolean; error?: string };
}

const MILESTONES = [
  { count: 5, reward: 500 },
  { count: 10, reward: 1000 },
  { count: 20, reward: 2000 },
  { count: 50, reward: 5000 },
  { count: 100, reward: 12000 },
  { count: 200, reward: 30000 },
];

const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

export function EarnPage({ referralCode, referralCount, lastDailyClaimAt, referralSpeedBonus, referredBy, claimedMilestones, onClaimDaily, onRedeemCode }: EarnPageProps) {
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ type: "success" | "error" | "sun"; message: string } | null>(null);

  const now = Date.now();
  const canClaim = now - lastDailyClaimAt >= DAILY_INTERVAL;
  const nextClaimIn = lastDailyClaimAt + DAILY_INTERVAL - now;
  const hLeft = Math.floor(nextClaimIn / 3600000);
  const mLeft = Math.floor((nextClaimIn % 3600000) / 60000);

  const referralLink = `https://t.me/ZoomVerse_bot?start=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRedeem = () => {
    if (!redeemInput.trim()) return;
    const result = onRedeemCode(redeemInput);
    if (result.success) {
      if (result.isSun) {
        setRedeemStatus({ type: "sun", message: "☀️ THE SUN added to your inventory! Go to Farm to activate." });
      } else {
        setRedeemStatus({ type: "success", message: `+${result.amount?.toLocaleString()} $ZOOM credited!` });
      }
      setRedeemInput("");
    } else {
      setRedeemStatus({ type: "error", message: result.error || "Invalid code" });
    }
    setTimeout(() => setRedeemStatus(null), 4000);
  };

  const nextMilestone = MILESTONES.find(m => m.count > referralCount);
  const prevMilestone = MILESTONES.filter(m => m.count <= referralCount).pop();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">Earn</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Daily rewards & referrals</p>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-4">
        {/* Daily Claim */}
        <div
          className="rounded-2xl p-5 border flex flex-col items-center gap-3"
          style={{ borderColor: "rgba(0,242,254,0.15)", background: "rgba(0,242,254,0.04)" }}
        >
          <div className="text-4xl">🎁</div>
          <div className="font-black text-xl tracking-wide neon-text">Daily Reward</div>
          <div className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
            50 $ZOOM every 24 hours. Free.
          </div>
          <button
            className="w-full py-4 rounded-xl font-black text-base tracking-wider uppercase transition-all active:scale-95 border"
            onClick={() => onClaimDaily()}
            disabled={!canClaim}
            style={{
              background: canClaim ? "linear-gradient(135deg, #00f2fe, #4facfe)" : "rgba(255,255,255,0.04)",
              color: canClaim ? "#060810" : "rgba(255,255,255,0.2)",
              boxShadow: canClaim ? "0 0 24px rgba(0,242,254,0.4)" : "none",
              borderColor: canClaim ? "transparent" : "rgba(255,255,255,0.06)",
              cursor: canClaim ? "pointer" : "not-allowed",
            }}
            data-testid="button-claim-daily"
          >
            {canClaim ? "CLAIM 50 $ZOOM" : `${hLeft}h ${mLeft}m remaining`}
          </button>
        </div>

        {/* Redeem Code */}
        <div
          className="rounded-2xl p-5 border"
          style={{ borderColor: "rgba(255,179,71,0.2)", background: "rgba(255,179,71,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xl">🎟️</div>
            <div className="font-black text-base" style={{ color: "#ffb347" }}>Redeem Code</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
            Enter a promo or SUN code (SUN-****) to claim instant rewards
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={redeemInput}
              onChange={e => setRedeemInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleRedeem()}
              placeholder=""
              className="flex-1 px-3 py-2.5 rounded-xl text-sm font-mono font-bold uppercase outline-none"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,179,71,0.2)",
                color: "#ffb347",
                letterSpacing: "0.06em",
              }}
              data-testid="input-redeem-code"
            />
            <button
              onClick={handleRedeem}
              className="px-4 py-2.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95"
              style={{
                background: "rgba(255,179,71,0.12)",
                color: "#ffb347",
                border: "1px solid rgba(255,179,71,0.25)",
              }}
              data-testid="button-redeem"
            >
              GO
            </button>
          </div>
          {redeemStatus && (
            <div
              className="mt-2.5 text-xs font-bold text-center py-2.5 rounded-xl"
              style={{
                color: redeemStatus.type === "error" ? "#ff5252" : redeemStatus.type === "sun" ? "#ffb347" : "#00e676",
                background: redeemStatus.type === "error" ? "rgba(255,82,82,0.08)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.1)" : "rgba(0,230,118,0.08)",
                border: `1px solid ${redeemStatus.type === "error" ? "rgba(255,82,82,0.2)" : redeemStatus.type === "sun" ? "rgba(255,179,71,0.25)" : "rgba(0,230,118,0.2)"}`,
              }}
            >
              {redeemStatus.message}
            </div>
          )}
        </div>

        {/* Referral */}
        <div className="rounded-2xl p-5 border" style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(255,215,0,0.03)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-xl">🔗</div>
            <div className="font-black text-base gold-text">Referral Program</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            +20 $ZOOM per new user who joins via your link. Milestone bonuses auto-credited!
          </div>
          <button
            onClick={() => {
              const text = encodeURIComponent("Join Zoom and earn $ZOOM!");
              const url = encodeURIComponent(referralLink);
              window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
            }}
            className="w-full py-3 mb-3 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,179,71,0.1))",
              color: "#ffd700",
              border: "1px solid rgba(255,215,0,0.25)",
            }}
          >
            INVITE FRIENDS
          </button>
          <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>ID:</span>
            <span className="font-bold font-mono gold-text">{referralCode}</span>
            <span>·</span>
            <span className="font-bold" style={{ color: "#00e676" }}>{referralCount} invited</span>
          </div>
        </div>

        {/* Referral Speed Bonus Banner */}
        {referralSpeedBonus > 0 && (
          <div
            className="rounded-2xl p-4 border flex items-center gap-3"
            style={{ borderColor: "rgba(0,230,118,0.25)", background: "rgba(0,230,118,0.06)" }}
          >
            <div className="text-2xl">⚡</div>
            <div className="flex-1">
              <div className="font-black text-sm" style={{ color: "#00e676" }}>
                +{Math.round(referralSpeedBonus * 100)}% Farming Speed Active
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                {referredBy
                  ? `You joined via a friend's invite — enjoy the speed boost!`
                  : "Referral speed bonus active"}
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        <div className="rounded-2xl p-4 border" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <div className="font-black text-sm tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
            Referral Milestones
          </div>
          {nextMilestone && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  Next: {nextMilestone.count} invites → {nextMilestone.reward.toLocaleString()} $ZOOM
                </span>
                <span className="font-bold neon-text">{referralCount}/{nextMilestone.count}</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((referralCount / nextMilestone.count) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #00f2fe, #4facfe)",
                    boxShadow: "0 0 8px rgba(0,242,254,0.6)",
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {MILESTONES.map(m => {
              const reached = referralCount >= m.count;
              const claimed = claimedMilestones.includes(m.count);
              const isCurrent = m === nextMilestone;
              return (
                <div
                  key={m.count}
                  className="flex items-center justify-between py-2 px-3 rounded-xl border"
                  style={{
                    borderColor: claimed ? "rgba(0,230,118,0.2)" : isCurrent ? "rgba(0,242,254,0.15)" : "rgba(255,255,255,0.05)",
                    background: claimed ? "rgba(0,230,118,0.05)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div style={{ fontSize: 14 }}>{claimed ? "✅" : reached ? "🎉" : isCurrent ? "⏳" : "○"}</div>
                    <span className="text-xs font-bold" style={{ color: claimed ? "#00e676" : reached ? "#ffd700" : isCurrent ? "#00f2fe" : "rgba(255,255,255,0.3)" }}>
                      {m.count} invites
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{ color: claimed ? "#00e676" : "rgba(255,255,255,0.4)" }}>
                    {claimed ? "✓ Claimed" : `+${m.reward.toLocaleString()} $ZOOM`}
                  </span>
                </div>
              );
            })}
          </div>
          {claimedMilestones.length > 0 && (
            <div className="mt-2 text-center text-xs" style={{ color: "rgba(0,230,118,0.7)" }}>
              {claimedMilestones.length} milestone{claimedMilestones.length > 1 ? "s" : ""} claimed ✓
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
