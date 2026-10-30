import { contextBridge, ipcRenderer } from 'electron';
import type { DataChangedEvent, PetApi, ReminderDueEvent, TaskCompletedEvent } from '@acenote/contracts';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const pet: PetApi = {
  openToday: () => ipcRenderer.invoke('pet:open-today') as Promise<void>,
  focusMain: () => ipcRenderer.invoke('pet:focus-main') as Promise<void>,
  startDrag: (screenX, screenY) => ipcRenderer.send('pet:drag-start', screenX, screenY),
  dragTo: (screenX, screenY) => ipcRenderer.send('pet:drag-move', screenX, screenY),
  endDrag: () => ipcRenderer.send('pet:drag-end'),
  setInteractive: (interactive) => ipcRenderer.send('pet:set-interactive', interactive),
  onReminderDue: (listener) => subscribe<ReminderDueEvent>('reminder:due', listener),
  onDataChanged: (listener) => subscribe<DataChangedEvent>('data:changed', listener),
  onTaskCompleted: (listener) => subscribe<TaskCompletedEvent>('task:completed', listener),
};

contextBridge.exposeInMainWorld('pet', pet);
