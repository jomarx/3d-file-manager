import { useEffect, useRef, useState, type ReactNode } from 'react'
import { thumbUrl, type FileItem } from '@shared/api'
import { catalogSource, useModel } from '../hooks/useModel'
import { formatBytes, formatDate, parseSqlDate, TYPE_LABEL, dirname } from '../format'
import { ViewerButton } from './ModelViewer'
import ModelStage, { Placeholder } from './ModelStage'
import { Details, FeatureLegend, ModelDetails, Row } from './ModelInfo'

interface Props {
  selected: FileItem[]
  openLabel: string
  renaming: boolean
  onRenamingChange(renaming: boolean): void
  onRename(file: FileItem, name: string): Promise<boolean>
  onOpen(): void
  // Shows the "Open with" menu at a point.
  onOpenWith(x: number, y: number): void
  onReveal(file: FileItem): void
  // Asks where a missing file went.
  onLocate(file: FileItem): void
  onTrash(): void
  // Tags and collections of the selection.
  organize: ReactNode
}

// Right-hand panel: 3D preview, metadata and file actions for the selection.
export default function PreviewPanel(props: Props) {
  const { selected } = props
  const file = selected.length === 1 ? selected[0] : null
  const { state, loadLarge } = useModel(file && !file.missing ? catalogSource(file) : null)
  const model = state.status === 'ready' ? state.model : null
  const toolpath = model?.geometry?.kind === 'toolpath' ? model.geometry : null

  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!file) setExpanded(false)
  }, [file])

  // Escape closes the large view first, before it would clear the selection.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded])

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-200 dark:border-zinc-800">
      {expanded && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setExpanded(false)} />}
      <div
        className={
          expanded
            ? 'fixed inset-8 z-50 flex flex-col overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-[#15181e]'
            : 'm-4 flex aspect-square shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60'
        }
      >
        {!file ? (
          <div className="relative min-h-0 flex-1">
            <Placeholder>
              {selected.length === 0 ? 'Select a file to preview' : `${selected.length} files selected`}
            </Placeholder>
          </div>
        ) : file.missing ? (
          <div className="relative min-h-0 flex-1">
            {file.thumb === 'ready' ? (
              <img
                src={thumbUrl(file.id, file.mtime)}
                alt=""
                className="absolute inset-0 h-full w-full object-contain p-4 opacity-40 grayscale"
              />
            ) : (
              <Placeholder>This file is missing from disk.</Placeholder>
            )}
          </div>
        ) : (
          <ModelStage
            state={state}
            size={file.size}
            onLoad={loadLarge}
            toolbar={
              <ViewerButton title={expanded ? 'Close large view' : 'Large view'} onClick={() => setExpanded((v) => !v)}>
                {expanded ? '✕' : '⤢'}
              </ViewerButton>
            }
          />
        )}
      </div>

      {toolpath && <FeatureLegend geometry={toolpath} />}

      {file && (
        <div className="px-4 pb-4">
          {props.renaming && !file.missing ? (
            <RenameField file={file} onRename={props.onRename} onDone={() => props.onRenamingChange(false)} />
          ) : (
            <h2
              className="text-sm font-semibold break-all select-text"
              onDoubleClick={() => !file.missing && props.onRenamingChange(true)}
            >
              {file.name}
            </h2>
          )}
          {file.missing && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              Missing from disk
              {file.missingSince && ` since ${formatDate(parseSqlDate(file.missingSince), true)}`}
            </p>
          )}
          <Actions {...props} />
          {props.organize}
          <Details>
            <Row label="Type">{file.ext === 'gcode.3mf' ? 'G-code (Bambu .gcode.3mf)' : TYPE_LABEL[file.type]}</Row>
            <Row label="Size">{formatBytes(file.size)}</Row>
            <Row label="Modified">{formatDate(file.mtime, true)}</Row>
            <Row label="Folder">
              <span className="break-all select-text">{dirname(file.path, file.name)}</span>
            </Row>
          </Details>
          {model && <ModelDetails model={model} />}
        </div>
      )}

      {selected.length > 1 && (
        <div className="px-4 pb-4">
          <p className="text-xs text-zinc-500">
            {formatBytes(selected.reduce((sum, f) => sum + f.size, 0))} in total
          </p>
          <Actions {...props} />
          {props.organize}
        </div>
      )}
    </aside>
  )
}

function Actions(props: Props) {
  const { selected } = props
  const one = selected.length === 1 && !selected[0].missing ? selected[0] : null
  const lost = selected.length === 1 && selected[0].missing ? selected[0] : null
  const allMissing = selected.every((f) => f.missing)
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex">
        <button
          type="button"
          disabled={allMissing}
          onClick={props.onOpen}
          title="Enter"
          className="h-8 min-w-0 flex-1 truncate rounded-l-md bg-accent px-3 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          {selected.length > 1 ? `${props.openLabel} (${selected.length})` : props.openLabel}
        </button>
        <button
          type="button"
          disabled={allMissing}
          title="Open with…"
          aria-label="Open with…"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            props.onOpenWith(r.right, r.bottom + 4)
          }}
          className="h-8 rounded-r-md border-l border-white/30 bg-accent px-2.5 text-xs text-white hover:brightness-110 disabled:opacity-40"
        >
          ▾
        </button>
      </div>
      <div className="flex gap-2">
        {lost ? (
          <ActionButton onClick={() => props.onLocate(lost)}>Locate…</ActionButton>
        ) : (
          <ActionButton disabled={!one} onClick={() => one && props.onReveal(one)}>
            Show in folder
          </ActionButton>
        )}
        <ActionButton disabled={!one} onClick={() => props.onRenamingChange(true)} title="F2">
          Rename
        </ActionButton>
        <ActionButton danger onClick={props.onTrash} title="Delete">
          {allMissing ? 'Remove' : 'Delete'}
        </ActionButton>
      </div>
    </div>
  )
}

export function ActionButton(props: {
  children: ReactNode
  onClick(): void
  disabled?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={[
        'h-7 flex-1 rounded-md border border-zinc-300 text-[11px] whitespace-nowrap hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800',
        props.danger ? 'text-red-600 dark:text-red-400' : ''
      ].join(' ')}
    >
      {props.children}
    </button>
  )
}

// Edits the name without its extension. Enter or leaving the field saves, Escape cancels.
function RenameField(props: { file: FileItem; onRename(file: FileItem, name: string): Promise<boolean>; onDone(): void }) {
  const { file } = props
  const suffix = file.name.slice(file.name.length - file.ext.length - 1)
  const [value, setValue] = useState(file.name.slice(0, file.name.length - suffix.length))
  const busy = useRef(false)
  const closed = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.select(), [])

  const finish = () => {
    closed.current = true
    props.onDone()
  }
  const submit = async (leaving: boolean) => {
    if (busy.current || closed.current) return
    const name = value.trim() + suffix
    if (name === file.name) return finish()
    busy.current = true
    const ok = await props.onRename(file, name)
    busy.current = false
    // A failed save from Enter keeps the field open to fix the name.
    if (ok || leaving) finish()
    else input.current?.select()
  }

  return (
    <div className="flex items-baseline gap-0.5">
      <input
        ref={input}
        value={value}
        aria-label="New name"
        spellCheck={false}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void submit(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit(false)
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            finish()
          }
        }}
        className="min-w-0 flex-1 rounded border border-accent bg-white px-1.5 py-0.5 text-sm font-semibold outline-none dark:bg-zinc-900"
      />
      <span className="text-sm text-zinc-500">{suffix}</span>
    </div>
  )
}
