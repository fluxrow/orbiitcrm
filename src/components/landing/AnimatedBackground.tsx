export default function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated gradient */}
      <div className="absolute inset-0 animate-gradient-shift opacity-30"
        style={{
          background: "linear-gradient(135deg, hsl(187 92% 50% / 0.15), hsl(260 70% 55% / 0.12), hsl(187 92% 50% / 0.08), hsl(260 70% 55% / 0.15))",
          backgroundSize: "400% 400%",
        }}
      />

      {/* Tech grid */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(187 92% 50% / 0.4) 1px, transparent 1px),
            linear-gradient(90deg, hsl(187 92% 50% / 0.4) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] animate-float" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-[hsl(260_70%_55%/0.06)] blur-[120px] animate-float-delayed" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/3 blur-[100px] animate-float" />
    </div>
  );
}
