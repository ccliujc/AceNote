import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const windows: FakeWindow[] = [];
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  const menus: Array<
    Array<{ label?: string; click?: () => void; type?: string }>
  > = [];
  const ipcOn = vi.fn();
  class FakeWindow {
    options: Record<string, any>;
    bounds: { x: number; y: number; width: number; height: number };
    listeners = new Map<string, (...args: any[]) => void>();
    webContents = { on: vi.fn(), send: vi.fn() };
    constructor(options: Record<string, any>) {
      this.options = options;
      this.bounds = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width,
        height: options.height,
      };
      windows.push(this);
    }
    on(name: string, listener: (...args: any[]) => void) {
      this.listeners.set(name, listener);
    }
    once(name: string, listener: (...args: any[]) => void) {
      this.listeners.set(name, listener);
    }
    getBounds() {
      return this.bounds;
    }
    setBounds = vi.fn((bounds: typeof this.bounds) => {
      this.bounds = bounds;
    });
    getPosition() {
      return [this.bounds.x, this.bounds.y];
    }
    setPosition = vi.fn((x: number, y: number) => {
      this.bounds.x = x;
      this.bounds.y = y;
    });
    loadFile = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    hide = vi.fn();
    close = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isDestroyed = vi.fn(() => false);
    isMinimized = vi.fn(() => false);
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
  }
  return { windows, area, menus, FakeWindow, ipcOn };
});
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/acenote-window-test' },
  BrowserWindow: native.FakeWindow,
  ipcMain: { handle: vi.fn(), on: native.ipcOn },
  Menu: {
    buildFromTemplate: (items: (typeof native.menus)[number]) => {
      native.menus.push(items);
      return { popup: vi.fn() };
    },
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: native.area }),
    getAllDisplays: () => [{ workArea: native.area }],
    getDisplayNearestPoint: () => ({ workArea: native.area }),
  },
}));
vi.mock('../src/main/pet-position', () => ({
  readPosition: vi.fn(() => null),
  writePosition: vi.fn(),
  defaultPosition: () => ({ x: 1000, y: 430 }),
  clampPosition: (point: { x: number; y: number }) => point,
}));
import { WindowManager } from '../src/main/windows/window-manager';
import { readPosition, writePosition } from '../src/main/pet-position';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readPosition).mockReturnValue(null);
  native.windows.length = 0;
  native.menus.length = 0;
  Object.assign(native.area, { x: 0, y: 0, width: 1280, height: 800 });
});
describe('floating-first window lifecycle', () => {
  it('reserves message space above the character while preserving saved character positions', () => {
    vi.mocked(readPosition).mockReturnValue({ x: 1000, y: 550 });
    const manager = new WindowManager(vi.fn());
    manager.createWindows();
    const pet = native.windows[0]!;
    expect(pet.bounds).toEqual({ x: 1000, y: 430, width: 220, height: 340 });
    const handler = (name: string) =>
      native.ipcOn.mock.calls.find(([channel]) => channel === name)![1];
    handler('pet:drag-start')({}, 1100, 650);
    handler('pet:drag-move')({}, 1120, 660);
    handler('pet:drag-end')({});
    expect(pet.setPosition).toHaveBeenLastCalledWith(1020, 440);
    expect(writePosition).toHaveBeenLastCalledWith(
      '/tmp/acenote-window-test/pet-position.json',
      { x: 1020, y: 560 },
    );
    manager.openQuickInput();
    const quick = native.windows[1]!;
    quick.listeners.get('ready-to-show')!();
    expect(quick.bounds.y + quick.bounds.height).toBe(
      pet.bounds.y + pet.bounds.height,
    );
  });
  it('starts with only the pet and activates only the floating input', () => {
    const manager = new WindowManager(vi.fn());
    manager.createWindows();
    expect(native.windows).toHaveLength(1);
    expect(manager.mainWindow).toBeNull();
    native.windows[0]!.listeners.get('ready-to-show')!();
    manager.activate();
    manager.activate();
    expect(native.windows).toHaveLength(2);
    expect(manager.mainWindow).toBeNull();
    const quick = native.windows[1]!;
    expect(quick.show).not.toHaveBeenCalled();
    quick.listeners.get('ready-to-show')!();
    expect(quick.show).toHaveBeenCalledOnce();
    manager.activate();
    expect(quick.show).toHaveBeenCalledTimes(2);
    expect(native.windows).toHaveLength(2);
  });
  it('hides and reuses the same floating renderer so drafts survive reopening', () => {
    const manager = new WindowManager(vi.fn());
    manager.createWindows();
    manager.openQuickInput();
    const quick = native.windows[1]!;
    quick.listeners.get('ready-to-show')!();
    expect(quick.options).toMatchObject({
      width: 360,
      height: 560,
      frame: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    manager.closeQuickInput();
    expect(quick.hide).toHaveBeenCalledOnce();
    expect(quick.close).not.toHaveBeenCalled();
    native.windows[0]!.bounds.x = 200;
    manager.openQuickInput();
    expect(native.windows).toHaveLength(2);
    expect(quick.show).toHaveBeenCalledTimes(2);
    expect(quick.setBounds).toHaveBeenLastCalledWith({
      x: 432,
      y: 210,
      width: 360,
      height: 560,
    });
    expect(manager.mainWindow).toBeNull();
  });
  it('opens full records lazily and keeps the floating window alive when they close', () => {
    const quit = vi.fn();
    const manager = new WindowManager(quit);
    manager.createWindows();
    manager.openQuickInput();
    const pet = native.windows[0]!,
      quick = native.windows[1]!;
    quick.listeners.get('ready-to-show')!();
    manager.focusMain();
    manager.focusMain();
    expect(native.windows).toHaveLength(3);
    const main = native.windows[2]!;
    expect(main.show).not.toHaveBeenCalled();
    main.listeners.get('ready-to-show')!();
    expect(main.show).toHaveBeenCalledOnce();
    const close = { preventDefault: vi.fn() };
    main.listeners.get('close')!(close);
    expect(close.preventDefault).toHaveBeenCalledOnce();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(quick.hide).not.toHaveBeenCalled();
    expect(quick.close).not.toHaveBeenCalled();
    expect(pet.close).not.toHaveBeenCalled();
    expect(manager.quickWindow).toBe(quick);
    expect(quit).not.toHaveBeenCalled();
    manager.broadcast('data:changed', { reason: 'created' });
    for (const window of [pet, quick, main])
      expect(window.webContents.send).toHaveBeenCalledWith('data:changed', {
        reason: 'created',
      });
    manager.focusMain();
    expect(main.show).toHaveBeenCalledTimes(2);
    expect(native.windows).toHaveLength(3);
    main.isMinimized.mockReturnValue(true);
    manager.focusMain();
    expect(main.restore).toHaveBeenCalledOnce();
  });
  it('allows full shutdown and does not reopen windows while quitting', () => {
    const manager = new WindowManager(vi.fn());
    manager.createWindows();
    manager.focusMain();
    const main = native.windows[1]!;
    manager.prepareToQuit();
    const close = { preventDefault: vi.fn() };
    main.listeners.get('close')!(close);
    expect(close.preventDefault).not.toHaveBeenCalled();
    expect(main.hide).not.toHaveBeenCalled();
    main.listeners.get('ready-to-show')!();
    expect(main.show).not.toHaveBeenCalled();
    main.listeners.get('closed')!();
    manager.activate();
    manager.focusMain();
    manager.openQuickInput();
    expect(manager.mainWindow).toBeNull();
    expect(native.windows).toHaveLength(2);
  });
  it('retains an explicit quit command in the pet menu', () => {
    const quit = vi.fn();
    const manager = new WindowManager(quit);
    manager.createWindows();
    const pet = native.windows[0]!;
    pet.webContents.on.mock.calls.find(
      ([name]) => name === 'context-menu',
    )![1]();
    const items = native.menus.at(-1)!;
    items.find((item) => item.label === '退出 AceNote')!.click!();
    expect(quit).toHaveBeenCalledOnce();
    expect(manager.mainWindow).toBeNull();
  });
  it('fits a smaller display work area, including a negative screen origin', () => {
    Object.assign(native.area, { x: -320, y: 20, width: 320, height: 480 });
    const manager = new WindowManager(vi.fn());
    manager.createWindows();
    manager.openQuickInput();
    const quick = native.windows[1]!;
    quick.listeners.get('ready-to-show')!();
    expect(quick.setBounds).toHaveBeenLastCalledWith({
      x: -320,
      y: 20,
      width: 320,
      height: 480,
    });
  });
});
