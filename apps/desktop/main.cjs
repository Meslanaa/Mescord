const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
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
let quickTunnelProcess = null;
let quickTunnelStreamCleanups = [];
let quickTunnelStopRequested = false;

const QUICK_TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|cfargotunnel\.com)(?:\/[^\s"']*)?/i;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function sendConnectionEvent(payload) {
  sendToRenderer("connection:event", payload);
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

function createQuickTunnelState(overrides = {}) {
  return {
    status: "idle",
    publicUrl: "",
    targetUrl: connectionPresets.localhostUrl,
    startedAt: 0,
    message: "",
    error: "",
    ...overrides,
  };
}

let quickTunnelState = createQuickTunnelState();

function setQuickTunnelState(next = {}) {
  quickTunnelState = {
    ...quickTunnelState,
    ...next,
  };

  sendConnectionEvent({
    type: "quick-tunnel-status",
    state: quickTunnelState,
  });
}

function buildConnectionPayload() {
  return {
    ...runtimeConnectionConfig,
    connectionPresets: {
      ...connectionPresets,
      cloudflareUrl: quickTunnelState.publicUrl,
      quickTunnelStatus: quickTunnelState.status,
    },
    suggestedServerPort: connectionPresets.serverPort,
    suggestedLocalhostUrl: connectionPresets.localhostUrl,
    suggestedLanIp: connectionPresets.lanIp,
    suggestedLanUrl: connectionPresets.lanUrl,
    suggestedCloudflareUrl: quickTunnelState.publicUrl,
    quickTunnel: quickTunnelState,
  };
}

function resolveQuickTunnelTargetUrl(preferredUrl = "") {
  const preferred = normalizeUrl(preferredUrl || "");
  if (preferred) {
    return preferred;
  }

  const override = normalizeUrl(process.env.MESCORD_QUICK_TUNNEL_TARGET_URL || "");
  if (override) {
    return override;
  }

  const runtimeTarget = normalizeUrl(
    runtimeConnectionConfig.apiBaseUrl || runtimeConnectionConfig.signalingUrl || "",
  );
  if (runtimeTarget) {
    return runtimeTarget;
  }

  return connectionPresets.localhostUrl;
}

function extractQuickTunnelUrl(text) {
  if (typeof text !== "string") {
    return "";
  }

  const match = QUICK_TUNNEL_URL_REGEX.exec(text);
  if (!match || !match[0]) {
    return "";
  }

  return normalizeUrl(match[0]);
}

function closeQuickTunnelStreams() {
  quickTunnelStreamCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch {
      // Ignore cleanup races.
    }
  });

  quickTunnelStreamCleanups = [];
}

function handleQuickTunnelOutputLine(line) {
  if (typeof line !== "string" || !line.trim()) {
    return;
  }

  log.info(`[quick-tunnel] ${line}`);
  const discoveredUrl = extractQuickTunnelUrl(line);
  if (!discoveredUrl) {
    return;
  }

  if (quickTunnelState.status === "ready" && quickTunnelState.publicUrl === discoveredUrl) {
    return;
  }

  setQuickTunnelState({
    status: "ready",
    publicUrl: discoveredUrl,
    message: `Quick Tunnel hazir: ${discoveredUrl}`,
    error: "",
  });
}

function handleQuickTunnelOutputChunk(chunk) {
  const text = typeof chunk === "string" ? chunk : "";
  if (!text.trim()) {
    return;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    handleQuickTunnelOutputLine(line);
  });
}

function attachQuickTunnelStream(stream) {
  if (!stream || typeof stream.on !== "function") {
    return () => {};
  }

  const onData = (chunk) => {
    handleQuickTunnelOutputChunk(String(chunk || ""));
  };

  stream.on("data", onData);

  return () => {
    if (typeof stream.off === "function") {
      stream.off("data", onData);
      return;
    }

    if (typeof stream.removeListener === "function") {
      stream.removeListener("data", onData);
    }
  };
}

function ensureCloudflaredAvailable(command) {
  return new Promise((resolve) => {
    let settled = false;
    let child = null;

    const finish = (payload) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(payload);
    };

    try {
      child = spawn(command, ["--version"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish({
        ok: false,
        reason: "version-check-spawn-failed",
        message: error?.message || "cloudflared calistirilamadi.",
      });
      return;
    }

    const timeoutId = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignore kill race.
      }

      finish({
        ok: false,
        reason: "version-check-timeout",
        message: "cloudflared surum kontrolu zaman asimina ugradi.",
      });
    }, 5000);

    child.once("error", (error) => {
      clearTimeout(timeoutId);

      const missingBinary = error?.code === "ENOENT";
      finish({
        ok: false,
        reason: missingBinary ? "cloudflared-missing" : "version-check-error",
        message: missingBinary
          ? "cloudflared bulunamadi. Kurulum: winget install Cloudflare.cloudflared"
          : error?.message || "cloudflared calistirilamadi.",
      });
    });

    child.once("exit", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        finish({ ok: true });
        return;
      }

      finish({
        ok: false,
        reason: "version-check-failed",
        message: `cloudflared calistirilamadi (exit code ${code ?? "unknown"}).`,
      });
    });
  });
}

async function probeQuickTunnelTarget(targetUrl) {
  const normalizedTarget = normalizeUrl(targetUrl);
  if (!normalizedTarget) {
    return {
      ok: false,
      reason: "invalid-target-url",
      message: "Quick Tunnel hedef URL gecersiz.",
    };
  }

  const candidates = [`${normalizedTarget}/health`, normalizedTarget];
  let lastError = null;

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 4500);

    try {
      await fetch(candidate, {
        method: "GET",
        signal: controller.signal,
      });

      return {
        ok: true,
        candidate,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let targetPort = "3001";
  try {
    targetPort = new URL(normalizedTarget).port || "3001";
  } catch {
    targetPort = "3001";
  }

  return {
    ok: false,
    reason: "target-unreachable",
    message: `Hedef server ulasilamiyor: ${normalizedTarget}. Host PC'de serverin acik oldugundan emin ol (port ${targetPort}).`,
    error: lastError?.message || "",
  };
}

function waitForQuickTunnelReady(timeoutMs = 18000) {
  if (quickTunnelState.status === "ready" && quickTunnelState.publicUrl) {
    return Promise.resolve({
      ok: true,
      state: quickTunnelState,
    });
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();

    const timerId = setInterval(() => {
      if (quickTunnelState.status === "ready" && quickTunnelState.publicUrl) {
        clearInterval(timerId);
        resolve({ ok: true, state: quickTunnelState });
        return;
      }

      if (quickTunnelState.status === "error") {
        clearInterval(timerId);
        resolve({
          ok: false,
          reason: "runtime-error",
          message: quickTunnelState.error || quickTunnelState.message || "Quick Tunnel basarisiz oldu.",
          state: quickTunnelState,
        });
        return;
      }

      if (!quickTunnelProcess) {
        clearInterval(timerId);
        resolve({
          ok: false,
          reason: "process-exited",
          message: quickTunnelState.error || "Quick Tunnel sureci sonlandi.",
          state: quickTunnelState,
        });
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timerId);
        resolve({
          ok: false,
          reason: "ready-timeout",
          message: "Quick Tunnel URL belirlenen surede alinamadi.",
          state: quickTunnelState,
        });
      }
    }, 220);
  });
}

function resolveQuickTunnelReadyTimeoutMs() {
  const raw = Number(process.env.MESCORD_QUICK_TUNNEL_READY_TIMEOUT_MS || 18000);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }

  return 18000;
}

async function startQuickTunnel(preferredUrl = "") {
  if (quickTunnelProcess) {
    return {
      ok: true,
      state: quickTunnelState,
      alreadyRunning: true,
    };
  }

  const targetUrl = resolveQuickTunnelTargetUrl(preferredUrl);
  if (!targetUrl) {
    const message = "Quick Tunnel hedef URL bulunamadi.";
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: "missing-target-url",
      message,
      state: quickTunnelState,
    };
  }

  const command = String(process.env.MESCORD_CLOUDFLARED_BIN || "cloudflared").trim() || "cloudflared";
  const args = ["tunnel", "--url", targetUrl, "--no-autoupdate"];

  const binaryCheck = await ensureCloudflaredAvailable(command);
  if (!binaryCheck.ok) {
    const message =
      binaryCheck.message || "cloudflared kullanilamiyor. Kurulum: winget install Cloudflare.cloudflared";
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: binaryCheck.reason || "cloudflared-unavailable",
      message,
      state: quickTunnelState,
    };
  }

  const targetProbe = await probeQuickTunnelTarget(targetUrl);
  if (!targetProbe.ok) {
    const message = targetProbe.message || "Quick Tunnel hedefi ulasilamiyor.";
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: targetProbe.reason || "target-unreachable",
      message,
      state: quickTunnelState,
    };
  }

  try {
    closeQuickTunnelStreams();
    quickTunnelProcess = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = error?.message || "Quick Tunnel baslatilamadi.";
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: "spawn-failed",
      message,
      state: quickTunnelState,
    };
  }

  quickTunnelStopRequested = false;
  setQuickTunnelState(
    createQuickTunnelState({
      status: "starting",
      targetUrl,
      startedAt: Date.now(),
      message: `Quick Tunnel baslatiliyor (${targetUrl})`,
    }),
  );

  quickTunnelStreamCleanups = [
    attachQuickTunnelStream(quickTunnelProcess.stdout),
    attachQuickTunnelStream(quickTunnelProcess.stderr),
  ];

  quickTunnelProcess.once("error", (error) => {
    log.error("Quick Tunnel process error", error);
    closeQuickTunnelStreams();
    quickTunnelProcess = null;

    const missingBinary = error?.code === "ENOENT";
    const message = missingBinary
      ? "cloudflared bulunamadi. Kurulum: winget install Cloudflare.cloudflared"
      : error?.message || "Quick Tunnel baslatma hatasi";

    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });
  });

  quickTunnelProcess.once("exit", (code, signal) => {
    closeQuickTunnelStreams();
    quickTunnelProcess = null;

    const stoppedByUser = quickTunnelStopRequested;
    quickTunnelStopRequested = false;

    if (stoppedByUser) {
      setQuickTunnelState(
        createQuickTunnelState({
          status: "idle",
          message: "Quick Tunnel durduruldu.",
        }),
      );
      return;
    }

    if (quickTunnelState.status === "error") {
      return;
    }

    const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
    const message = `Quick Tunnel kapandi (${reason}).`;
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });
  });

  const readyResult = await waitForQuickTunnelReady(resolveQuickTunnelReadyTimeoutMs());
  if (!readyResult.ok) {
    if (quickTunnelProcess) {
      try {
        quickTunnelProcess.kill();
      } catch {
        // Ignore shutdown race.
      }
    }

    const message = readyResult.message || "Quick Tunnel URL alinamadi.";
    setQuickTunnelState({
      status: "error",
      publicUrl: "",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: readyResult.reason || "ready-timeout",
      message,
      state: quickTunnelState,
    };
  }

  return {
    ok: true,
    state: quickTunnelState,
  };
}

async function stopQuickTunnel() {
  if (!quickTunnelProcess) {
    setQuickTunnelState(
      createQuickTunnelState({
        status: "idle",
        message: "Quick Tunnel zaten kapali.",
      }),
    );

    return {
      ok: true,
      state: quickTunnelState,
      alreadyStopped: true,
    };
  }

  try {
    quickTunnelStopRequested = true;
    setQuickTunnelState({
      status: "stopping",
      message: "Quick Tunnel durduruluyor...",
      error: "",
    });
    quickTunnelProcess.kill();
  } catch (error) {
    quickTunnelStopRequested = false;
    const message = error?.message || "Quick Tunnel durdurulamadi.";
    setQuickTunnelState({
      status: "error",
      message,
      error: message,
    });

    return {
      ok: false,
      reason: "stop-failed",
      message,
      state: quickTunnelState,
    };
  }

  return {
    ok: true,
    state: quickTunnelState,
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
    ...buildConnectionPayload(),
  }));

  ipcMain.handle("desktop:connection-config", () => ({
    ...buildConnectionPayload(),
  }));

  ipcMain.handle("desktop:get-quick-tunnel-status", async () => ({
    ok: true,
    state: quickTunnelState,
  }));

  ipcMain.handle("desktop:start-quick-tunnel", async (_event, payload = {}) => {
    const preferredUrl = typeof payload?.targetUrl === "string" ? payload.targetUrl : "";
    return startQuickTunnel(preferredUrl);
  });

  ipcMain.handle("desktop:stop-quick-tunnel", async () => stopQuickTunnel());

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

  if (process.env.MESCORD_AUTO_QUICK_TUNNEL === "1") {
    startQuickTunnel();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  updateDownloadInProgress = false;

  if (quickTunnelProcess) {
    quickTunnelStopRequested = true;
    try {
      quickTunnelProcess.kill();
    } catch {
      // Ignore shutdown race if process already exited.
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
