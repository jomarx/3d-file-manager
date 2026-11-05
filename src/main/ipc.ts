import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC, type AddFolderResult, type AppInfo, type FileQuery } from '@shared/api'
import { SCHEMA_VERSION } from './db/migrations'
import { queryFiles } from './db/files'
import {
  addFolder,
  getFolder,
  libraryStats,
  listCollections,
  listFolders,
  listTags,
  removeFolder
} from './db/repo'
import type { Scanner } from './scan/scanner'

export function registerIpc(dbPath: string, scanner: Scanner): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    dbPath,
    schemaVersion: SCHEMA_VERSION
  }))

  ipcMain.handle(IPC.libraryStats, () => libraryStats())

  ipcMain.handle(IPC.foldersList, () => listFolders())

  ipcMain.handle(IPC.foldersPickAndAdd, async (event): Promise<AddFolderResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Add folder to catalog', properties: ['openDirectory' as const] }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, reason: 'cancelled', message: 'No folder selected.' }
    }
    const result = addFolder(picked.filePaths[0])
    if (result.ok) scanner.enqueue(result.folder.id)
    return result
  })

  ipcMain.handle(IPC.foldersRemove, (_e, id: number) => removeFolder(id))

  ipcMain.handle(IPC.foldersReveal, async (_e, id: number) => {
    const folder = getFolder(id)
    if (folder) await shell.openPath(folder.path)
  })

  ipcMain.handle(IPC.foldersRescan, (_e, id: number) => scanner.enqueue(id))

  ipcMain.handle(IPC.filesQuery, (_e, query: FileQuery) => queryFiles(query))

  ipcMain.handle(IPC.tagsList, () => listTags())

  ipcMain.handle(IPC.collectionsList, () => listCollections())
}
