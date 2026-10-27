import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createDatabase } from './database';
import { TaskRepository } from './task-repository';
import { createHttpParser, ParseQueue } from './parse-queue';
import { CaptureService } from './capture-service';
import { registerCaptureIpc } from './ipc';

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f1e8',
    title: 'AceNote',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on('ready-to-show', () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  const database = createDatabase(join(app.getPath('userData'), 'acenote.sqlite'));
  const repository = new TaskRepository(database);
  const queue = new ParseQueue(repository, createHttpParser());
  const service = new CaptureService(repository, queue);
  registerCaptureIpc(service);
  queue.resume();

  app.on('before-quit', () => database.close());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
