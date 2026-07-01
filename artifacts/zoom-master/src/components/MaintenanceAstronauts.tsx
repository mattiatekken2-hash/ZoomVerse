export function MaintenanceAstronauts() {
  return (
    <>
      <style>{`
        @keyframes maint-float-a {
          0%   { transform: translateY(0px) rotate(-4deg); }
          50%  { transform: translateY(-18px) rotate(3deg); }
          100% { transform: translateY(0px) rotate(-4deg); }
        }
        @keyframes maint-float-b {
          0%   { transform: translateY(0px) rotate(5deg) scaleX(-1); }
          50%  { transform: translateY(-14px) rotate(-2deg) scaleX(-1); }
          100% { transform: translateY(0px) rotate(5deg) scaleX(-1); }
        }
        @keyframes maint-float-c {
          0%   { transform: translateY(0px) rotate(0deg); }
          50%  { transform: translateY(-10px) rotate(8deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        @keyframes maint-spark {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          30%, 70% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes maint-spark-2 {
          0%, 100% { opacity: 0; }
          20%, 60% { opacity: 0.9; transform: translateY(-4px); }
        }
        @keyframes maint-wrench {
          0%, 100% { transform: rotate(-15deg); }
          50%       { transform: rotate(15deg); }
        }
        @keyframes maint-antenna-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .maint-astronaut-a { animation: maint-float-a 4.2s ease-in-out infinite; }
        .maint-astronaut-b { animation: maint-float-b 3.8s ease-in-out infinite; animation-delay: -1.2s; }
        .maint-astronaut-c { animation: maint-float-c 5.1s ease-in-out infinite; animation-delay: -2.5s; }
        .maint-spark-1 { animation: maint-spark 1.1s ease-in-out infinite; }
        .maint-spark-2 { animation: maint-spark 0.9s ease-in-out infinite; animation-delay: -0.35s; }
        .maint-spark-3 { animation: maint-spark-2 1.3s ease-in-out infinite; animation-delay: -0.7s; }
        .maint-wrench  { animation: maint-wrench 1.8s ease-in-out infinite; transform-origin: 50% 100%; }
      `}</style>

      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        overflow: "hidden", zIndex: 1,
      }}>
        {/* ── Satellite / Space Station being repaired ── */}
        <div style={{ position: "absolute", top: "14%", left: "50%", transform: "translateX(-50%)" }}>
          <svg width="140" height="64" viewBox="0 0 140 64" shapeRendering="crispEdges" fill="none">
            {/* Main body */}
            <rect x="48" y="24" width="44" height="18" rx="2" fill="#4a5568"/>
            <rect x="52" y="27" width="36" height="12" fill="#2d3748"/>
            {/* Windows */}
            <rect x="56" y="29" width="8" height="8" rx="1" fill="#63b3ed" opacity="0.7"/>
            <rect x="68" y="29" width="8" height="8" rx="1" fill="#63b3ed" opacity="0.5"/>
            <rect x="80" y="29" width="8" height="8" rx="1" fill="#fc8181" opacity="0.6"/>
            {/* Solar panels left */}
            <rect x="4"  y="26" width="40" height="6" rx="1" fill="#2b6cb0" opacity="0.8"/>
            <rect x="4"  y="33" width="40" height="6" rx="1" fill="#2b6cb0" opacity="0.7"/>
            <rect x="42" y="22" width="6"  height="20" rx="1" fill="#4a5568"/>
            {/* Solar panels right */}
            <rect x="96"  y="26" width="40" height="6" rx="1" fill="#2b6cb0" opacity="0.8"/>
            <rect x="96"  y="33" width="40" height="6" rx="1" fill="#2b6cb0" opacity="0.7"/>
            <rect x="92"  y="22" width="6"  height="20" rx="1" fill="#4a5568"/>
            {/* Antenna */}
            <rect x="68" y="12" width="4" height="12" fill="#718096"/>
            <rect x="65" y="10" width="10" height="4" rx="1" fill="#a0aec0"/>
            <circle cx="70" cy="10" r="3" fill="#fc8181" className="maint-antenna-blink"
              style={{ animation: "maint-antenna-blink 1.2s ease-in-out infinite" }}/>
            {/* Damage crack */}
            <polyline points="62,27 65,33 68,30 70,36" stroke="#fc8181" strokeWidth="1" opacity="0.7"/>
            {/* Sparks at damage point */}
            <g className="maint-spark-1" style={{ transformOrigin: "65px 30px" }}>
              <circle cx="65" cy="28" r="2" fill="#ffd700"/>
              <rect x="63" y="26" width="1" height="1" fill="#fff"/>
              <rect x="67" y="25" width="1" height="1" fill="#ffd700"/>
            </g>
            <g className="maint-spark-2" style={{ transformOrigin: "68px 32px" }}>
              <circle cx="68" cy="32" r="1.5" fill="#ff9500"/>
              <rect x="70" y="30" width="1" height="1" fill="#ffd700"/>
            </g>
            <g className="maint-spark-3" style={{ transformOrigin: "63px 34px" }}>
              <circle cx="63" cy="34" r="1" fill="#00e5ff"/>
              <rect x="61" y="32" width="1" height="1" fill="#fff"/>
            </g>
          </svg>
        </div>

        {/* ── Astronaut A (left, with wrench) ── */}
        <div className="maint-astronaut-a" style={{
          position: "absolute", top: "28%", left: "14%",
        }}>
          <svg width="52" height="68" viewBox="0 0 52 68" shapeRendering="crispEdges">
            {/* Helmet */}
            <rect x="13" y="2"  width="26" height="3"  fill="#d4dde6"/>
            <rect x="10" y="5"  width="32" height="3"  fill="#e2eaf0"/>
            <rect x="9"  y="8"  width="34" height="14" fill="#edf2f7"/>
            {/* Visor */}
            <rect x="13" y="10" width="26" height="10" fill="#1a365d"/>
            <rect x="15" y="12" width="8"  height="4"  fill="#2a4a7f" opacity="0.5"/>
            <rect x="15" y="12" width="4"  height="2"  fill="#4a7faa" opacity="0.4"/>
            {/* Helmet bottom */}
            <rect x="10" y="22" width="32" height="3"  fill="#c8d5e0"/>
            {/* Collar */}
            <rect x="16" y="25" width="20" height="3"  fill="#9aa8b5"/>
            {/* Body */}
            <rect x="11" y="28" width="30" height="18" fill="#e2eaf0"/>
            <rect x="14" y="31" width="24" height="3"  fill="#c8d5e0" opacity="0.5"/>
            {/* Chest pack */}
            <rect x="19" y="34" width="14" height="8"  rx="1" fill="#4facfe" opacity="0.7"/>
            <rect x="21" y="36" width="4"  height="2"  fill="#fff" opacity="0.6"/>
            <rect x="27" y="36" width="4"  height="2"  fill="#ff3355" opacity="0.7"/>
            {/* Left arm */}
            <rect x="2"  y="28" width="9"  height="8"  fill="#e2eaf0"/>
            <rect x="2"  y="36" width="9"  height="4"  fill="#c8d5e0"/>
            {/* Right arm + wrench */}
            <rect x="41" y="28" width="9"  height="8"  fill="#e2eaf0"/>
            <rect x="41" y="36" width="9"  height="4"  fill="#c8d5e0"/>
            <g className="maint-wrench">
              <rect x="48" y="22" width="4"  height="14" fill="#ffd700"/>
              <rect x="46" y="22" width="8"  height="3"  rx="1" fill="#ffc200"/>
              <rect x="46" y="33" width="8"  height="3"  rx="1" fill="#ffc200"/>
            </g>
            {/* Legs */}
            <rect x="13" y="46" width="10" height="12" fill="#c8d5e0"/>
            <rect x="29" y="46" width="10" height="12" fill="#c8d5e0"/>
            {/* Boots */}
            <rect x="11" y="58" width="14" height="5"  rx="1" fill="#8a9ab0"/>
            <rect x="27" y="58" width="14" height="5"  rx="1" fill="#8a9ab0"/>
            {/* Backpack */}
            <rect x="9"  y="28" width="3"  height="15" fill="#b0bec5"/>
          </svg>
        </div>

        {/* ── Astronaut B (right, welding) ── */}
        <div className="maint-astronaut-b" style={{
          position: "absolute", top: "25%", right: "12%",
        }}>
          <svg width="52" height="68" viewBox="0 0 52 68" shapeRendering="crispEdges">
            {/* Helmet */}
            <rect x="13" y="2"  width="26" height="3"  fill="#d4dde6"/>
            <rect x="10" y="5"  width="32" height="3"  fill="#e2eaf0"/>
            <rect x="9"  y="8"  width="34" height="14" fill="#edf2f7"/>
            {/* Visor (tinted orange for welder) */}
            <rect x="13" y="10" width="26" height="10" fill="#7b3f00"/>
            <rect x="15" y="12" width="8"  height="4"  fill="#a85c00" opacity="0.5"/>
            <rect x="15" y="12" width="4"  height="2"  fill="#d4840a" opacity="0.4"/>
            {/* Visor glare */}
            <rect x="22" y="11" width="14" height="2"  fill="#ff9500" opacity="0.2"/>
            {/* Helmet bottom */}
            <rect x="10" y="22" width="32" height="3"  fill="#c8d5e0"/>
            {/* Collar */}
            <rect x="16" y="25" width="20" height="3"  fill="#9aa8b5"/>
            {/* Body */}
            <rect x="11" y="28" width="30" height="18" fill="#e2eaf0"/>
            <rect x="14" y="31" width="24" height="3"  fill="#c8d5e0" opacity="0.5"/>
            {/* Chest pack */}
            <rect x="19" y="34" width="14" height="8"  rx="1" fill="#ffd700" opacity="0.7"/>
            <rect x="21" y="36" width="10" height="2"  fill="#fff" opacity="0.5"/>
            {/* Left arm (welder gun) */}
            <rect x="2"  y="28" width="9"  height="8"  fill="#e2eaf0"/>
            <rect x="2"  y="36" width="9"  height="4"  fill="#c8d5e0"/>
            <rect x="0"  y="32" width="4"  height="10" fill="#718096"/>
            <rect x="0"  y="30" width="4"  height="3"  rx="1" fill="#4a5568"/>
            {/* Welder sparks */}
            <g className="maint-spark-1" style={{ transformOrigin: "2px 42px" }}>
              <circle cx="1" cy="42" r="2" fill="#ffd700"/>
              <rect   cx="0" cy="40" width="1" height="1" fill="#fff"/>
            </g>
            <g className="maint-spark-2" style={{ transformOrigin: "0px 44px" }}>
              <circle cx="0" cy="44" r="1.5" fill="#ff9500"/>
            </g>
            {/* Right arm */}
            <rect x="41" y="28" width="9"  height="8"  fill="#e2eaf0"/>
            <rect x="41" y="36" width="9"  height="4"  fill="#c8d5e0"/>
            {/* Legs */}
            <rect x="13" y="46" width="10" height="12" fill="#c8d5e0"/>
            <rect x="29" y="46" width="10" height="12" fill="#c8d5e0"/>
            {/* Boots */}
            <rect x="11" y="58" width="14" height="5"  rx="1" fill="#8a9ab0"/>
            <rect x="27" y="58" width="14" height="5"  rx="1" fill="#8a9ab0"/>
            {/* Backpack */}
            <rect x="40" y="28" width="3"  height="15" fill="#b0bec5"/>
          </svg>
        </div>

        {/* ── Astronaut C (small, floating below, with tablet) ── */}
        <div className="maint-astronaut-c" style={{
          position: "absolute", top: "52%", left: "50%", transform: "translateX(-50%)",
        }}>
          <svg width="36" height="46" viewBox="0 0 36 46" shapeRendering="crispEdges">
            <rect x="9"  y="2"  width="18" height="2"  fill="#d4dde6"/>
            <rect x="7"  y="4"  width="22" height="2"  fill="#e2eaf0"/>
            <rect x="6"  y="6"  width="24" height="10" fill="#edf2f7"/>
            <rect x="9"  y="8"  width="18" height="7"  fill="#1a365d"/>
            <rect x="7"  y="16" width="22" height="2"  fill="#c8d5e0"/>
            <rect x="11" y="18" width="14" height="2"  fill="#9aa8b5"/>
            <rect x="8"  y="20" width="20" height="13" fill="#e2eaf0"/>
            <rect x="10" y="23" width="16" height="2"  fill="#c8d5e0" opacity="0.5"/>
            {/* Tablet */}
            <rect x="0"  y="20" width="10" height="8"  rx="1" fill="#2d3748"/>
            <rect x="1"  y="21" width="8"  height="6"  rx="1" fill="#4facfe" opacity="0.7"/>
            <rect x="2"  y="22" width="5"  height="1"  fill="#fff" opacity="0.5"/>
            <rect x="2"  y="24" width="5"  height="1"  fill="#fff" opacity="0.35"/>
            <rect x="28" y="20" width="8"  height="8"  fill="#e2eaf0"/>
            <rect x="9"  y="33" width="7"  height="8"  fill="#c8d5e0"/>
            <rect x="20" y="33" width="7"  height="8"  fill="#c8d5e0"/>
            <rect x="7"  y="41" width="10" height="4"  rx="1" fill="#8a9ab0"/>
            <rect x="19" y="41" width="10" height="4"  rx="1" fill="#8a9ab0"/>
          </svg>
        </div>

        {/* Tether lines between astronauts and satellite */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 390 844" preserveAspectRatio="none"
        >
          <line x1="82"  y1="305" x2="170" y2="200" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4"/>
          <line x1="310" y1="292" x2="222" y2="200" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4"/>
          <line x1="195" y1="478" x2="195" y2="260" stroke="rgba(255,255,255,0.1)"  strokeWidth="1"   strokeDasharray="3 5"/>
        </svg>
      </div>
    </>
  );
}
