export default function BoardLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-3">
        <div className="h-6 w-36 bg-slate-200 rounded animate-pulse hidden md:block" />
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse flex-1 max-w-xs" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-slate-200 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Kanban skeleton */}
      <div className="hidden md:flex flex-1 overflow-x-auto p-6 gap-4">
        {[
          { count: 3, w: 'w-40' },
          { count: 2, w: 'w-32' },
          { count: 4, w: 'w-36' },
          { count: 1, w: 'w-28' },
        ].map((col, i) => (
          <div key={i} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 min-w-[280px] w-72">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <div className={`h-4 ${col.w} bg-slate-200 rounded animate-pulse`} />
              <div className="h-5 w-6 bg-slate-200 rounded-full animate-pulse" />
            </div>
            <div className="p-3 space-y-2">
              {Array.from({ length: col.count }).map((_, j) => (
                <div key={j} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                  <div className="h-4 w-44 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                  <div className="flex gap-1 mt-1">
                    <div className="h-5 w-14 bg-slate-100 rounded animate-pulse" />
                    <div className="h-5 w-14 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile skeleton */}
      <div className="md:hidden flex-1 p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
