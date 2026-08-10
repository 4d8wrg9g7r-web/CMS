import { Card } from "./Card";

export function MetricCard({
  label,
  value,
  helperText,
  icon,
}: {
  label: string;
  value: string | number;
  helperText?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <div className="text-3xl font-semibold tracking-tight text-ink">{value}</div>
      {helperText && <div className="text-sm text-ink-secondary">{helperText}</div>}
    </Card>
  );
}
