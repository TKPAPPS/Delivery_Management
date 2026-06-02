export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-6" />
      <div className="h-10 w-full bg-slate-100 rounded-lg animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
