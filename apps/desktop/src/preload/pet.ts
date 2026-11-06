import { contextBridge, ipcRenderer } from "electron";
import type {
  ActiveReminderState,
  ActiveReminderReadApi,
  DataChangedEvent,
  PetApi,
  ReminderDueEvent,
  TaskCompletedEvent,
} from "@acenote/contracts";

function subscribe<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Keep this bridge self-contained: sandboxed preloads cannot require shared chunks.
function isActiveReminderState(
  payload: unknown,
): payload is ActiveReminderState {
  if (
    !payload ||
    typeof payload !== "object" ||
    Object.keys(payload).length !== 3
  )
    return false;
  const state = payload as ActiveReminderState;
  const uuid = (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  if (
    !uuid(state.sessionId) ||
    !Number.isInteger(state.revision) ||
    state.revision < 0 ||
    !Array.isArray(state.reminders)
  )
    return false;
  const ids = new Set<string>(),
    tasks = new Set<string>();
  return state.reminders.every((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Object.keys(item).length !== 2 ||
      !uuid(item.activationId) ||
      ids.has(item.activationId)
    )
      return false;
    const r = item.reminder;
    if (
      !r ||
      typeof r !== "object" ||
      Object.keys(r).length !== 6 ||
      !uuid(r.id) ||
      !uuid(r.taskId) ||
      tasks.has(r.taskId) ||
      typeof r.title !== "string" ||
      !r.title.trim() ||
      typeof r.dueDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate) ||
      !(
        r.dueTime === null ||
        (typeof r.dueTime === "string" &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(r.dueTime))
      ) ||
      typeof r.scheduledAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(r.scheduledAt) ||
      !Number.isFinite(Date.parse(r.scheduledAt))
    )
      return false;
    ids.add(item.activationId);
    tasks.add(r.taskId);
    return true;
  });
}
function createActiveReminderReadApi(): ActiveReminderReadApi {
  return {
    getActiveReminders: () =>
      ipcRenderer.invoke("reminder:active") as Promise<ActiveReminderState>,
    onActiveRemindersChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isActiveReminderState(payload)) listener(payload);
      };
      ipcRenderer.on("reminder:active-changed", handler);
      return () =>
        ipcRenderer.removeListener("reminder:active-changed", handler);
    },
  };
}

const pet: PetApi = {
  ...createActiveReminderReadApi(),
  openToday: () => ipcRenderer.invoke("pet:open-today") as Promise<void>,
  focusMain: () => ipcRenderer.invoke("pet:focus-main") as Promise<void>,
  startDrag: (screenX, screenY) =>
    ipcRenderer.send("pet:drag-start", screenX, screenY),
  dragTo: (screenX, screenY) =>
    ipcRenderer.send("pet:drag-move", screenX, screenY),
  endDrag: () => ipcRenderer.send("pet:drag-end"),
  setInteractive: (interactive) =>
    ipcRenderer.send("pet:set-interactive", interactive),
  onReminderDue: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        !payload ||
        typeof payload !== "object" ||
        Object.keys(payload).length !== 4
      )
        return;
      const event = payload as ReminderDueEvent;
      if (
        isActiveReminderState({
          sessionId: event.sessionId,
          revision: event.revision,
          reminders: [
            { activationId: event.activationId, reminder: event.reminder },
          ],
        })
      )
        listener(event);
    };
    ipcRenderer.on("reminder:due", handler);
    return () => ipcRenderer.removeListener("reminder:due", handler);
  },
  onDataChanged: (listener) =>
    subscribe<DataChangedEvent>("data:changed", listener),
  onTaskCompleted: (listener) =>
    subscribe<TaskCompletedEvent>("task:completed", listener),
};

contextBridge.exposeInMainWorld("pet", pet);
