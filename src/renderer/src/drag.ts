import type { DragEvent } from 'react'

// Files dragged from the grid or list carry their catalog ids under this type.
const FILES_TYPE = 'application/x-3fm-files'

export function startFileDrag(e: DragEvent, ids: number[], label: string): void {
  e.dataTransfer.setData(FILES_TYPE, JSON.stringify(ids))
  e.dataTransfer.setData('text/plain', label)
  e.dataTransfer.effectAllowed = 'copy'
}

// The data itself can only be read on drop, so dragover checks the type.
export const isFileDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(FILES_TYPE)

export function droppedFileIds(e: DragEvent): number[] {
  try {
    const ids: unknown = JSON.parse(e.dataTransfer.getData(FILES_TYPE))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}
