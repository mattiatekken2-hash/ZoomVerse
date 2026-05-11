const FONT_LINK_ID = "zoom-pixel-font";
if (typeof document !== "undefined" && !document.getElementById(FONT_LINK_ID)) {
  const l = document.createElement("link");
  l.id = FONT_LINK_ID;
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap";
  document.head.appendChild(l);
}

type Pix = (string | 0)[][];

const P = {
  o: "#ff8c2a", O: "#ffb84d", y: "#ffe066", w: "#ffffff",
  r: "#ff4d4d", R: "#b21f1f", p: "#c77dff", P: "#7b2cbf",
  b: "#4cc9f0", B: "#1e6091", g: "#7bd389", G: "#2f9e44",
  k: "#0f0a1e", d: "#2a1f4d", l: "#5b3aa0", s: "#e0aaff",
  v: "#240046", V: "#10002b", c: "#ffd700",
} as const;

function px(grid: Pix, scale = 6) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${scale}px)`,
        gridTemplateRows: `repeat(${rows}, ${scale}px)`,
        imageRendering: "pixelated",
      }}
    >
      {grid.flatMap((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${y}-${x}`}
            style={{
              width: scale,
              height: scale,
              background: cell === 0 ? "transparent" : (cell as string),
            }}
          />
        ))
      )}
    </div>
  );
}

const sun: Pix = [
  [0,0,0,0,P.y,P.y,P.y,P.y,0,0,0,0],
  [0,0,P.y,P.O,P.O,P.O,P.O,P.O,P.O,P.y,0,0],
  [0,P.y,P.O,P.O,P.o,P.o,P.o,P.o,P.O,P.O,P.y,0],
  [0,P.O,P.O,P.o,P.o,P.w,P.w,P.o,P.o,P.O,P.O,0],
  [P.y,P.O,P.o,P.o,P.w,P.w,P.w,P.o,P.o,P.o,P.O,P.y],
  [P.y,P.O,P.o,P.w,P.w,P.y,P.y,P.w,P.w,P.o,P.O,P.y],
  [P.y,P.O,P.o,P.w,P.w,P.y,P.y,P.w,P.w,P.o,P.O,P.y],
  [P.y,P.O,P.o,P.o,P.w,P.w,P.w,P.o,P.o,P.o,P.O,P.y],
  [0,P.O,P.O,P.o,P.o,P.w,P.w,P.o,P.o,P.O,P.O,0],
  [0,P.y,P.O,P.O,P.o,P.o,P.o,P.o,P.O,P.O,P.y,0],
  [0,0,P.y,P.O,P.O,P.O,P.O,P.O,P.O,P.y,0,0],
  [0,0,0,0,P.y,P.y,P.y,P.y,0,0,0,0],
];

function planet(palette: { dark: string; mid: string; light: string; spot: string; ring?: string }, withRing = false): Pix {
  const { dark: D, mid: M, light: L, spot: S } = palette;
  const R = palette.ring ?? 0;
  return [
    [0,0,0,R,R,R,R,R,R,R,R,0,0,0],
    [0,0,R,0,0,0,0,0,0,0,0,R,0,0],
    [0,R,0,0,D,M,M,M,D,0,0,0,R,0],
    [0,R,0,D,M,L,L,M,M,D,0,0,0,R],
    [R,0,0,D,L,L,S,L,M,M,D,0,0,R],
    [R,0,D,M,L,S,L,L,L,M,M,D,0,R],
    [R,0,D,M,L,L,L,M,L,M,M,D,0,R],
    [R,0,D,M,M,L,M,M,M,M,M,D,0,R],
    [R,0,0,D,M,M,M,M,M,M,D,0,0,R],
    [0,R,0,D,M,M,M,D,M,D,0,0,R,0],
    [0,R,0,0,D,D,D,D,D,0,0,0,R,0],
    [0,0,R,0,0,0,0,0,0,0,0,R,0,0],
    [0,0,0,R,R,R,R,R,R,R,R,0,0,0],
  ] as Pix;
}

const planetGold = planet({ dark: "#7a4f00", mid: P.O, light: P.y, spot: P.w, ring: P.c });
const planetCosmic = planet({ dark: P.v, mid: P.P, light: P.p, spot: P.s, ring: P.l });
const planetVoid = planet({ dark: "#000000", mid: P.V, light: P.l, spot: P.s });
const planetBasic = planet({ dark: P.B, mid: P.b, light: P.s, spot: P.w });

function PixelButton({ children, color = P.o, onClick }: { children: React.ReactNode; color?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 10,
        color: P.k,
        background: color,
        padding: "10px 14px",
        border: "none",
        boxShadow: `inset -3px -3px 0 0 rgba(0,0,0,.35), inset 3px 3px 0 0 rgba(255,255,255,.4), 0 4px 0 0 ${P.k}`,
        cursor: "pointer",
        letterSpacing: 1,
      }}
    >
      {children}
    </button>
  );
}

function HudChip({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: P.v,
        border: `2px solid ${color}`,
        padding: "4px 8px",
        boxShadow: `inset -2px -2px 0 0 rgba(0,0,0,.4), 0 2px 0 0 ${P.k}`,
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 9,
        color: P.w,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ color }}>{label}</span>
    </div>
  );
}

function Slot({ children, label, time }: { children?: React.ReactNode; label: string; time?: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: 110,
        height: 110,
        background: "rgba(36,0,70,.55)",
        border: `2px dashed ${P.l}`,
        boxShadow: `inset -3px -3px 0 0 rgba(0,0,0,.35)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      {children ?? (
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 9,
            color: P.s,
            opacity: 0.6,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          + LOCK
          <br />
          250
        </div>
      )}
      {time && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            right: 4,
            fontFamily: "'VT323', monospace",
            fontSize: 14,
            color: P.y,
            background: "rgba(0,0,0,.55)",
            padding: "1px 4px",
            textAlign: "center",
            letterSpacing: 1,
          }}
        >
          {time}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 4,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 7,
          color: P.s,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Star({ x, y, size = 2, c = "#ffffff" }: { x: number; y: number; size?: number; c?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        background: c,
        boxShadow: `0 0 ${size * 2}px ${c}`,
      }}
    />
  );
}

const STARS = Array.from({ length: 60 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const x = (seed % 380) + 5;
  const y = ((seed * 7) % 760) + 5;
  const size = ((seed % 7) > 5 ? 3 : 2);
  const c = (seed % 11) === 0 ? P.y : (seed % 7) === 0 ? P.b : P.w;
  return { x, y, size, c, key: i };
});

export function PixelFarm() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${P.k} 0%, ${P.v} 60%, ${P.d} 100%)`,
        display: "flex",
        justifyContent: "center",
        padding: 0,
        fontFamily: "'Press Start 2P', monospace",
        color: P.w,
        imageRendering: "pixelated",
      }}
    >
      <div
        style={{
          width: 390,
          minHeight: "100vh",
          position: "relative",
          overflow: "hidden",
          paddingBottom: 100,
        }}
      >
        {STARS.map((s) => (
          <Star key={s.key} {...s} />
        ))}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: -20,
            width: 200,
            height: 80,
            background: "radial-gradient(ellipse, rgba(123,44,191,.4), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 200,
            right: -40,
            width: 200,
            height: 80,
            background: "radial-gradient(ellipse, rgba(76,201,240,.25), transparent 70%)",
          }}
        />

        <div style={{ position: "relative", padding: "12px 12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 32, height: 32, background: P.P,
                  border: `2px solid ${P.s}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                  boxShadow: `inset -2px -2px 0 0 rgba(0,0,0,.4)`,
                }}
              >🧑‍🚀</div>
              <div style={{ fontSize: 8, lineHeight: 1.6 }}>
                <div style={{ color: P.s }}>LESTER</div>
                <div style={{ color: P.y, fontSize: 7 }}>LV 12</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <HudChip icon="✦" label="3,420" color={P.y} />
              <HudChip icon="◈" label="58" color={P.b} />
            </div>
          </div>

          <div
            style={{
              background: P.v,
              border: `3px solid ${P.l}`,
              padding: "10px 12px",
              boxShadow: `inset -3px -3px 0 0 rgba(0,0,0,.4), 0 4px 0 0 ${P.k}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 7, color: P.s, marginBottom: 4 }}>$ZOOM BALANCE</div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: P.y, lineHeight: 1, letterSpacing: 2 }}>
                127,540
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 7, color: P.g, marginBottom: 4 }}>+24/H</div>
              <div style={{ fontSize: 14, color: P.g }}>▲</div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", justifyContent: "center", marginTop: 18, marginBottom: 6 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                width: 180, height: 180,
                background: "radial-gradient(circle, rgba(255,224,102,.45), transparent 65%)",
              }}
            />
          </div>
          <div style={{ position: "relative" }}>
            {px(sun, 6)}
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 8, color: P.y, letterSpacing: 2 }}>★ SUN ACTIVE ★</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: P.s, marginTop: 4 }}>
            stardust in 03:42:11
          </div>
        </div>

        <div style={{ padding: "0 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: P.w, letterSpacing: 1 }}>WHITE FARM</div>
            <div style={{ fontSize: 7, color: P.s }}>4 / 4 SLOTS</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, justifyItems: "center" }}>
            <Slot label="W1" time="08:14:22">
              <div style={{ marginTop: 6 }}>{px(planetCosmic, 5)}</div>
            </Slot>
            <Slot label="W2" time="14:02:09">
              <div style={{ marginTop: 6 }}>{px(planetGold, 5)}</div>
            </Slot>
            <Slot label="W3" time="READY!">
              <div style={{ marginTop: 6 }}>{px(planetVoid, 5)}</div>
            </Slot>
            <Slot label="W4" time="22:51:00">
              <div style={{ marginTop: 6, filter: "saturate(.6)" }}>{px(planetBasic, 5)}</div>
            </Slot>
            <Slot label="W5" />
            <Slot label="W6" />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18, padding: "0 12px" }}>
          <PixelButton color={P.O}>🔨 CRAFT</PixelButton>
          <PixelButton color={P.g}>✦ COLLECT</PixelButton>
          <PixelButton color={P.p}>🎰 SPIN</PixelButton>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: P.v,
            borderTop: `3px solid ${P.l}`,
            padding: "10px 8px",
            display: "flex",
            justifyContent: "space-around",
            boxShadow: `0 -3px 0 0 ${P.k}`,
          }}
        >
          {[
            { i: "🌍", l: "FARM", a: true },
            { i: "🛒", l: "SHOP" },
            { i: "💱", l: "MARKET" },
            { i: "🏆", l: "HOF" },
            { i: "👥", l: "REFER" },
          ].map((tab) => (
            <div key={tab.l} style={{ textAlign: "center", opacity: tab.a ? 1 : 0.55 }}>
              <div style={{ fontSize: 18 }}>{tab.i}</div>
              <div style={{ fontSize: 7, color: tab.a ? P.y : P.s, marginTop: 4, letterSpacing: 1 }}>{tab.l}</div>
              {tab.a && (
                <div style={{ height: 2, background: P.y, marginTop: 3, boxShadow: `0 0 4px ${P.y}` }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
