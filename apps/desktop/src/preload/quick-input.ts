import { contextBridge, ipcRenderer } from 'electron';
import type {
  DailyCompletionSummary,
  InputOutcome,
  LifecycleTask,
  QuickInputApi,
} from '@acenote/contracts';

const today: QuickInputApi = {
  submitInput: (rawText) =>
    ipcRenderer.invoke('lifecycle:submit', rawText) as Promise<InputOutcome>,
  retryInput: (intakeId) =>
    ipcRenderer.invoke('lifecycle:retry', intakeId) as Promise<InputOutcome>,
  convertInputToTask: (intakeId) =>
    ipcRenderer.invoke('lifecycle:convert', intakeId) as Promise<LifecycleTask>,
  selectCandidate: (input) =>
    ipcRenderer.invoke('lifecycle:select', input) as Promise<LifecycleTask>,
  completeTask: (id, revision) =>
    ipcRenderer.invoke(
      'lifecycle:complete',
      id,
      revision,
    ) as Promise<LifecycleTask>,
  listTasks: (date: string) =>
    ipcRenderer.invoke('lifecycle:list', date, 'all') as Promise<
      LifecycleTask[]
    >,
  getSummary: (date: string) =>
    ipcRenderer.invoke(
      'lifecycle:summary',
      date,
    ) as Promise<DailyCompletionSummary>,
  close: () => ipcRenderer.send('quick-input:close'),
  focusMain: () => ipcRenderer.send('quick-input:focus-main'),
  onDataChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('data:changed', handler);
    return () => ipcRenderer.removeListener('data:changed', handler);
  },
};

contextBridge.exposeInMainWorld('today', today);
