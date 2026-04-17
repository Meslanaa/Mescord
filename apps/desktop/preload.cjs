const { contextBridge, ipcRenderer } = require("electron");

const runtimeConfig = {
  apiBaseUrl: process.env.MESCORD_API_URL || "",
  signalingUrl: process.env.MESCORD_SIGNALING_URL || process.env.MESCORD_API_URL || "",
};

contextBridge.exposeInMainWorld("mescordDesktop", {
  isDesktop: true,
  runtimeConfig,
  getAppInfo: () => ipcRenderer.invoke("desktop:app-info"),
  getConnectionConfig: () => ipcRenderer.invoke("desktop:connection-config"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  onUpdateEvent: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("updates:event", wrapped);

    return () => {
      ipcRenderer.removeListener("updates:event", wrapped);
    };
  },
});
