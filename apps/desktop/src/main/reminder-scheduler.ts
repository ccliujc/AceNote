import type { ReminderView } from "@acenote/contracts";
import type { ReminderRepository } from "./reminder-repository";

interface SchedulerOptions {
  clock?: () => Date;
  intervalMs?: number;
  sessionStartedAt?: Date;
  claim?: (candidate: ReminderView) => ReminderView | null;
  beforePoll?: () => void;
}

export class ReminderScheduler {
  private readonly clock: () => Date;
  private readonly intervalMs: number;
  private readonly sessionStartedAt: Date;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: ReminderRepository,
    private readonly onDue: (reminder: ReminderView) => void,
    private readonly options: SchedulerOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.intervalMs = options.intervalMs ?? 15_000;
    this.sessionStartedAt = options.sessionStartedAt ?? this.clock();
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.repository.markMissedBefore(this.sessionStartedAt);
    void this.poll().catch(() => {});
    this.timer = setInterval(
      () => void this.poll().catch(() => {}),
      this.intervalMs,
    );
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll(now: Date = this.clock()): Promise<ReminderView[]> {
    if (this.stopped) return [];
    this.options.beforePoll?.();
    if (this.stopped) return [];
    const due = this.repository.listDue(now);
    const emitted: ReminderView[] = [];
    for (const reminder of due) {
      if (this.stopped) break;
      let claimed: ReminderView | null;
      try {
        claimed = this.options.claim
          ? this.options.claim(reminder)
          : this.repository.claim(reminder.id, reminder.scheduledAt);
      } catch {
        continue;
      }
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
