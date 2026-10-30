import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleService } from '../src/main/lifecycle-service';

const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown,
    ) => native.handlers.set(channel, handler),
  },
}));
import { registerLifecycleIpc } from '../src/main/ipc';

const completeTask = vi.fn();
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  native.handlers.clear();
  completeTask.mockReset();
  registerLifecycleIpc({ completeTask } as unknown as LifecycleService);
});
describe('direct completion IPC', () => {
  it('forwards the validated ID and revision to the lifecycle service', async () => {
    const result = { id, status: 'completed' };
    completeTask.mockResolvedValue(result);
    expect(await native.handlers.get('lifecycle:complete')!({}, id, 4)).toBe(
      result,
    );
    expect(completeTask).toHaveBeenCalledExactlyOnceWith(id, 4);
  });
  it('rejects invalid IDs and revisions before any task is changed', () => {
    for (const args of [
      ['other-task', 1],
      [id, -1],
      [id, 1.5],
      [id, '1'],
      [id, Infinity],
    ])
      expect(() =>
        native.handlers.get('lifecycle:complete')!({}, ...args),
      ).toThrow();
    expect(completeTask).not.toHaveBeenCalled();
  });
});
