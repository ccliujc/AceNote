import type { ReminderView } from '@acenote/contracts';
import type { ReminderRepository } from './reminder-repository';

interface SchedulerOptions {
  clock?: () => Date;
  intervalMs?: number;
  sessionStartedAt?: Date;
}

export class ReminderScheduler {
  private readonly clock: () => Date;
  private readonly intervalMs: number;
  private readonly sessionStartedAt: Date;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: ReminderRepository,
    private readonly onDue: (reminder: ReminderView) => void,
    options: SchedulerOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.intervalMs = options.intervalMs ?? 15_000;
    this.sessionStartedAt = options.sessionStartedAt ?? this.clock();
  }

  start(): void {
    if (this.timer) return;
    this.repository.markMissedBefore(this.sessionStartedAt);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll(now: Date = this.clock()): Promise<ReminderView[]> {
    const due = this.repository.listDue(now);
    const emitted: ReminderView[] = [];
    for (const reminder of due) {
      const claimed = this.repository.claim(reminder.id);
      if (!claimed) continue;
      try {
        this.onDue(claimed);
      } catch {
        // A renderer delivery failure must not stop later reminders.
      }
      emitted.push(claimed);
    }
    return emitted;
  }
}
