import { dueDateSchema, dueTimeSchema } from '@acenote/contracts';

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function offsetAt(timestamp: number, timeZone: string): number {
  const p = localParts(new Date(timestamp), timeZone);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const target = Date.parse(`${local}Z`);
  if (!Number.isFinite(target)) return null;
  try {
    const first = target - offsetAt(target, timeZone);
    const corrected = target - offsetAt(first, timeZone);
    return new Date(corrected);
  } catch {
    return null;
  }
}

export function reminderAt(dueDate: string | null, dueTime: string | null, timeZone: string): Date | null {
  if (!dueDate) return null;
  if (!dueDateSchema.safeParse(dueDate).success) return null;
  if (dueTime !== null && !dueTimeSchema.safeParse(dueTime).success) return null;
  return zonedTimeToUtc(`${dueDate}T${dueTime ?? '09:00'}:00`, timeZone);
}

export function isOverdue(dueDate: string | null, dueTime: string | null, now: Date, timeZone: string): boolean {
  const due = reminderAt(dueDate, dueTime, timeZone);
  return due !== null && due.getTime() < now.getTime();
}
