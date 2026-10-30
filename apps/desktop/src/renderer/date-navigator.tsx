interface DateNavigatorProps {
  date: string;
  onChange: (date: string) => void;
}

function shift(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function DateNavigator({ date, onChange }: DateNavigatorProps) {
  return (
    <div className="date-navigator">
      <button aria-label="前一天" onClick={() => onChange(shift(date, -1))}>←</button>
      <input aria-label="记录日期" type="date" value={date} onChange={(event) => event.target.value && onChange(event.target.value)} />
      <button aria-label="后一天" onClick={() => onChange(shift(date, 1))}>→</button>
      <button className="today-button" onClick={() => onChange(todayLocal())}>今天</button>
    </div>
  );
}
