import { randomUUID } from "node:crypto";
import {
  activeReminderSchema,
  activeReminderStateSchema,
  dismissActiveReminderSchema,
  reminderDueEventSchema,
  reminderViewSchema,
  type ActiveReminder,
  type ActiveReminderState,
  type DismissActiveReminder,
  type LifecycleTask,
  type ReminderDueEvent,
  type ReminderView,
} from "@acenote/contracts";
import type { TaskRepository } from "./task-repository";
import type { ReminderRepository } from "./reminder-repository";
import { reminderAt } from "./reminder-time";

interface Entry extends ActiveReminder {
  signature: string;
}
interface Options {
  sessionId?: string;
  idGenerator?: () => string;
  onChanged?: (state: ActiveReminderState) => void;
  onDue?: (event: ReminderDueEvent) => void;
}
function signature(task: LifecycleTask): string {
  return JSON.stringify([task.dueDate, task.dueTime, task.timeZone]);
}
function matches(task: LifecycleTask, entry: Entry): boolean {
  return (
    task.status === "open" &&
    signature(task) === entry.signature &&
    reminderAt(task.dueDate, task.dueTime, task.timeZone)?.toISOString() ===
      entry.reminder.scheduledAt
  );
}

/** Session state. A database fired row alone never creates an activity. */
export class ActiveReminderService {
  readonly sessionId: string;
  private revision = 0;
  private entries = new Map<string, Entry>();
  private readonly seen = new Set<string>();
  private stopped = false;
  private readonly idGenerator: () => string;

  constructor(
    private readonly tasks: TaskRepository,
    private readonly plans: ReminderRepository,
    private readonly options: Options = {},
  ) {
    this.sessionId = options.sessionId ?? randomUUID();
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.snapshot(); // Validate session identity before any database mutation.
  }

  stop(): void {
    this.stopped = true;
    this.entries.clear();
    this.seen.clear();
  }

  getActiveReminders(): ActiveReminderState {
    this.assertRunning();
    this.reconcile();
    return this.snapshot();
  }

  dismissReminder(reference: DismissActiveReminder): ActiveReminderState {
    const value = dismissActiveReminderSchema.parse(reference);
    this.assertRunning();
    if (value.sessionId !== this.sessionId) throw new Error("CONCURRENT_EDIT");
    this.reconcile();
    const next = new Map(this.entries);
    next.delete(value.activationId);
    this.commit(next);
    return this.snapshot();
  }

  /** Called synchronously by the scheduler instead of the bare plan claim. */
  claim(
    candidate: ReminderView,
    activationId = this.idGenerator(),
  ): ReminderView | null {
    if (this.stopped || this.seen.has(activationId)) return null;
    reminderViewSchema.parse(candidate);
    const task = this.tasks.get(candidate.taskId);
    const plan = this.plans.getForTask(task.id);
    const item = activeReminderSchema.parse({
      activationId,
      reminder: { ...candidate, title: task.title },
    });
    const entry: Entry = { ...item, signature: signature(task) };
    if (
      plan.status !== "scheduled" ||
      plan.id !== candidate.id ||
      plan.scheduledAt !== candidate.scheduledAt ||
      plan.timeZone !== task.timeZone ||
      !matches(task, entry)
    )
      return null;
    // All data has been read and validated. No await or user callback may occur
    // between the successful conditional claim and the session registration.
    const claimed = this.plans.claim(candidate.id);
    if (!claimed) return null;
    const next = new Map(this.entries);
    for (const [id, old] of next)
      if (old.reminder.taskId === task.id) next.delete(id);
    next.set(activationId, entry);
    this.seen.add(activationId);
    this.commit(next);
    if (this.stopped || !this.entries.has(activationId)) return claimed;
    const event = reminderDueEventSchema.parse({
      sessionId: this.sessionId,
      revision: this.revision,
      ...item,
    });
    this.safe(() => this.options.onDue?.(event));
    return claimed;
  }

  /** Use the already committed task before best-effort plan writes. */
  reconcileTask(task: LifecycleTask): void {
    if (this.stopped) return;
    const next = new Map(this.entries);
    for (const [id, entry] of next) {
      if (entry.reminder.taskId !== task.id) continue;
      if (!matches(task, entry)) next.delete(id);
      else
        next.set(id, {
          ...entry,
          reminder: { ...entry.reminder, title: task.title },
        });
    }
    this.commit(next);
  }

  reconcile(): void {
    if (this.stopped) return;
    const next = new Map(this.entries);
    for (const [id, entry] of next) {
      try {
        const task = this.tasks.get(entry.reminder.taskId);
        const plan = this.plans.getForTask(task.id);
        if (
          !matches(task, entry) ||
          plan.status !== "fired" ||
          plan.id !== entry.reminder.id ||
          plan.scheduledAt !== entry.reminder.scheduledAt
        )
          next.delete(id);
        else
          next.set(id, {
            ...entry,
            reminder: { ...entry.reminder, title: task.title },
          });
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND")
          next.delete(id);
        else throw error; // No partial state is committed on read failure.
      }
    }
    this.commit(next);
  }

  private snapshot(): ActiveReminderState {
    const reminders = [...this.entries.values()].map(
      ({ activationId, reminder }) => ({ activationId, reminder }),
    );
    reminders.sort(
      (a, b) =>
        a.reminder.scheduledAt.localeCompare(b.reminder.scheduledAt) ||
        a.reminder.id.localeCompare(b.reminder.id) ||
        a.activationId.localeCompare(b.activationId),
    );
    return activeReminderStateSchema.parse({
      sessionId: this.sessionId,
      revision: this.revision,
      reminders,
    });
  }
  private commit(next: Map<string, Entry>): void {
    if (JSON.stringify([...next]) === JSON.stringify([...this.entries])) return;
    this.entries = next;
    this.revision += 1;
    const snapshot = this.snapshot();
    this.safe(() => this.options.onChanged?.(snapshot));
  }
  private assertRunning(): void {
    if (this.stopped) throw new Error("INVALID_TRANSITION");
  }
  private safe(effect: () => void): void {
    try {
      effect();
    } catch {
      /* Session state survives delivery failure. */
    }
  }
}
