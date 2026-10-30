import { describe, expect, it, vi } from 'vitest';
import type { QuickInputApi } from '@acenote/contracts';
const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));
vi.mock('electron', () => electron);
import '../src/preload/quick-input';

const api = electron.contextBridge.exposeInMainWorld.mock
  .calls[0]![1] as QuickInputApi;
describe('floating input preload', () => {
  it('uses the existing validated lifecycle operations without exposing generic IPC', async () => {
    await api.submitInput('明天下午3点开会');
    await api.retryInput('intake');
    await api.convertInputToTask('intake');
    await api.selectCandidate({
      intakeId: 'intake',
      taskId: 'task',
      revision: 3,
    });
    expect(electron.ipcRenderer.invoke.mock.calls.slice(-4)).toEqual([
      ['lifecycle:submit', '明天下午3点开会'],
      ['lifecycle:retry', 'intake'],
      ['lifecycle:convert', 'intake'],
      ['lifecycle:select', { intakeId: 'intake', taskId: 'task', revision: 3 }],
    ]);
    expect(api).not.toHaveProperty('invoke');
    expect(api).not.toHaveProperty('send');
  });
  it('unsubscribes the same data-change handler', () => {
    const listener = vi.fn();
    const off = api.onDataChanged(listener);
    const handler = electron.ipcRenderer.on.mock.calls.at(-1)![1];
    handler();
    expect(listener).toHaveBeenCalledOnce();
    off();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'data:changed',
      handler,
    );
  });
});
