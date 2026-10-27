import { ipcMain } from 'electron';
import { z } from 'zod';
import { rawTextSchema, reparseModeSchema, taskPatchSchema } from '@acenote/contracts';
import type { CaptureService } from './capture-service';

const idSchema = z.uuid();
const revisionSchema = z.number().int().nonnegative();

export function registerCaptureIpc(service: CaptureService): void {
  ipcMain.handle('capture:submit', (_event, input: unknown) => service.submitTask(rawTextSchema.parse(input)));
  ipcMain.handle('capture:list', () => service.listTasks());
  ipcMain.handle('capture:update', (_event, id: unknown, patch: unknown, revision: unknown) =>
    service.updateTask(idSchema.parse(id), taskPatchSchema.parse(patch), revisionSchema.parse(revision)));
  ipcMain.handle('capture:retry', (_event, id: unknown) => service.retryParse(idSchema.parse(id)));
  ipcMain.handle('capture:reparse', (_event, id: unknown, mode: unknown) =>
    service.reparseTask(idSchema.parse(id), reparseModeSchema.parse(mode)));
}
