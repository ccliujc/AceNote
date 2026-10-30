import { describe, expect, it, vi } from 'vitest';
import { registerApplicationLifecycle } from '../src/main/application-lifecycle';

function setup() {
  const listeners = new Map<string, () => void>();
  const order: string[] = [];
  const application = {
    on: (event: string, listener: () => void) => listeners.set(event, listener),
    quit: vi.fn(),
  };
  const windows = {
    activate: vi.fn(),
    prepareToQuit: vi.fn(() => order.push('prepare')),
  };
  const cleanup = vi.fn(() => order.push('cleanup'));
  registerApplicationLifecycle(application, windows, cleanup);
  return { application, windows, cleanup, listeners, order };
}

describe('floating-first application lifecycle', () => {
  it('routes system activation to the floating entry without stopping services', () => {
    const { application, windows, cleanup, listeners } = setup();
    listeners.get('activate')!();
    expect(windows.activate).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    expect(application.quit).not.toHaveBeenCalled();
  });
  it('prepares windows before cleanup, cleans once, and quits when all windows are gone', () => {
    const { application, cleanup, listeners, order } = setup();
    listeners.get('before-quit')!();
    listeners.get('before-quit')!();
    expect(order).toEqual(['prepare', 'cleanup', 'prepare']);
    expect(cleanup).toHaveBeenCalledOnce();
    listeners.get('window-all-closed')!();
    expect(application.quit).toHaveBeenCalledOnce();
  });
});
