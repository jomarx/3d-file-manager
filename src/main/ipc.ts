import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC, type AppInfo } from '@shared/api'
import { SCHEMA_VERSION } from './db/migrations'
import {
  addFolder,
  getFolder,
  libraryStats,
  listCollections,
  listFolders,
  listTags,
  removeFolder
} from './db/repo'

export function registerIpc(dbPath: string): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    dbPath,
    schemaVersion: SCHEMA_VERSION
  }))

  ipcMain.handle(IPC.libraryStats, () => libraryStats())

  ipcMain.handle(IPC.foldersList, () => listFolders())

  ipcMain.handle(IPC.foldersPickAndAdd, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Add folder to catalog', properties: ['openDirectory' as const] }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, reason: 'cancelled', message: 'No folder selected.' }
    }
    return addFolder(picked.filePaths[0])
  })

  ipcMain.handle(IPC.foldersRemove, (_e, id: number) => removeFolder(id))

  ipcMain.handle(IPC.foldersReveal, async (_e, id: number) => {
    const folder = getFolder(id)
    if (folder) await shell.openPath(folder.path)
  })

  ipcMain.handle(IPC.tagsList, () => listTags())

  ipcMain.handle(IPC.collectionsList, () => listCollections())
}
