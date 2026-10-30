import { app } from 'electron';
import { join } from 'node:path';
import { createDatabase } from './database';
import { TaskRepository } from './task-repository';
import { IntakeRepository } from './intake-repository';
import { LifecycleService } from './lifecycle-service';
import { createIntentParser } from './parse-queue';
import {
  registerEditorIpc,
  registerLifecycleIpc,
  registerReminderIpc,
} from './ipc';
import { ReminderRepository } from './reminder-repository';
import { ReminderService } from './reminder-service';
import { ReminderScheduler } from './reminder-scheduler';
import { WindowManager } from './windows/window-manager';
import { registerApplicationLifecycle } from './application-lifecycle';
import type { LifecycleTask } from '@acenote/contracts';

void app.whenReady().then(() => {
  const database = createDatabase(
    join(app.getPath('userData'), 'acenote.sqlite'),
  );
  const repository = new TaskRepository(database);
  const intakes = new IntakeRepository(database);
  const reminderRepository = new ReminderRepository(database);
  const reminderService = new ReminderService(repository, reminderRepository);
  const windows = new WindowManager(() => app.quit());

  const lifecycleService = new LifecycleService(
    repository,
    intakes,
    createIntentParser(),
    reminderService,
    {
      onChanged: (reason) => windows.broadcast('data:changed', { reason }),
      onCompleted: (task: LifecycleTask) =>
        windows.broadcast('task:completed', {
          taskId: task.id,
          title: task.title,
        }),
    },
  );
  registerEditorIpc(repository, (id) => {
    reminderService.syncTask(id);
    windows.broadcast('data:changed', { reason: 'updated' });
  });
  registerLifecycleIpc(lifecycleService);
  registerReminderIpc();

  const scheduler = new ReminderScheduler(reminderRepository, (view) => {
    windows.broadcast('reminder:due', { reminder: view });
  });

  registerApplicationLifecycle(app, windows, () => {
    scheduler.stop();
    database.close();
  });

  windows.createWindows();
  scheduler.start();
});
