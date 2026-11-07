# 3FM — 3D Files Manager

A Windows desktop app for cataloging, previewing and organizing 3D printing files (STL, 3MF, G-code).
Add your model folders, search them, tag files, group them into collections, and open them in
Bambu Studio, OrcaSlicer, Cura or PrusaSlicer.

## Stack

Electron · React · TypeScript · Vite (electron-vite) · Tailwind CSS · SQLite (better-sqlite3) · three.js (viewer)

## Develop

```bash
npm install      # also rebuilds better-sqlite3 for Electron
npm run dev      # app with hot reload
npm run typecheck
npm test         # vitest, run inside Electron
npm run dist     # Windows installer in dist/
```

App data (database, thumbnail cache, settings) lives in `%APPDATA%\3FM`.

The installer adds 3FM to Explorer's **Open with** for `.stl`, `.3mf` and `.gcode` files without
changing their default program. A file opened that way is selected in the catalog if it is in
one of your folders; any other file opens in a quick view, read-only and without being cataloged.
After editing `build/icon.svg`, regenerate the icon with `npx electron scripts/make-icon.cjs`.

## Layout

```
src/main/        Electron main process: window, IPC handlers, SQLite (db/)
src/preload/     contextBridge API exposed to the renderer as window.api
src/shared/      Types and IPC channel names shared by all processes
src/renderer/    React UI
```

## Roadmap

1. Scaffold — Electron + React + TS, SQLite schema with migrations ✅
2. Catalog and search — folder scanning, grid/list, filters, search prefixes ✅
3. Viewer — STL, 3MF, G-code preview and metadata ✅
4. File operations and slicers — rename, delete to Recycle Bin, Open with ✅
5. Tags and collections — create, edit, assign from the panel, menus or drag and drop ✅
6. Folder watcher, move detection, Missing view, thumbnails ✅
7. Polish and packaging — installer, open STL/3MF/G-code from Explorer into a quick view, settings, theme, shortcuts ✅
