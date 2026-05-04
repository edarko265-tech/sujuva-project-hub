export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 100 ? 'bg-green-500' : v >= 50 ? 'bg-brand-gold' : 'bg-brand-navy';
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-slate-600 mb-1">
          <span>{label}</span>
          <span className="font-semibold">{v}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
