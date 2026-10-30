import type { TaskRepository } from './task-repository';
import type { ReminderRepository } from './reminder-repository';
import { reminderAt } from './reminder-time';

interface ReminderServiceOptions {
  clock?: () => Date;
}

export class ReminderService {
  private readonly clock: () => Date;

  constructor(
    private readonly tasks: TaskRepository,
    private readonly reminders: ReminderRepository,
    options: ReminderServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  syncTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task.status !== 'open') {
      this.reminders.cancel(taskId);
      return;
    }
    const next = reminderAt(task.dueDate, task.dueTime, task.timeZone);
    if (!next || next.getTime() <= this.clock().getTime()) {
      this.reminders.cancel(taskId);
      return;
    }
    this.reminders.upsertForTask(taskId, next, task.timeZone);
  }
}
