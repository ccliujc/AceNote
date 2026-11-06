import { useRef, useState } from "react";
import type { ActiveReminder } from "@acenote/contracts";

interface ReminderCenterProps {
  reminders: ActiveReminder[];
  onDismiss: (reminder: ActiveReminder) => void | Promise<void>;
}

function ReminderCard({
  reminder,
  onDismiss,
}: {
  reminder: ActiveReminder;
  onDismiss: ReminderCenterProps["onDismiss"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function dismiss() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onDismiss(reminder);
    } catch {
      setError("关闭失败，请再试一次。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const view = reminder.reminder;
  return (
    <article className="reminder-card" aria-busy={busy}>
      <div>
        <p className="eyebrow">该上场了</p>
        <h3>{view.title}</h3>
        <span>
          截止 {view.dueDate}
          {view.dueTime ? ` ${view.dueTime}` : " 09:00"}
        </span>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button
        aria-label={`关闭提醒 ${view.title}`}
        disabled={busy}
        onClick={() => void dismiss()}
      >
        {busy ? "…" : "×"}
      </button>
    </article>
  );
}
export function ReminderCenter({ reminders, onDismiss }: ReminderCenterProps) {
  if (reminders.length === 0) return null;
  return (
    <div className="reminder-list" aria-label="截止提醒">
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.activationId}
          reminder={reminder}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
