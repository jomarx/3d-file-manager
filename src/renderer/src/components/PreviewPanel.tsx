import type { FileItem } from '@shared/api'
import { formatBytes, formatDate, TYPE_LABEL, dirname } from '../format'

// Right-hand panel: 3D preview, metadata and file actions for the selection.
export default function PreviewPanel({ selected }: { selected: FileItem[] }) {
  const file = selected.length === 1 ? selected[0] : null

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-200 dark:border-zinc-800">
      <div className="m-4 grid aspect-square place-items-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-700">
        {selected.length === 0
          ? 'Select a file to preview'
          : file
            ? '3D preview coming soon'
            : `${selected.length} files selected`}
      </div>

      {file && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-semibold break-all select-text">{file.name}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-zinc-500">Type</dt>
            <dd>{file.ext === 'gcode.3mf' ? 'G-code (Bambu .gcode.3mf)' : TYPE_LABEL[file.type]}</dd>
            <dt className="text-zinc-500">Size</dt>
            <dd>{formatBytes(file.size)}</dd>
            <dt className="text-zinc-500">Modified</dt>
            <dd>{formatDate(file.mtime, true)}</dd>
            <dt className="text-zinc-500">Folder</dt>
            <dd className="break-all select-text">{dirname(file.path, file.name)}</dd>
          </dl>
        </div>
      )}

      {selected.length > 1 && (
        <p className="px-4 text-xs text-zinc-500">
          {formatBytes(selected.reduce((sum, f) => sum + f.size, 0))} in total
        </p>
      )}
    </aside>
  )
}
