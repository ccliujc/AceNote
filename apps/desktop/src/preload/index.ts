import { contextBridge, ipcRenderer } from 'electron';
import type { AceNoteApi, ReparseMode, Task, TaskPatch } from '@acenote/contracts';

const api: AceNoteApi = {
  submitTask: (rawText: string) => ipcRenderer.invoke('capture:submit', rawText) as Promise<Task>,
  listTasks: () => ipcRenderer.invoke('capture:list') as Promise<Task[]>,
  updateTask: (id: string, patch: TaskPatch, revision: number) =>
    ipcRenderer.invoke('capture:update', id, patch, revision) as Promise<Task>,
  retryParse: (id: string) => ipcRenderer.invoke('capture:retry', id) as Promise<Task>,
  reparseTask: (id: string, mode: ReparseMode) => ipcRenderer.invoke('capture:reparse', id, mode) as Promise<Task>,
};

contextBridge.exposeInMainWorld('acenote', api);
