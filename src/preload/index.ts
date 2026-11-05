import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ThreeFmApi } from '@shared/api'

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
    reveal: (id) => ipcRenderer.invoke(IPC.foldersReveal, id)
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagsList)
  },
  collections: {
    list: () => ipcRenderer.invoke(IPC.collectionsList)
  }
}

contextBridge.exposeInMainWorld('api', api)
