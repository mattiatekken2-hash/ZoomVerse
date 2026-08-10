import { useState, useEffect, useCallback, memo } from "react";
import type { Planet } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { getPlanetDisplayName } from "../utils/planetNames";
import { fetchPvpLobby, type PvpLobbyEntry } from "../utils/api";
import PvPModal from "../components/PvPModal";
import { PlanetOrb } from "../components/PlanetOrb";

interface Props {
  telegramId: string | null;
  planets: Planet[];
  onFlushPlanets?: () => Promise<void>;
  onPlanetTransferred?: () => void;
  visible: boolean;
}

function PvpLobbyPageBase({ telegramId, planets, onFlushPlanets, onPlanetTransferred, visible }: Props) {
  const [selected, setSelected] = useState<Planet | null>(null);
  const [pvpPlanet, setPvpPlanet] = useState<Planet | null>(null);
  const [lobbyEntries, setLobbyEntries] = useState<PvpLobbyEntry[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loadingLobby, setLoadingLobby] = useState(false);

  // Available planets: not listed in market, not burning
  const availablePlanets = planets.filter((p) => !p.isListedInMarket);

  const refreshLobby = useCallback(async () => {
    setLoadingLobby(true);
    try {
      const [lobbyRes, onlineRes] = await Promise.all([
        fetchPvpLobby(),
        fetch(`/api/online-count?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ count: 0 })),
      ]);
      setLobbyEntries(lobbyRes.entries ?? []);
      setOnlineCount(onlineRes.count ?? 0);
    } finally {
      setLoadingLobby(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refreshLobby();
    const id = setInterval(refreshLobby, 4000);
    return () => clearInterval(id);
  }, [visible, refreshLobby]);

  // Auto-select first planet when list loads
  useEffect(() => {
    if (availablePlanets.length > 0 && !selected) {
      setSelected(availablePlanets[0]!);
    }
  }, [availablePlanets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    if (!selected || !telegramId) return;
    setPvpPlanet(selected);
  };

  const handleChallenge = (entry: PvpLobbyEntry) => {
    // Challenge: enter queue with selected planet — the engine will auto-match
    if (!selected || !telegramId) return;
    setPvpPlanet(selected);
  };

  const rarityColor: Record<string, string> = {
    BASIC: "#a0a0b0",
    RARE: "#4fc3f7",
    EPIC: "#ab47bc",
    GOLD: "#ffd700",
    MYTHIC: "#ff6b35",
    PLASMA: "#e91e63",
    MUSHROOM: "#66bb6a",
    NOVA: "#26c6da",
    BLACK: "#546e7a",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "linear-gradient(180deg, #0d0008 0%, #0a0012 100%)",
        overflowY: "auto",
        paddingBottom: 24,
      }}
    >
      <style>{`
        @keyframes pvp-lobby-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        @keyframes pvp-lobby-glow {
          0%,100% { box-shadow: 0 0 18px rgba(255,40,80,0.35); }
          50%      { box-shadow: 0 0 36px rgba(255,40,80,0.65); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "20px 16px 12px",
          background: "linear-gradient(180deg, rgba(180,0,40,0.18) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255,40,80,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>⚔️</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#ff3355", letterSpacing: 2 }}>PVP LOBBY</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>Sfida i giocatori in tempo reale</div>
            </div>
          </div>
          {/* Online indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 12,
              background: "rgba(0,200,80,0.1)",
              border: "1px solid rgba(0,200,80,0.25)",
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#00e676",
                animation: "pvp-lobby-pulse 2s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#00e676" }}>{onlineCount} online</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 14px", flex: 1 }}>

        {/* Planet selector */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 8 }}>
            SELEZIONA PIANETA
          </div>
          {availablePlanets.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                textAlign: "center",
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
              }}
            >
              🪐 Nessun pianeta disponibile.<br />
              <span style={{ fontSize: 11 }}>Craftane uno nel LAB!</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {availablePlanets.map((p) => {
                const cfg = PLANET_CONFIG[p.name];
                const isSelected = selected?.id === p.id;
                const rCol = rarityColor[p.name] ?? "#a0a0b0";
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{
                      flexShrink: 0,
                      width: 88,
                      padding: "10px 6px",
                      borderRadius: 14,
                      background: isSelected
                        ? `linear-gradient(135deg, rgba(255,40,80,0.18), rgba(180,0,40,0.12))`
                        : "rgba(255,255,255,0.04)",
                      border: isSelected
                        ? "1.5px solid rgba(255,40,80,0.6)"
                        : "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 150ms",
                      boxShadow: isSelected ? "0 0 12px rgba(255,40,80,0.25)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                      <PlanetOrb color={p.color} size={40} />
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: rCol, letterSpacing: 0.5 }}>
                      {cfg?.label ?? p.name}
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {p.rate.toFixed(0)} Z/h
                    </div>
                    {p.float != null && (
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        Float {p.float.toFixed(2)}
                      </div>
                    )}
                    {p.durability != null && (
                      <div style={{ fontSize: 8, color: p.durability > 50 ? "#66bb6a" : p.durability > 20 ? "#ffb300" : "#ef5350", marginTop: 1 }}>
                        🛡 {p.durability}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA: Cerca Partita */}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleSearch}
            disabled={!selected || !telegramId}
            style={{
              width: "100%",
              padding: "15px 0",
              borderRadius: 16,
              border: "none",
              background: selected && telegramId
                ? "linear-gradient(135deg, #c81024, #ff3355)"
                : "rgba(255,255,255,0.06)",
              color: selected && telegramId ? "#fff" : "rgba(255,255,255,0.3)",
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: 2,
              cursor: selected && telegramId ? "pointer" : "default",
              animation: selected && telegramId ? "pvp-lobby-glow 2s ease-in-out infinite" : "none",
              transition: "all 200ms",
            }}
          >
            ⚔️ CERCA PARTITA
          </button>
        </div>

        {/* Queue list */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
              IN ATTESA DI SFIDANTE
            </div>
            <div
              style={{
                fontSize: 10,
                color: lobbyEntries.length > 0 ? "#ff4466" : "rgba(255,255,255,0.3)",
                fontWeight: 700,
              }}
            >
              {lobbyEntries.length} {lobbyEntries.length === 1 ? "giocatore" : "giocatori"}
            </div>
          </div>

          {loadingLobby && lobbyEntries.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12, padding: 20 }}>
              Caricamento...
            </div>
          ) : lobbyEntries.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>😴</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                Nessuno in coda — sii il primo!
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lobbyEntries
                .filter((e) => e.telegramId !== telegramId)
                .map((entry) => {
                  const rCol = rarityColor[entry.planet?.name ?? "BASIC"] ?? "#a0a0b0";
                  const waitSec = Math.floor((Date.now() - entry.joinedAt) / 1000);
                  const waitStr = waitSec < 60 ? `${waitSec}s` : `${Math.floor(waitSec / 60)}m`;
                  return (
                    <div
                      key={entry.telegramId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: 14,
                        background: "rgba(255,40,80,0.06)",
                        border: "1px solid rgba(255,40,80,0.18)",
                      }}
                    >
                      {/* Avatar placeholder */}
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #ff3355, #8b0020)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 900,
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {(entry.username ?? entry.telegramId).charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.username ? `@${entry.username}` : `Player ${entry.telegramId.slice(-4)}`}
                        </div>
                        <div style={{ fontSize: 10, color: rCol, marginTop: 1, fontWeight: 600 }}>
                          {entry.planet?.name ?? "?"} · {(entry.planet?.rate ?? 0).toFixed(0)} Z/h
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                          In attesa da {waitStr}
                        </div>
                      </div>

                      {/* Challenge button */}
                      <button
                        onClick={() => handleChallenge(entry)}
                        disabled={!selected || !telegramId}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,40,80,0.5)",
                          background: selected && telegramId ? "rgba(255,40,80,0.2)" : "rgba(255,255,255,0.05)",
                          color: selected && telegramId ? "#ff4466" : "rgba(255,255,255,0.25)",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: selected && telegramId ? "pointer" : "default",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ⚔️ Sfida
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* PvP Modal (same logic as FarmPage) */}
      {pvpPlanet && telegramId && (
        <PvPModal
          open={!!pvpPlanet}
          onClose={() => setPvpPlanet(null)}
          telegramId={telegramId}
          planet={pvpPlanet}
          onPlanetTransferred={() => {
            window.dispatchEvent(new Event("planets-refresh"));
            onPlanetTransferred?.();
          }}
          onBeforeQueue={onFlushPlanets}
        />
      )}
    </div>
  );
}

export const PvpLobbyPage = memo(PvpLobbyPageBase);
