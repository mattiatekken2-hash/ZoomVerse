/** B&W isometric grid backdrop for the Lab forge viewport. */
export function LabGridBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
      data-testid="lab-grid-bg"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
          opacity: 0.55,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 50% 55%, rgba(255,255,255,0.04) 0%, transparent 70%),
            linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 35%, rgba(0,0,0,0.35) 100%)
          `,
        }}
      />
    </div>
  );
}
