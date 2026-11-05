import { useState } from 'react'
import type { AppsState, ExternalApp, FileItem } from '@shared/api'
import { appsFor, defaultApp } from '../apps'
import type { MenuEntry } from '../components/Menu'

// 'default': each type's chosen app, else the Windows default; 'system': the Windows default.
export type OpenTarget = 'default' | 'system' | ExternalApp

interface Options {
  apps: AppsState
  notify(message: string): void
  // Something changed on disk or in the catalog.
  changed(): void
  removed(ids: number[]): void
  startRename(): void
  manageApps(): void
}

const describe = (files: FileItem[]) => (files.length === 1 ? files[0].name : `${files.length} files`)

export function useFileActions(o: Options) {
  const [pendingTrash, setPendingTrash] = useState<{ files: FileItem[]; permanent: string[] } | null>(null)

  const openLabel = (files: FileItem[]): string => {
    const app = defaultApp(
      o.apps,
      files.filter((f) => !f.missing)
    )
    return app ? `Open in ${app.name}` : 'Open'
  }

  const open = async (files: FileItem[], target: OpenTarget = 'default') => {
    const present = files.filter((f) => !f.missing)
    if (present.length === 0) return
    const ids = present.map((f) => f.id)
    const result =
      target === 'system'
        ? await window.api.files.openSystem(ids)
        : await window.api.files.open(ids, target === 'default' ? null : target.id)
    if (!result.ok) return o.notify(result.message)
    // Slicers take a few seconds to show a window; say something meanwhile.
    const app = target === 'default' ? defaultApp(o.apps, present) : target === 'system' ? null : target
    if (app) o.notify(`Opening ${describe(present)} in ${app.name}…`)
  }

  const copyPaths = async (files: FileItem[]) => {
    await window.api.files.copyPaths(files.map((f) => f.id))
    o.notify(files.length === 1 ? 'Path copied.' : `${files.length} paths copied.`)
  }

  const rename = async (file: FileItem, name: string): Promise<boolean> => {
    const result = await window.api.files.rename(file.id, name)
    if (!result.ok) {
      o.notify(result.message)
      return false
    }
    o.changed()
    return true
  }

  const requestTrash = async (files: FileItem[]) => {
    if (files.length === 0) return
    const permanent = await window.api.files.trashWarnings(files.map((f) => f.id))
    setPendingTrash({ files, permanent })
  }

  const confirmTrash = async () => {
    if (!pendingTrash) return
    const { files } = pendingTrash
    setPendingTrash(null)
    const result = await window.api.files.trash(files.map((f) => f.id))
    o.removed(result.trashed)
    o.changed()
    if (result.failed.length > 0) {
      const [first, ...rest] = result.failed
      o.notify(
        `${first.name} could not be deleted: ${first.message}` +
          (rest.length > 0 ? ` (${rest.length} more failed)` : '')
      )
    } else if (files.every((f) => f.missing)) {
      o.notify(`Removed ${describe(files)} from the catalog.`)
    } else {
      o.notify(`Moved ${describe(files)} to the Recycle Bin.`)
    }
  }

  const openWithEntries = (files: FileItem[]): MenuEntry[] => {
    const disabled = files.every((f) => f.missing)
    return [
      { heading: 'Open with' },
      ...appsFor(o.apps, files).map((app) => ({ label: app.name, disabled, onSelect: () => void open(files, app) })),
      { label: 'Windows default program', disabled, onSelect: () => void open(files, 'system') },
      { separator: true },
      { label: 'Choose default apps…', onSelect: o.manageApps }
    ]
  }

  // organize holds the tag and collection entries, shown above Rename.
  const menuEntries = (files: FileItem[], organize: MenuEntry[] = []): MenuEntry[] => {
    const one = files.length === 1 && !files[0].missing ? files[0] : null
    const allMissing = files.every((f) => f.missing)
    return [
      { label: openLabel(files), hint: 'Enter', bold: true, disabled: allMissing, onSelect: () => void open(files) },
      { separator: true },
      ...openWithEntries(files),
      { separator: true },
      {
        label: 'Show in folder',
        disabled: !one,
        onSelect: () => one && void window.api.files.reveal(one.id)
      },
      { label: files.length === 1 ? 'Copy path' : 'Copy paths', onSelect: () => void copyPaths(files) },
      { separator: true },
      ...(organize.length > 0 ? [...organize, { separator: true } as const] : []),
      { label: 'Rename…', hint: 'F2', disabled: !one, onSelect: o.startRename },
      {
        label: allMissing ? 'Remove from catalog' : 'Move to Recycle Bin',
        hint: 'Del',
        danger: true,
        onSelect: () => void requestTrash(files)
      }
    ]
  }

  return {
    openLabel,
    open,
    rename,
    requestTrash,
    pendingTrash,
    confirmTrash,
    cancelTrash: () => setPendingTrash(null),
    openWithEntries,
    menuEntries
  }
}
