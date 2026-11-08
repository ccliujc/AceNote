import { app } from "electron";
import { join } from "node:path";
import { createDatabase } from "./database";
import { TaskRepository } from "./task-repository";
import { IntakeRepository } from "./intake-repository";
import { LifecycleService } from "./lifecycle-service";
import { createIntentParser } from "./parse-queue";
import {
  registerEditorIpc,
  registerLifecycleIpc,
  registerReminderIpc,
  registerRecoveryIpc,
  registerTaskReparseIpc,
} from "./ipc";
import { ReminderRepository } from "./reminder-repository";
import { ReminderService } from "./reminder-service";
import { ReminderScheduler } from "./reminder-scheduler";
import { ActiveReminderService } from "./active-reminder-service";
import { TaskReparseService } from "./task-reparse-service";
import { WindowManager } from "./windows/window-manager";
import { registerApplicationLifecycle } from "./application-lifecycle";
import {
  intakeChangedEventSchema,
  type LifecycleTask,
} from "@acenote/contracts";

void app.whenReady().then(() => {
  const database = createDatabase(
    join(app.getPath("userData"), "acenote.sqlite"),
  );
  const repository = new TaskRepository(database);
  const intakes = new IntakeRepository(database);
  const reminderRepository = new ReminderRepository(database);
  const reminderService = new ReminderService(repository, reminderRepository);
  const windows = new WindowManager(() => app.quit());
  const sessionStartedAt = new Date();
  const activeReminders = new ActiveReminderService(
    repository,
    reminderRepository,
    {
      onChanged: (state) => windows.broadcast("reminder:active-changed", state),
      onDue: (event) => windows.broadcast("reminder:due", event),
    },
  );

  const lifecycleService = new LifecycleService(
    repository,
    intakes,
    createIntentParser(),
    reminderService,
    {
      onTaskChanged: (task) => activeReminders.reconcileTask(task),
      onChanged: (reason) => windows.broadcast("data:changed", { reason }),
      onCompleted: (task: LifecycleTask) =>
        windows.broadcast("task:completed", {
          taskId: task.id,
          title: task.title,
        }),
      onInputChanged: (event) =>
        windows.broadcast(
          "intake:changed",
          intakeChangedEventSchema.parse(event),
        ),
    },
  );
  lifecycleService.recoverInterrupted();
  const taskReparse = new TaskReparseService(repository, createIntentParser(), {
    onTaskChanged: (task) => activeReminders.reconcileTask(task),
    syncTask: (id) => reminderService.syncTask(id),
    onChanged: () => windows.broadcast("data:changed", { reason: "updated" }),
  });
  registerTaskReparseIpc(taskReparse);
  registerEditorIpc(repository, (id, task) => {
    activeReminders.reconcileTask(task);
    try {
      reminderService.syncTask(id);
    } finally {
      windows.broadcast("data:changed", { reason: "updated" });
    }
  });
  registerLifecycleIpc(lifecycleService);
  registerRecoveryIpc(lifecycleService);
  registerReminderIpc(activeReminders);

  const scheduler = new ReminderScheduler(reminderRepository, () => {}, {
    sessionStartedAt,
    claim: (view) => activeReminders.claim(view),
    beforePoll: () => activeReminders.reconcile(),
  });

  registerApplicationLifecycle(app, windows, () => {
    taskReparse.stop();
    lifecycleService.stop();
    scheduler.stop();
    activeReminders.stop();
    database.close();
  });

  windows.createWindows();
  scheduler.start();
});
