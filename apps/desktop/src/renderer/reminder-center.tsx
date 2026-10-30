import { useRef, useState } from 'react';
import type { ReminderView } from '@acenote/contracts';

interface ReminderCenterProps {
  reminders: ReminderView[];
  onDismiss: (reminder: ReminderView) => void | Promise<void>;
}

function ReminderCard({
  reminder,
  onDismiss,
}: {
  reminder: ReminderView;
  onDismiss: ReminderCenterProps['onDismiss'];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function dismiss() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onDismiss(reminder);
    } catch {
      setError('关闭失败，请再试一次。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="reminder-card" aria-busy={busy}>
      <div>
        <p className="eyebrow">该上场了</p>
        <h3>{reminder.title}</h3>
        <span>
          截止 {reminder.dueDate}
          {reminder.dueTime ? ` ${reminder.dueTime}` : ' 09:00'}
        </span>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button
        aria-label={`关闭提醒 ${reminder.title}`}
        disabled={busy}
        onClick={() => void dismiss()}
      >
        {busy ? '…' : '×'}
      </button>
    </article>
  );
}
export function ReminderCenter({ reminders, onDismiss }: ReminderCenterProps) {
  if (reminders.length === 0) return null;
  return (
    <aside className="reminder-center" aria-live="polite" aria-label="截止提醒">
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          onDismiss={onDismiss}
        />
      ))}
    </aside>
  );
}
