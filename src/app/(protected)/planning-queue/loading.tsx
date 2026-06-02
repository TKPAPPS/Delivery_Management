export default function Loading() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="h-6 w-44 bg-slate-200 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
