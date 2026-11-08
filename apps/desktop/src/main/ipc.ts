import { ipcMain } from "electron";
import { z } from "zod";
import {
  lifecycleQuerySchema,
  rawTextSchema,
  reparseModeSchema,
  selectCandidateSchema,
  intakeOperationSchema,
  recoverableInputsSchema,
  recoverySummarySchema,
  recoveryCandidatesSchema,
  taskPatchSchema,
  activeReminderStateSchema,
  dismissActiveReminderSchema,
  taskReparseRequestSchema,
  taskReparseOutcomeSchema,
} from "@acenote/contracts";
import type { CaptureService } from "./capture-service";
import type { LifecycleService } from "./lifecycle-service";

const idSchema = z.uuid();
const revisionSchema = z.number().int().nonnegative();

export function registerCaptureIpc(service: CaptureService): void {
  ipcMain.handle("capture:submit", (_event, input: unknown) =>
    service.submitTask(rawTextSchema.parse(input)),
  );
  ipcMain.handle("capture:list", () => service.listTasks());
  ipcMain.handle(
    "capture:update",
    (_event, id: unknown, patch: unknown, revision: unknown) =>
      service.updateTask(
        idSchema.parse(id),
        taskPatchSchema.parse(patch),
        revisionSchema.parse(revision),
      ),
  );
  ipcMain.handle("capture:retry", (_event, id: unknown) =>
    service.retryParse(idSchema.parse(id)),
  );
  ipcMain.handle("capture:reparse", (_event, id: unknown, mode: unknown) =>
    service.reparseTask(idSchema.parse(id), reparseModeSchema.parse(mode)),
  );
}

export function registerEditorIpc(
  repository: import("./task-repository").TaskRepository,
  onUpdated?: (
    id: string,
    task: import("@acenote/contracts").LifecycleTask,
  ) => void,
): void {
  ipcMain.handle(
    "editor:update",
    (_event, id: unknown, patch: unknown, revision: unknown) => {
      const parsedId = idSchema.parse(id);
      const task = repository.update(
        parsedId,
        taskPatchSchema.parse(patch),
        revisionSchema.parse(revision),
      );
      try {
        onUpdated?.(parsedId, task);
      } catch {
        /* The task is already committed. */
      }
      return task;
    },
  );
}

export function registerReminderIpc(
  service: import("./active-reminder-service").ActiveReminderService,
): void {
  ipcMain.handle("reminder:active", () =>
    activeReminderStateSchema.parse(service.getActiveReminders()),
  );
  ipcMain.handle("reminder:dismiss", (_event, reference: unknown) =>
    activeReminderStateSchema.parse(
      service.dismissReminder(dismissActiveReminderSchema.parse(reference)),
    ),
  );
}

export function registerTaskReparseIpc(
  service: import("./task-reparse-service").TaskReparseService,
): void {
  ipcMain.handle("task:reparse", async (_event, request: unknown) =>
    taskReparseOutcomeSchema.parse(
      await service.reparseTask(taskReparseRequestSchema.parse(request)),
    ),
  );
}

export function registerLifecycleIpc(service: LifecycleService): void {
  ipcMain.handle("lifecycle:submit", (_event, rawText: unknown) =>
    service.submitInput(rawTextSchema.parse(rawText)),
  );
  ipcMain.handle(
    "lifecycle:retry",
    (_event, intakeId: unknown, intakeRevision: unknown) =>
      service.retryInput(
        idSchema.parse(intakeId),
        revisionSchema.parse(intakeRevision),
      ),
  );
  ipcMain.handle(
    "lifecycle:convert",
    (_event, intakeId: unknown, intakeRevision: unknown) =>
      service.convertInputToTask(
        idSchema.parse(intakeId),
        revisionSchema.parse(intakeRevision),
      ),
  );
  ipcMain.handle("lifecycle:list", (_event, date: unknown, status: unknown) => {
    const query = lifecycleQuerySchema.parse({ date, status });
    return service.listTasks(query.date, query.status);
  });
  ipcMain.handle("lifecycle:summary", (_event, date: unknown) =>
    service.getDailySummary(z.iso.date().parse(date)),
  );
  ipcMain.handle("lifecycle:select", (_event, input: unknown) =>
    service.selectCandidate(selectCandidateSchema.parse(input)),
  );
  ipcMain.handle(
    "lifecycle:complete",
    (_event, id: unknown, revision: unknown) =>
      service.completeTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
  ipcMain.handle(
    "lifecycle:archive",
    (_event, id: unknown, revision: unknown) =>
      service.archiveTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
  ipcMain.handle(
    "lifecycle:restore",
    (_event, id: unknown, revision: unknown) =>
      service.restoreTask(idSchema.parse(id), revisionSchema.parse(revision)),
  );
}

export function registerRecoveryIpc(service: LifecycleService): void {
  ipcMain.handle("recovery:list", () =>
    recoverableInputsSchema.parse(service.listRecoverableInputs()),
  );
  ipcMain.handle("recovery:summary", () =>
    recoverySummarySchema.parse(service.getRecoverableSummary()),
  );
  ipcMain.handle(
    "recovery:candidates",
    (_event, intakeId: unknown, intakeRevision: unknown) => {
      const value = intakeOperationSchema.parse({ intakeId, intakeRevision });
      return recoveryCandidatesSchema.parse(
        service.getRecoveryCandidates(value.intakeId, value.intakeRevision),
      );
    },
  );
  ipcMain.handle(
    "recovery:reparse-candidates",
    async (_event, intakeId: unknown, intakeRevision: unknown) => {
      const value = intakeOperationSchema.parse({ intakeId, intakeRevision });
      return recoveryCandidatesSchema.parse(
        await service.reparseRecoveryCandidates(
          value.intakeId,
          value.intakeRevision,
        ),
      );
    },
  );
}
