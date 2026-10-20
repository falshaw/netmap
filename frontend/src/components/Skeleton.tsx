export function SkeletonBlock({
  height = 120,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ height }} aria-hidden />;
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading dashboard">
      <SkeletonBlock height={56} className="max-w-[320px]" />
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonBlock height={240} />
        <SkeletonBlock height={240} />
        <SkeletonBlock height={240} />
      </div>
      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <SkeletonBlock height={260} />
        <SkeletonBlock height={260} />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} height={56} />
      ))}
    </div>
  );
}
