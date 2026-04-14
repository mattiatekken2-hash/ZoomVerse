import { useState } from "react";

interface EarnPageProps {
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  onClaimDaily: () => void;
}

const MILESTONES = [
  { count: 5, reward: 500 },
  { count: 20, reward: 2000 },
  { count: 50, reward: 5000 },
  { count: 100, reward: 12000 },
  { count: 200, reward: 30000 },
];

const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

export function EarnPage({ referralCode, referralCount, lastDailyClaimAt, onClaimDaily }: EarnPageProps) {
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const canClaim = now - lastDailyClaimAt >= DAILY_INTERVAL;
  const nextClaimIn = lastDailyClaimAt + DAILY_INTERVAL - now;
  const hLeft = Math.floor(nextClaimIn / 3600000);
  const mLeft = Math.floor((nextClaimIn % 3600000) / 60000);

  const referralLink = `https://t.me/ZoomMasterBot?start=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div
          className="rounded-2xl p-5 border flex flex-col items-center gap-3"
          style={{ borderColor: "rgba(0,242,254,0.15)", background: "rgba(0,242,254,0.04)" }}
        >
          <div className="text-4xl">🎁</div>
          <div className="font-black text-xl tracking-wide neon-text">Daily Reward</div>
          <div className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
            100 $ZOOM every 24 hours. Free.
          </div>
          <button
            className="w-full py-4 rounded-xl font-black text-base tracking-wider uppercase transition-all active:scale-95 border"
            onClick={onClaimDaily}
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
            {canClaim ? "CLAIM 100 $ZOOM" : `${hLeft}h ${mLeft}m remaining`}
          </button>
        </div>

        <div className="rounded-2xl p-5 border" style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(255,215,0,0.03)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-xl">🔗</div>
            <div className="font-black text-base gold-text">Referral Program</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            +20 $ZOOM per new user who joins via your link
          </div>

          <div
            className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between gap-2 border"
            style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(0,0,0,0.3)" }}
          >
            <span className="text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
              {referralLink}
            </span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all active:scale-95"
              style={{
                background: copied ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.1)",
                color: copied ? "#00e676" : "#ffd700",
                border: `1px solid ${copied ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.2)"}`,
              }}
              data-testid="button-copy-referral"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>Your code:</span>
            <span className="font-bold font-mono gold-text">{referralCode}</span>
            <span>·</span>
            <span className="font-bold" style={{ color: "#00e676" }}>{referralCount} invited</span>
          </div>
        </div>

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
                <span className="font-bold neon-text">
                  {referralCount}/{nextMilestone.count}
                </span>
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
              const done = referralCount >= m.count;
              const isCurrent = m === nextMilestone;
              return (
                <div
                  key={m.count}
                  className="flex items-center justify-between py-2 px-3 rounded-xl border"
                  style={{
                    borderColor: done ? "rgba(0,230,118,0.2)" : isCurrent ? "rgba(0,242,254,0.15)" : "rgba(255,255,255,0.05)",
                    background: done ? "rgba(0,230,118,0.05)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div style={{ fontSize: 14 }}>{done ? "✅" : isCurrent ? "⏳" : "○"}</div>
                    <span className="text-xs font-bold" style={{ color: done ? "#00e676" : isCurrent ? "#00f2fe" : "rgba(255,255,255,0.3)" }}>
                      {m.count} invites
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{ color: done ? "#00e676" : "rgba(255,255,255,0.4)" }}>
                    +{m.reward.toLocaleString()} $ZOOM
                  </span>
                </div>
              );
            })}
          </div>

          {prevMilestone && (
            <div className="mt-2 text-center text-xs" style={{ color: "rgba(0,230,118,0.7)" }}>
              Last claimed: {prevMilestone.count} invites milestone ✓
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
