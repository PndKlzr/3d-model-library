import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("modelLibrary", {
  version: "0.1.0"
});
