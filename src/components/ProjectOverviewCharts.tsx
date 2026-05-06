interface StatusSlice {
  label: string;
  value: number;
  color: string;
}

interface ProjectCompletion {
  project: string;
  completion: number;
}

export function ProjectOverviewCharts({
  status,
  completionByProject,
}: {
  status: StatusSlice[];
  completionByProject: ProjectCompletion[];
}) {
  const total = Math.max(1, status.reduce((s, x) => s + x.value, 0));

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Feature status distribution</h2>
        <div className="space-y-2">
          {status.map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>{s.label}</span>
                  <span>{s.value} ({pct}%)</span>
                </div>
                <div className="h-2 rounded bg-slate-100 overflow-hidden">
                  <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Project completion comparison</h2>
        <div className="space-y-2">
          {completionByProject.length === 0 && <div className="text-sm text-slate-500">No project data yet.</div>}
          {completionByProject.map((p) => (
            <div key={p.project} className="grid grid-cols-[140px_1fr_40px] gap-2 items-center">
              <div className="text-xs text-slate-600 truncate" title={p.project}>{p.project}</div>
              <div className="h-2 rounded bg-slate-100 overflow-hidden">
                <div className="h-full bg-brand-navy" style={{ width: `${Math.max(0, Math.min(100, p.completion))}%` }} />
              </div>
              <div className="text-xs text-slate-500 text-right">{p.completion}%</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
