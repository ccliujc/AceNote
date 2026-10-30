interface ApplicationHost {
  on(
    event: 'activate' | 'before-quit' | 'window-all-closed',
    listener: () => void,
  ): unknown;
  quit(): void;
}

interface WindowLifecycle {
  activate(): void;
  prepareToQuit(): void;
}

export function registerApplicationLifecycle(
  application: ApplicationHost,
  windows: WindowLifecycle,
  cleanup: () => void,
): void {
  let cleaned = false;
  application.on('activate', () => windows.activate());
  application.on('before-quit', () => {
    windows.prepareToQuit();
    if (cleaned) return;
    cleaned = true;
    cleanup();
  });
  application.on('window-all-closed', () => application.quit());
}
