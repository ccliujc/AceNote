import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  lifecycleQuerySchema,
  rawTextSchema,
  reparseModeSchema,
  selectCandidateSchema,
  taskPatchSchema,
} from '@acenote/contracts';
import type { CaptureService } from './capture-service';
import type { LifecycleService } from './lifecycle-service';

const idSchema = z.uuid();
const revisionSchema = z.number().int().nonnegative();

export function registerCaptureIpc(service: CaptureService): void {
  ipcMain.handle('capture:submit', (_event, input: unknown) =>
    service.submitTask(rawTextSchema.parse(input)),
  );
  ipcMain.handle('capture:list', () => service.listTasks());
  ipcMain.handle(
    'capture:update',
    (_event, id: unknown, patch: unknown, revision: unknown) =>
      service.updateTask(
        idSchema.parse(id),
        taskPatchSchema.parse(patch),
        revisionSchema.parse(revision),
      ),
  );
  ipcMain.handle('capture:retry', (_event, id: unknown) =>
    service.retryParse(idSchema.parse(id)),
  );
  ipcMain.handle('capture:reparse', (_event, id: unknown, mode: unknown) =>
    service.reparseTask(idSchema.parse(id), reparseModeSchema.parse(mode)),
  );
}

export function registerEditorIpc(
  repository: import('./task-repository').TaskRepository,
  onUpdated?: (id: string) => void,
): void {
  ipcMain.handle(
    'editor:update',
    (_event, id: unknown, patch: unknown, revision: unknown) => {
      const parsedId = idSchema.parse(id);
      const task = repository.update(
        parsedId,
        taskPatchSchema.parse(patch),
        revisionSchema.parse(revision),
      );
      onUpdated?.(parsedId);
      return task;
    },
  );
}

export function registerReminderIpc(): void {
  ipcMain.handle('reminder:dismiss', (_event, reminderId: unknown) => {
    z.uuid().parse(reminderId);
  });
}

export function registerLifecycleIpc(service: LifecycleService): void {
  ipcMain.handle('lifecycle:submit', (_event, rawText: unknown) =>
    service.submitInput(rawTextSchema.parse(rawText)),
  );
  ipcMain.handle('lifecycle:retry', (_event, intakeId: unknown) =>
    service.retryInput(idSchema.parse(intakeId)),
  );
  ipcMain.handle('lifecycle:convert', (_event, intakeId: unknown) =>
    service.convertInputToTask(idSchema.parse(intakeId)),
  );
  ipcMain.handle('lifecycle:list', (_event, date: unknown, status: unknown) => {
    const query = lifecycleQuerySchema.parse({ date, status });
    return service.listTasks(query.date, query.status);
  });
  ipcMain.handle('lifecycle:summary', (_event, date: unknown) =>
    service.getDailySummary(z.iso.date().parse(date)),
  );
  ipcMain.handle('lifecycle:select', (_event, input: unknown) =>
    service.selectCandidate(selectCandidateSchema.parse(input)),
  );
  ipcMain.handle(
    'lifecycle:complete',
    (_event, id: unknown, revision: unknown) =>
      service.completeTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
  ipcMain.handle(
    'lifecycle:archive',
    (_event, id: unknown, revision: unknown) =>
      service.archiveTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
  ipcMain.handle(
    'lifecycle:restore',
    (_event, id: unknown, revision: unknown) =>
      service.restoreTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
}
