import { useState } from 'react'
import { TAG_COLORS, type Collection, type FileItem, type Tag } from '@shared/api'
import type { LabelFields } from '../components/LabelDialog'
import type { MenuAt, MenuEntry } from '../components/Menu'
import type { Selection } from '../types'

export type LabelKind = 'tag' | 'collection'
type Label = Tag | Collection

interface Options {
  tags: Tag[]
  collections: Collection[]
  scope: Selection
  setScope(scope: Selection): void
  notify(message: string): void
  // Tags or collections changed: refresh the sidebar and the file list.
  changed(): void
  openMenu(menu: MenuAt): void
}

export interface Editing {
  kind: LabelKind
  label: Label | null
  initial: LabelFields
  // Files to add to a new tag or collection once it exists.
  assign: number[]
}

const ids = (files: FileItem[]) => files.map((f) => f.id)
const filesWord = (n: number) => (n === 1 ? '1 file' : `${n} files`)
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function useOrganize(o: Options) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<{ kind: LabelKind; label: Label } | null>(null)

  const startCreate = (kind: LabelKind, assign: FileItem[] = []) =>
    setEditing({
      kind,
      label: null,
      initial: { name: '', color: TAG_COLORS[o.tags.length % TAG_COLORS.length], description: '' },
      assign: ids(assign)
    })

  const startEdit = (kind: LabelKind, label: Label) =>
    setEditing({
      kind,
      label,
      initial: {
        name: label.name,
        color: 'color' in label ? label.color : TAG_COLORS[0],
        description: 'description' in label ? (label.description ?? '') : ''
      },
      assign: []
    })

  const save = async (fields: LabelFields): Promise<string | null> => {
    if (!editing) return null
    const { kind, label, assign } = editing
    let id: number
    if (kind === 'tag') {
      const result = label
        ? await window.api.tags.update(label.id, { name: fields.name, color: fields.color })
        : await window.api.tags.create(fields.name, fields.color)
      if (!result.ok) return result.message
      id = result.tag.id
      if (assign.length > 0) await window.api.tags.assign(assign, id, true)
    } else {
      const changes = { name: fields.name, description: fields.description }
      const result = label
        ? await window.api.collections.update(label.id, changes)
        : await window.api.collections.create(fields.name, fields.description)
      if (!result.ok) return result.message
      id = result.collection.id
      if (assign.length > 0) await window.api.collections.assign(assign, id, true)
    }
    setEditing(null)
    o.changed()
    if (assign.length > 0) {
      o.notify(kind === 'tag' ? `Tagged ${filesWord(assign.length)} "${fields.name.trim()}".` : `Added ${filesWord(assign.length)} to "${fields.name.trim()}".`)
    }
    return null
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const { kind, label } = deleting
    setDeleting(null)
    if (kind === 'tag') await window.api.tags.remove(label.id)
    else await window.api.collections.remove(label.id)
    if (o.scope.kind === kind && o.scope.id === label.id) o.setScope({ kind: 'library', id: 'all' })
    o.changed()
  }

  const setTag = async (files: FileItem[], tag: Tag, on: boolean) => {
    await window.api.tags.assign(ids(files), tag.id, on)
    o.changed()
  }

  // Applies the tag with this name, creating it first when there is none.
  const addTagByName = async (files: FileItem[], name: string): Promise<boolean> => {
    let tag = o.tags.find((t) => sameName(t.name, name))
    if (!tag) {
      const result = await window.api.tags.create(name)
      if (!result.ok) {
        o.notify(result.message)
        return false
      }
      tag = result.tag
    }
    await setTag(files, tag, true)
    return true
  }

  const setCollection = async (files: FileItem[], collection: Collection, on: boolean) => {
    await window.api.collections.assign(ids(files), collection.id, on)
    o.changed()
  }

  // Files dragged onto a tag or collection in the sidebar.
  const dropFiles = async (kind: LabelKind, labelId: number, fileIds: number[]) => {
    const label = kind === 'tag' ? o.tags.find((t) => t.id === labelId) : o.collections.find((c) => c.id === labelId)
    if (!label || fileIds.length === 0) return
    if (kind === 'tag') await window.api.tags.assign(fileIds, labelId, true)
    else await window.api.collections.assign(fileIds, labelId, true)
    o.changed()
    o.notify(kind === 'tag' ? `Tagged ${filesWord(fileIds.length)} "${label.name}".` : `Added ${filesWord(fileIds.length)} to "${label.name}".`)
  }

  const count = (files: FileItem[], key: 'tagIds' | 'collectionIds', id: number) =>
    files.filter((f) => f[key].includes(id)).length

  const tagEntries = (files: FileItem[]): MenuEntry[] => [
    { heading: 'Tags' },
    ...o.tags.map((tag) => {
      const all = count(files, 'tagIds', tag.id) === files.length
      return { label: tag.name, dot: tag.color, checked: all, onSelect: () => void setTag(files, tag, !all) }
    }),
    ...(o.tags.length > 0 ? [{ separator: true } as const] : []),
    { label: 'New tag…', onSelect: () => startCreate('tag', files) }
  ]

  const collectionEntries = (files: FileItem[]): MenuEntry[] => [
    { heading: 'Add to collection' },
    ...o.collections.map((c) => {
      const all = count(files, 'collectionIds', c.id) === files.length
      return { label: c.name, checked: all, onSelect: () => void setCollection(files, c, !all) }
    }),
    ...(o.collections.length > 0 ? [{ separator: true } as const] : []),
    { label: 'New collection…', onSelect: () => startCreate('collection', files) }
  ]

  // Entries for the file context menu. Pickers open as a second menu at the same point.
  const fileMenuEntries = (files: FileItem[], x: number, y: number): MenuEntry[] => {
    const scoped = o.scope.kind === 'collection' ? o.collections.find((c) => c.id === o.scope.id) : undefined
    return [
      { label: 'Tags…', onSelect: () => o.openMenu({ x, y, entries: tagEntries(files) }) },
      { label: 'Add to collection…', onSelect: () => o.openMenu({ x, y, entries: collectionEntries(files) }) },
      ...(scoped
        ? [{ label: `Remove from "${scoped.name}"`, onSelect: () => void setCollection(files, scoped, false) }]
        : [])
    ]
  }

  // Right-click on a tag or collection in the sidebar.
  const labelMenuEntries = (kind: LabelKind, label: Label): MenuEntry[] => [
    { label: 'Edit…', onSelect: () => startEdit(kind, label) },
    { label: 'Delete…', danger: true, onSelect: () => setDeleting({ kind, label }) }
  ]

  return {
    editing,
    deleting,
    dialogOpen: editing !== null || deleting !== null,
    startCreate,
    save,
    cancelEdit: () => setEditing(null),
    requestDelete: (kind: LabelKind, label: Label) => setDeleting({ kind, label }),
    confirmDelete,
    cancelDelete: () => setDeleting(null),
    setTag,
    addTagByName,
    setCollection,
    dropFiles,
    collectionEntries,
    fileMenuEntries,
    labelMenuEntries
  }
}
