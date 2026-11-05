import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ScanProgress, type ThreeFmApi } from '@shared/api'

const api: ThreeFmApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo)
  },
  library: {
    stats: () => ipcRenderer.invoke(IPC.libraryStats)
  },
  folders: {
    list: () => ipcRenderer.invoke(IPC.foldersList),
    pickAndAdd: () => ipcRenderer.invoke(IPC.foldersPickAndAdd),
    remove: (id) => ipcRenderer.invoke(IPC.foldersRemove, id),
    reveal: (id) => ipcRenderer.invoke(IPC.foldersReveal, id),
    rescan: (id) => ipcRenderer.invoke(IPC.foldersRescan, id),
    onScanProgress: (listener) => {
      const handler = (_e: Electron.IpcRendererEvent, progress: ScanProgress) => listener(progress)
      ipcRenderer.on(IPC.scanProgress, handler)
      return () => ipcRenderer.removeListener(IPC.scanProgress, handler)
    }
  },
  files: {
    query: (query) => ipcRenderer.invoke(IPC.filesQuery, query)
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagsList)
  },
  collections: {
    list: () => ipcRenderer.invoke(IPC.collectionsList)
  }
}

contextBridge.exposeInMainWorld('api', api)
