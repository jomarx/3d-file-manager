import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import {
  IPC,
  type AddAppResult,
  type AddFolderResult,
  type AppInfo,
  type FileQuery
} from '@shared/api'
import { detectApps } from './apps/detect'
import { addApp, appsState, removeApp, setDefaultApp, syncDetectedApps } from './db/apps'
import { SCHEMA_VERSION } from './db/migrations'
import { getFile, getFiles, queryFiles } from './db/files'
import { openFiles, openFilesWithSystem, renameFile, trashFiles, trashWarnings } from './fileops'
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

  ipcMain.handle(IPC.filesOpen, (_e, ids: number[], appId: number | null) =>
    openFiles(ids, appId, (p) => shell.openPath(p))
  )

  ipcMain.handle(IPC.filesOpenSystem, (_e, ids: number[]) => openFilesWithSystem(ids, (p) => shell.openPath(p)))

  ipcMain.handle(IPC.filesReveal, (_e, id: number) => {
    const file = getFile(id)
    if (file && !file.missing) shell.showItemInFolder(file.path)
  })

  ipcMain.handle(IPC.filesCopyPaths, (_e, ids: number[]) => {
    clipboard.writeText(getFiles(ids).map((f) => f.path).join('\r\n'))
  })

  ipcMain.handle(IPC.filesRename, (_e, id: number, name: string) => renameFile(id, name))

  ipcMain.handle(IPC.filesTrashWarnings, (_e, ids: number[]) => trashWarnings(ids))

  ipcMain.handle(IPC.filesTrash, (_e, ids: number[]) => trashFiles(ids, (p) => shell.trashItem(p)))

  ipcMain.handle(IPC.appsList, () => appsState())

  ipcMain.handle(IPC.appsDetect, () => syncDetectedApps(detectApps()))

  ipcMain.handle(IPC.appsPickAndAdd, async (event): Promise<AddAppResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Add a program to open files with',
      defaultPath: process.env.ProgramFiles,
      properties: ['openFile' as const],
      filters: [{ name: 'Programs', extensions: ['exe'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, reason: 'cancelled', message: 'No program selected.' }
    }
    return addApp(picked.filePaths[0])
  })

  ipcMain.handle(IPC.appsRemove, (_e, id: number) => removeApp(id))

  ipcMain.handle(IPC.appsSetDefault, (_e, ext: string, appId: number | null) => setDefaultApp(ext, appId))

  ipcMain.handle(IPC.tagsList, () => listTags())

  ipcMain.handle(IPC.collectionsList, () => listCollections())
}
