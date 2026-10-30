import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { join } from 'node:path';
import {
  PET_HEIGHT,
  PET_MESSAGE_HEIGHT,
  PET_WIDTH,
} from '../../shared/pet-layout';
import {
  clampPosition,
  defaultPosition,
  readPosition,
  writePosition,
  type Point,
} from '../pet-position';

const QUICK_WIDTH = 360;
const QUICK_HEIGHT = 560;

export class WindowManager {
  mainWindow: BrowserWindow | null = null;
  petWindow: BrowserWindow | null = null;
  quickWindow: BrowserWindow | null = null;
  private dragOffset: Point | null = null;
  private quitting = false;
  private mainReady = false;
  private quickReady = false;

  constructor(private readonly onQuit: () => void) {
    this.registerIpc();
  }

  createWindows(): void {
    if (this.quitting) return;
    if (!this.petWindow || this.petWindow.isDestroyed()) this.createPet();
  }

  activate(): void {
    if (this.quitting) return;
    this.createWindows();
    this.openQuickInput();
  }

  prepareToQuit(): void {
    this.quitting = true;
  }

  focusMain(): void {
    if (this.quitting) return;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.createMain();
      return;
    }
    if (!this.mainReady) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  openQuickInput(): void {
    if (this.quitting) return;
    if (this.quickWindow && !this.quickWindow.isDestroyed()) {
      this.positionQuickInput();
      if (this.quickReady) {
        this.quickWindow.show();
        this.quickWindow.focus();
      }
      return;
    }
    this.quickReady = false;
    this.quickWindow = new BrowserWindow({
      width: QUICK_WIDTH,
      height: QUICK_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: this.securePreferences('quickInput.js'),
    });
    this.quickWindow.on('closed', () => {
      this.quickWindow = null;
      this.quickReady = false;
    });
    this.quickWindow.once('ready-to-show', () => {
      if (this.quitting) return;
      this.quickReady = true;
      this.positionQuickInput();
      this.quickWindow?.show();
      this.quickWindow?.focus();
    });
    this.loadRenderer(this.quickWindow, 'quick-input');
  }

  closeQuickInput(): void {
    // Keep the renderer alive so a hidden window retains its in-progress draft.
    this.quickWindow?.hide();
  }

  private positionQuickInput(): void {
    if (!this.quickWindow) return;
    const petBounds = this.petWindow?.getBounds();
    const work = screen.getDisplayNearestPoint(
      petBounds ? { x: petBounds.x, y: petBounds.y } : { x: 0, y: 0 },
    ).workArea;
    const width = Math.min(QUICK_WIDTH, work.width);
    const height = Math.min(QUICK_HEIGHT, work.height);
    let x = petBounds ? petBounds.x - width - 12 : work.x + 20;
    if (x < work.x && petBounds) x = petBounds.x + PET_WIDTH + 12;
    x = Math.min(Math.max(x, work.x), work.x + work.width - width);
    const y = Math.min(
      Math.max(
        petBounds ? petBounds.y + PET_HEIGHT - height : work.y + 20,
        work.y,
      ),
      work.y + work.height - height,
    );
    this.quickWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width,
      height,
    });
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of [this.mainWindow, this.petWindow, this.quickWindow]) {
      if (window && !window.isDestroyed())
        window.webContents.send(channel, payload);
    }
  }

  private createMain(): void {
    this.mainReady = false;
    const main = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 860,
      minHeight: 620,
      show: false,
      backgroundColor: '#edf5fd',
      title: 'AceNote',
      webPreferences: this.securePreferences('index.js'),
    });
    this.mainWindow = main;
    main.once('ready-to-show', () => {
      if (this.quitting || this.mainWindow !== main) return;
      this.mainReady = true;
      this.focusMain();
    });
    main.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      main.hide();
    });
    main.on('closed', () => {
      if (this.mainWindow !== main) return;
      this.mainWindow = null;
      this.mainReady = false;
    });
    this.loadRenderer(main, null);
  }

  private createPet(): void {
    const saved = readPosition(this.positionFile());
    const area = screen.getPrimaryDisplay().workArea;
    const fallback = defaultPosition(area, {
      width: PET_WIDTH,
      height: PET_HEIGHT,
    });
    const position = clampPosition(
      saved ? { x: saved.x, y: saved.y - PET_MESSAGE_HEIGHT } : fallback,
      { width: PET_WIDTH, height: PET_HEIGHT },
      screen.getAllDisplays().map((display) => display.workArea),
    );
    this.petWindow = new BrowserWindow({
      x: position.x,
      y: position.y,
      width: PET_WIDTH,
      height: PET_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      webPreferences: this.securePreferences('pet.js'),
    });
    this.petWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: false,
    });
    this.petWindow.on('ready-to-show', () => {
      if (this.quitting) return;
      this.petWindow?.show();
      this.petWindow?.setIgnoreMouseEvents(true, { forward: true });
    });
    this.petWindow.on('closed', () => {
      this.petWindow = null;
    });
    this.petWindow.webContents.on('context-menu', () => {
      Menu.buildFromTemplate([
        { label: '打开完整记录', click: () => this.focusMain() },
        { type: 'separator' },
        { label: '退出 AceNote', click: () => this.onQuit() },
      ]).popup({ window: this.petWindow! });
    });
    this.petWindow.webContents.on('will-navigate', (event) =>
      event.preventDefault(),
    );
    this.loadRenderer(this.petWindow, 'pet');
  }

  private securePreferences(preload: string) {
    return {
      preload: join(__dirname, `../preload/${preload}`),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    };
  }

  private loadRenderer(
    window: BrowserWindow,
    page: 'pet' | 'quick-input' | null,
  ): void {
    if (process.env.ELECTRON_RENDERER_URL) {
      const suffix = page ? `/${page}/index.html` : '/index.html';
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${suffix}`);
    } else {
      void window.loadFile(
        join(__dirname, `../renderer/${page ? `${page}/` : ''}index.html`),
      );
    }
  }

  private positionFile(): string {
    return join(app.getPath('userData'), 'pet-position.json');
  }

  private savePetPosition(): void {
    if (!this.petWindow) return;
    const [x, y] = this.petWindow.getPosition();
    // Persist the character anchor so existing 220px pet positions stay valid.
    writePosition(this.positionFile(), {
      x: x ?? 0,
      y: (y ?? 0) + PET_MESSAGE_HEIGHT,
    });
  }

  private registerIpc(): void {
    ipcMain.handle('pet:open-today', () => this.openQuickInput());
    ipcMain.handle('pet:focus-main', () => this.focusMain());
    ipcMain.on('quick-input:close', () => this.closeQuickInput());
    ipcMain.on('quick-input:focus-main', () => this.focusMain());
    ipcMain.on('pet:set-interactive', (_event, interactive: boolean) => {
      this.petWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
    });
    ipcMain.on('pet:drag-start', (_event, screenX: number, screenY: number) => {
      const [x, y] = this.petWindow?.getPosition() ?? [0, 0];
      this.dragOffset = { x: screenX - (x ?? 0), y: screenY - (y ?? 0) };
    });
    ipcMain.on('pet:drag-move', (_event, screenX: number, screenY: number) => {
      if (!this.dragOffset || !this.petWindow) return;
      const position = clampPosition(
        {
          x: Math.round(screenX - this.dragOffset.x),
          y: Math.round(screenY - this.dragOffset.y),
        },
        { width: PET_WIDTH, height: PET_HEIGHT },
        screen.getAllDisplays().map((display) => display.workArea),
      );
      this.petWindow.setPosition(position.x, position.y);
    });
    ipcMain.on('pet:drag-end', () => {
      this.dragOffset = null;
      this.savePetPosition();
    });
  }
}
