import "./analytics.css";

export type BarStatusKey = "good" | "warning" | "serious" | "critical";

export interface BarListItem {
  label: string;
  value: number;
  statusKey?: BarStatusKey;
}

interface BarListProps {
  items: BarListItem[];
  emptyMessage?: string;
  formatValue?: (value: number) => string;
}

export function BarList({ items, emptyMessage = "No data yet.", formatValue }: BarListProps) {
  if (items.length === 0) {
    return <p className="page-status">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-list__row" key={item.label}>
          <span className="bar-list__label">{item.label}</span>
          <div className="bar-list__track">
            <div
              className={`bar-list__fill ${item.statusKey ? `bar-list__fill--${item.statusKey}` : ""}`}
              style={{ width: `${item.value > 0 ? Math.max((item.value / max) * 100, 4) : 0}%` }}
            />
          </div>
          <span className="bar-list__value">{formatValue ? formatValue(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}
