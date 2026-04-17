const STORAGE_KEYS = {
  apiBaseUrl: "mescord:api-base-url",
  signalingUrl: "mescord:signaling-url",
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
  } catch {
    return "";
  }
}

function readStorage(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
      return;
    }

    localStorage.removeItem(key);
  } catch {
    // ignore storage write errors
  }
}

function readDesktopRuntimeValue(key) {
  const desktopApi = window?.mescordDesktop;
  if (!desktopApi || typeof desktopApi !== "object") {
    return "";
  }

  return normalizeUrl(desktopApi.runtimeConfig?.[key] || "");
}

export function getRuntimeConnectionConfig() {
  const storedApiBaseUrl = normalizeUrl(readStorage(STORAGE_KEYS.apiBaseUrl));
  const storedSignalingUrl = normalizeUrl(readStorage(STORAGE_KEYS.signalingUrl));

  const desktopApiBaseUrl = readDesktopRuntimeValue("apiBaseUrl");
  const desktopSignalingUrl = readDesktopRuntimeValue("signalingUrl");

  const envSignalingUrl = normalizeUrl(import.meta.env.VITE_SIGNALING_URL || "");
  const envApiBaseUrl = normalizeUrl(import.meta.env.VITE_API_URL || "");

  const signalingUrl =
    storedSignalingUrl || desktopSignalingUrl || envSignalingUrl || "http://localhost:3001";

  const apiBaseUrl = storedApiBaseUrl || desktopApiBaseUrl || envApiBaseUrl || signalingUrl;

  return {
    apiBaseUrl,
    signalingUrl,
  };
}

export function saveRuntimeConnectionConfig(payload = {}) {
  const nextApiBaseUrl = normalizeUrl(payload.apiBaseUrl || "");
  const nextSignalingUrl = normalizeUrl(payload.signalingUrl || "");

  if (!nextApiBaseUrl || !nextSignalingUrl) {
    return {
      ok: false,
      message: "API ve signaling URL alanlari gecerli olmalidir.",
    };
  }

  writeStorage(STORAGE_KEYS.apiBaseUrl, nextApiBaseUrl);
  writeStorage(STORAGE_KEYS.signalingUrl, nextSignalingUrl);

  return {
    ok: true,
    apiBaseUrl: nextApiBaseUrl,
    signalingUrl: nextSignalingUrl,
  };
}

export function isLocalhostUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return LOCALHOST_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isDesktopFileContext() {
  return Boolean(window?.mescordDesktop?.isDesktop) && window.location.protocol === "file:";
}
