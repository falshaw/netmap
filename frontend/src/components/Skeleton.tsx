const shimmerStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
  borderRadius: 8,
};

export function SkeletonCard({
  height = 120,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        ...shimmerStyle,
        height,
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 14,
      }}
    />
  );
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg ${className}`}
      style={{ background: "rgba(255,255,255,0.01)" }}
    >
      <div className="w-9 h-9 rounded-lg flex-shrink-0" style={shimmerStyle} />
      <div className="flex-1 space-y-2">
        <div style={{ ...shimmerStyle, height: 12, width: "60%" }} />
        <div style={{ ...shimmerStyle, height: 10, width: "40%" }} />
      </div>
      <div
        style={{ ...shimmerStyle, height: 22, width: 70, borderRadius: 20 }}
      />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ padding: "24px 28px" }} className="grid gap-5">
      <div
        className="grid gap-5 dashboard-grid"
        style={{ gridTemplateColumns: "1.2fr 1fr" }}
      >
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
        <SkeletonCard height={320} />
        <SkeletonCard height={150} />
        <SkeletonCard height={160} />
      </div>
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
