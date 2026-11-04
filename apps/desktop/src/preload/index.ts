import { contextBridge, ipcRenderer } from "electron";
import type {
  DailyCompletionSummary,
  DataChangedEvent,
  EditorApi,
  ExperienceApi,
  InputOutcome,
  RecoverySummaryApi,
  RecoverySummary,
  IntakeChangedEvent,
  LifecycleApi,
  LifecycleTask,
  ReminderApi,
  ReminderDueEvent,
  TaskCompletedEvent,
  TaskStatusFilter,
  RecoveryApi,
  RecoverableInput,
  RecoveryCandidates,
} from "@acenote/contracts";
// Sandboxed Electron preloads must be self-contained (no relative require).
function createRecoverySummaryApi(): RecoverySummaryApi {
  return {
    getRecoverableSummary: () =>
      ipcRenderer.invoke("recovery:summary") as Promise<RecoverySummary>,
    onInputsChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const event = payload as IntakeChangedEvent;
        if (
          Object.keys(payload).length === 3 &&
          typeof event.intakeId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            event.intakeId,
          ) &&
          Number.isInteger(event.revision) &&
          event.revision >= 0 &&
          ["pending", "awaiting_selection", "resolved", "failed"].includes(
            event.status,
          )
        )
          listener(event);
      };
      ipcRenderer.on("intake:changed", handler);
      return () => ipcRenderer.removeListener("intake:changed", handler);
    },
  };
}

const editor: EditorApi = {
  updateTask: (id, patch, revision) =>
    ipcRenderer.invoke(
      "editor:update",
      id,
      patch,
      revision,
    ) as Promise<LifecycleTask>,
};

const lifecycle: LifecycleApi = {
  submitInput: (rawText: string) =>
    ipcRenderer.invoke("lifecycle:submit", rawText) as Promise<InputOutcome>,
  retryInput: (intakeId: string, intakeRevision: number) =>
    ipcRenderer.invoke(
      "lifecycle:retry",
      intakeId,
      intakeRevision,
    ) as Promise<InputOutcome>,
  convertInputToTask: (intakeId: string, intakeRevision: number) =>
    ipcRenderer.invoke(
      "lifecycle:convert",
      intakeId,
      intakeRevision,
    ) as Promise<LifecycleTask>,
  listTasks: (date: string, status: TaskStatusFilter) =>
    ipcRenderer.invoke("lifecycle:list", date, status) as Promise<
      LifecycleTask[]
    >,
  getDailySummary: (date: string) =>
    ipcRenderer.invoke(
      "lifecycle:summary",
      date,
    ) as Promise<DailyCompletionSummary>,
  selectCandidate: (input) =>
    ipcRenderer.invoke("lifecycle:select", input) as Promise<LifecycleTask>,
  completeTask: (id, revision) =>
    ipcRenderer.invoke(
      "lifecycle:complete",
      id,
      revision,
    ) as Promise<LifecycleTask>,
  archiveTask: (id: string, revision: number) =>
    ipcRenderer.invoke(
      "lifecycle:archive",
      id,
      revision,
    ) as Promise<LifecycleTask>,
  restoreTask: (id: string, revision: number) =>
    ipcRenderer.invoke(
      "lifecycle:restore",
      id,
      revision,
    ) as Promise<LifecycleTask>,
};

const reminder: ReminderApi = {
  onReminderDue: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: ReminderDueEvent,
    ) => listener(payload);
    ipcRenderer.on("reminder:due", handler);
    return () => ipcRenderer.removeListener("reminder:due", handler);
  },
  dismissReminder: (reminderId: string) =>
    ipcRenderer.invoke("reminder:dismiss", reminderId) as Promise<void>,
};

const experience: ExperienceApi = {
  onDataChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: DataChangedEvent,
    ) => listener(payload);
    ipcRenderer.on("data:changed", handler);
    return () => ipcRenderer.removeListener("data:changed", handler);
  },
  onTaskCompleted: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: TaskCompletedEvent,
    ) => listener(payload);
    ipcRenderer.on("task:completed", handler);
    return () => ipcRenderer.removeListener("task:completed", handler);
  },
};

contextBridge.exposeInMainWorld("editor", editor);
contextBridge.exposeInMainWorld("lifecycle", lifecycle);
contextBridge.exposeInMainWorld("reminder", reminder);
contextBridge.exposeInMainWorld("experience", experience);

const recovery: RecoveryApi = {
  ...createRecoverySummaryApi(),
  listInputs: () =>
    ipcRenderer.invoke("recovery:list") as Promise<RecoverableInput[]>,
  getCandidates: (id, revision) =>
    ipcRenderer.invoke(
      "recovery:candidates",
      id,
      revision,
    ) as Promise<RecoveryCandidates>,
  reparseCandidates: (id, revision) =>
    ipcRenderer.invoke(
      "recovery:reparse-candidates",
      id,
      revision,
    ) as Promise<RecoveryCandidates>,
};
contextBridge.exposeInMainWorld("recovery", recovery);
