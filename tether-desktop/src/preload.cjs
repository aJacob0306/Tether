const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tetherDesktop", {
  getStatus: () => ipcRenderer.invoke("auth:status"),
  signIn: (credentials) => ipcRenderer.invoke("auth:signIn", credentials),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  syncApps: () => ipcRenderer.invoke("apps:sync"),
  onTrackingStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("tracking:status", listener);
    return () => ipcRenderer.removeListener("tracking:status", listener);
  },
});
