const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mescordDesktop", {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke("desktop:app-info"),
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
