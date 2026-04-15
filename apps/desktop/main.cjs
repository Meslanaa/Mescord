const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

log.initialize();
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = true;

let mainWindow = null;
let updateAvailableInfo = null;
let updateReadyInfo = null;
let updateDownloadInProgress = false;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function getStartUrl() {
  const devServerUrl = process.env.MESCORD_DEV_SERVER_URL;
  if (devServerUrl) {
    return devServerUrl;
  }

  if (app.isPackaged) {
    return `file://${path.join(process.resourcesPath, "web-dist", "index.html")}`;
  }

  return `file://${path.join(__dirname, "..", "web", "dist", "index.html")}`;
}

function getUpdateFeed() {
  const owner = process.env.MESCORD_UPDATE_OWNER || "Meslanaa";
  const repo = process.env.MESCORD_UPDATE_REPO || "Mescord";

  return {
    provider: "github",
    owner,
    repo,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 930,
    minWidth: 1160,
    minHeight: 720,
    backgroundColor: "#050d17",
    title: "Mescord",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(getStartUrl());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerUpdateEvents() {
  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("updates:event", {
      type: "checking",
    });
  });

  autoUpdater.on("update-available", (info) => {
    updateAvailableInfo = info;
    sendToRenderer("updates:event", {
      type: "available",
      info,
    });
  });

  autoUpdater.on("update-not-available", () => {
    updateAvailableInfo = null;
    sendToRenderer("updates:event", {
      type: "not-available",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("updates:event", {
      type: "download-progress",
      progress,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateReadyInfo = info;
    updateDownloadInProgress = false;

    sendToRenderer("updates:event", {
      type: "downloaded",
      info,
    });
  });

  autoUpdater.on("error", (error) => {
    updateDownloadInProgress = false;
    sendToRenderer("updates:event", {
      type: "error",
      error: error?.message || "Bilinmeyen update hatasi",
    });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendToRenderer("updates:event", {
      type: "dev-mode",
      message: "Update kontrolu sadece paketlenmis uygulamada aciktir.",
    });
    return { ok: false, reason: "dev-mode" };
  }

  try {
    autoUpdater.setFeedURL(getUpdateFeed());
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    log.error("Auto update check failed", error);
    return { ok: false, reason: "check-failed", message: error?.message || "Update kontrolu basarisiz" };
  }
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    return { ok: false, reason: "dev-mode" };
  }

  if (!updateAvailableInfo) {
    return { ok: false, reason: "no-update" };
  }

  if (updateDownloadInProgress) {
    return { ok: false, reason: "already-downloading" };
  }

  try {
    updateDownloadInProgress = true;
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    updateDownloadInProgress = false;
    return { ok: false, reason: "download-failed", message: error?.message || "Indirme basarisiz" };
  }
}

function setupIpc() {
  ipcMain.handle("desktop:app-info", () => ({
    appVersion: app.getVersion(),
    appName: app.getName(),
    isPackaged: app.isPackaged,
    platform: process.platform,
  }));

  ipcMain.handle("desktop:check-updates", async () => checkForUpdates());

  ipcMain.handle("desktop:download-update", async () => downloadUpdate());

  ipcMain.handle("desktop:install-update", async () => {
    if (!updateReadyInfo) {
      return { ok: false, reason: "not-ready" };
    }

    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  ipcMain.handle("desktop:open-external", async (_event, url) => {
    if (typeof url !== "string") {
      return { ok: false };
    }

    await shell.openExternal(url);
    return { ok: true };
  });
}

app.whenReady().then(() => {
  createWindow();
  registerUpdateEvents();
  setupIpc();

  if (app.isPackaged) {
    checkForUpdates();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
