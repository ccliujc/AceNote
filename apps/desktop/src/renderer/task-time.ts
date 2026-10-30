import type { LifecycleTask } from '@acenote/contracts';

export function isTaskTimePast(
  task: Pick<LifecycleTask, 'status' | 'dueDate' | 'dueTime' | 'timeZone'>,
  now = new Date(),
): boolean {
  if (task.status !== 'open' || !task.dueDate || !task.dueTime) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: task.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const today = `${values.year}-${values.month}-${values.day}`;
    return (
      task.dueDate < today ||
      (task.dueDate === today &&
        task.dueTime <= `${values.hour}:${values.minute}`)
    );
  } catch {
    return false;
  }
}
