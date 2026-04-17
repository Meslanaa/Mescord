const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

log.initialize();
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = true;
autoUpdater.allowDowngrade = true;

let mainWindow = null;
let updateAvailableInfo = null;
let updateReadyInfo = null;
let updateDownloadInProgress = false;
let manualReleaseInfo = null;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function triggerSilentInstall() {
  try {
    sendToRenderer("updates:event", {
      type: "installing",
      message: "Guncelleme kurulumu baslatiliyor. Mevcut kurulum dizini korunacak.",
    });
    // Non-silent install keeps NSIS remembered install directory reliably.
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    log.error("Auto update install failed", error);
    sendToRenderer("updates:event", {
      type: "error",
      error: error?.message || "Sessiz kurulum basarisiz oldu",
    });
  }
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

function normalizeVersionLabel(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/^v/i, "").toLowerCase();
}

function sameVersionLabel(left, right) {
  return normalizeVersionLabel(left) === normalizeVersionLabel(right);
}

function pickInstallerAsset(assets) {
  if (!Array.isArray(assets)) {
    return null;
  }

  const setupAsset = assets.find((asset) => {
    const name = typeof asset?.name === "string" ? asset.name : "";
    return /setup.*\.exe$/i.test(name);
  });
  if (setupAsset) {
    return setupAsset;
  }

  const genericExe = assets.find((asset) => {
    const name = typeof asset?.name === "string" ? asset.name : "";
    return name.toLowerCase().endsWith(".exe");
  });

  return genericExe || null;
}

async function fetchLatestGitHubRelease() {
  const feed = getUpdateFeed();
  const endpoint = `https://api.github.com/repos/${feed.owner}/${feed.repo}/releases/latest`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 9000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Mescord-Updater",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub release API hatasi: ${response.status}`);
    }

    const payload = await response.json();
    const asset = pickInstallerAsset(payload?.assets);

    return {
      id: payload?.id ? String(payload.id) : "",
      tagName: typeof payload?.tag_name === "string" ? payload.tag_name : "",
      htmlUrl: typeof payload?.html_url === "string" ? payload.html_url : "",
      installerUrl: typeof asset?.browser_download_url === "string" ? asset.browser_download_url : "",
      installerName: typeof asset?.name === "string" ? asset.name : "",
      publishedAt: typeof payload?.published_at === "string" ? payload.published_at : "",
      manual: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function setManualReleaseAvailable(info) {
  manualReleaseInfo = info;
  updateReadyInfo = null;
  updateDownloadInProgress = false;
  updateAvailableInfo = {
    version: info?.tagName || "",
    releaseId: info?.id || "",
    htmlUrl: info?.htmlUrl || "",
    installerUrl: info?.installerUrl || "",
    installerName: info?.installerName || "",
    publishedAt: info?.publishedAt || "",
    manual: true,
  };

  sendToRenderer("updates:event", {
    type: "available",
    info: updateAvailableInfo,
    message: "Yeni release algilandi. Sürüm adı farklı olsa da installer indirilebilir.",
  });
}

function normalizeUrl(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }

  const value = candidate.trim();
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
  } catch {
    return "";
  }
}

function getRuntimeConnectionConfig() {
  const apiBaseUrl = normalizeUrl(process.env.MESCORD_API_URL || "");
  const signalingUrl = normalizeUrl(process.env.MESCORD_SIGNALING_URL || apiBaseUrl || "");

  return {
    apiBaseUrl,
    signalingUrl,
  };
}

const runtimeConnectionConfig = getRuntimeConnectionConfig();

function getPrimaryLanAddress() {
  const all = os.networkInterfaces();
  const candidates = [];

  Object.values(all).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal || entry.family !== "IPv4") {
        return;
      }

      if (typeof entry.address !== "string" || !entry.address.trim()) {
        return;
      }

      const address = entry.address.trim();
      if (address.startsWith("169.254.")) {
        return;
      }

      candidates.push(address);
    });
  });

  const preferredPrivate = candidates.find((address) => {
    if (address.startsWith("10.")) {
      return true;
    }

    if (address.startsWith("192.168.")) {
      return true;
    }

    const match = /^172\.(\d+)\./.exec(address);
    if (!match) {
      return false;
    }

    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  });

  return preferredPrivate || candidates[0] || "";
}

function inferServerPort() {
  const fromRuntime = [runtimeConnectionConfig.apiBaseUrl, runtimeConnectionConfig.signalingUrl]
    .map((candidate) => {
      try {
        return new URL(candidate).port;
      } catch {
        return "";
      }
    })
    .find(Boolean);

  if (fromRuntime) {
    return Number(fromRuntime);
  }

  const fallback = Number(process.env.MESCORD_SERVER_PORT || process.env.PORT || 3001);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return 3001;
}

function buildConnectionPresets() {
  const serverPort = inferServerPort();
  const localhostUrl = `http://localhost:${serverPort}`;
  const lanIp = getPrimaryLanAddress();
  const lanUrl = lanIp ? `http://${lanIp}:${serverPort}` : "";

  return {
    serverPort,
    localhostUrl,
    lanIp,
    lanUrl,
  };
}

const connectionPresets = buildConnectionPresets();

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
    manualReleaseInfo = null;
    sendToRenderer("updates:event", {
      type: "checking",
    });
  });

  autoUpdater.on("update-available", (info) => {
    manualReleaseInfo = null;
    updateAvailableInfo = info;
    updateReadyInfo = null;
    updateDownloadInProgress = true;

    sendToRenderer("updates:event", {
      type: "available",
      info,
    });
  });

  autoUpdater.on("update-not-available", () => {
    manualReleaseInfo = null;
    updateAvailableInfo = null;
    updateReadyInfo = null;
    updateDownloadInProgress = false;

    sendToRenderer("updates:event", {
      type: "not-available",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    manualReleaseInfo = null;
    updateDownloadInProgress = true;

    sendToRenderer("updates:event", {
      type: "download-progress",
      progress,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    manualReleaseInfo = null;
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
    const currentVersion = app.getVersion();
    const result = await autoUpdater.checkForUpdates();

    const hasNativeUpdate = Boolean(
      result?.updateInfo?.version && !sameVersionLabel(result.updateInfo.version, currentVersion),
    );
    if (hasNativeUpdate || updateAvailableInfo) {
      return { ok: true, mode: "native" };
    }

    try {
      const latestRelease = await fetchLatestGitHubRelease();
      if (
        latestRelease?.tagName &&
        !sameVersionLabel(latestRelease.tagName, currentVersion)
      ) {
        setManualReleaseAvailable(latestRelease);
        return { ok: true, mode: "manual-tag-drift" };
      }
    } catch (fallbackError) {
      log.warn("Fallback release drift check failed", fallbackError);
    }

    return { ok: true, mode: "up-to-date" };
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

  const manualMode = Boolean(updateAvailableInfo?.manual || manualReleaseInfo?.manual);
  if (manualMode) {
    const targetUrl =
      updateAvailableInfo?.installerUrl ||
      updateAvailableInfo?.htmlUrl ||
      manualReleaseInfo?.installerUrl ||
      manualReleaseInfo?.htmlUrl ||
      "";

    if (!targetUrl) {
      return {
        ok: false,
        reason: "manual-link-missing",
        message: "Release indirilebilir baglantisi bulunamadi.",
      };
    }

    await shell.openExternal(targetUrl);
    sendToRenderer("updates:event", {
      type: "manual-download",
      message: "Installer indirme sayfasi tarayicida acildi.",
      info: {
        ...updateAvailableInfo,
        ...manualReleaseInfo,
      },
    });

    return { ok: true, mode: "manual-download" };
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
    installDirectory: path.dirname(app.getPath("exe")),
    ...runtimeConnectionConfig,
    connectionPresets,
    suggestedServerPort: connectionPresets.serverPort,
    suggestedLocalhostUrl: connectionPresets.localhostUrl,
    suggestedLanIp: connectionPresets.lanIp,
    suggestedLanUrl: connectionPresets.lanUrl,
  }));

  ipcMain.handle("desktop:connection-config", () => ({
    ...runtimeConnectionConfig,
    connectionPresets,
    suggestedServerPort: connectionPresets.serverPort,
    suggestedLocalhostUrl: connectionPresets.localhostUrl,
    suggestedLanIp: connectionPresets.lanIp,
    suggestedLanUrl: connectionPresets.lanUrl,
  }));

  ipcMain.handle("desktop:check-updates", async () => checkForUpdates());

  ipcMain.handle("desktop:download-update", async () => downloadUpdate());

  ipcMain.handle("desktop:install-update", async () => {
    if (!updateReadyInfo) {
      return { ok: false, reason: "not-ready" };
    }

    triggerSilentInstall();
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

app.on("before-quit", () => {
  updateDownloadInProgress = false;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
