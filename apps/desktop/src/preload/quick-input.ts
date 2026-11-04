import { contextBridge, ipcRenderer } from "electron";
import type {
  DailyCompletionSummary,
  InputOutcome,
  RecoverySummaryApi,
  RecoverySummary,
  IntakeChangedEvent,
  LifecycleTask,
  QuickInputApi,
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

const today: QuickInputApi = {
  ...createRecoverySummaryApi(),
  submitInput: (rawText) =>
    ipcRenderer.invoke("lifecycle:submit", rawText) as Promise<InputOutcome>,
  retryInput: (intakeId, intakeRevision) =>
    ipcRenderer.invoke(
      "lifecycle:retry",
      intakeId,
      intakeRevision,
    ) as Promise<InputOutcome>,
  convertInputToTask: (intakeId, intakeRevision) =>
    ipcRenderer.invoke(
      "lifecycle:convert",
      intakeId,
      intakeRevision,
    ) as Promise<LifecycleTask>,
  selectCandidate: (input) =>
    ipcRenderer.invoke("lifecycle:select", input) as Promise<LifecycleTask>,
  completeTask: (id, revision) =>
    ipcRenderer.invoke(
      "lifecycle:complete",
      id,
      revision,
    ) as Promise<LifecycleTask>,
  listTasks: (date: string) =>
    ipcRenderer.invoke("lifecycle:list", date, "all") as Promise<
      LifecycleTask[]
    >,
  getSummary: (date: string) =>
    ipcRenderer.invoke(
      "lifecycle:summary",
      date,
    ) as Promise<DailyCompletionSummary>,
  close: () => ipcRenderer.send("quick-input:close"),
  focusMain: () => ipcRenderer.send("quick-input:focus-main"),
  onDataChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("data:changed", handler);
    return () => ipcRenderer.removeListener("data:changed", handler);
  },
};

contextBridge.exposeInMainWorld("today", today);
