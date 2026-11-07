import { useEffect } from 'react'
import type { AppsState, Folder, QuickFile } from '@shared/api'
import { handles } from '../apps'
import { quickSource, useModel } from '../hooks/useModel'
import { formatBytes, formatDate, TYPE_LABEL, dirname } from '../format'
import type { MenuAt } from './Menu'
import { ViewerButton } from './ModelViewer'
import ModelStage from './ModelStage'
import { Details, FeatureLegend, ModelDetails, Row } from './ModelInfo'
import { ActionButton } from './PreviewPanel'

// A file opened from Explorer that isn't in the catalog: its 3D view and
// details, without adding it anywhere. Escape or the backdrop closes it.
export default function QuickView(props: {
  file: QuickFile
  apps: AppsState
  // A menu or dialog is open on top, and Escape is theirs.
  covered: boolean
  onClose(): void
  notify(message: string): void
  openMenu(menu: MenuAt): void
  onManageApps(): void
  // The file's folder was added to the catalog.
  onFolderAdded(folder: Folder): void
}) {
  const { file, covered, onClose } = props
  const { state, loadLarge } = useModel(quickSource(file))
  const model = state.status === 'ready' ? state.model : null
  const toolpath = model?.geometry?.kind === 'toolpath' ? model.geometry : null

  const apps = props.apps.apps.filter((a) => handles(a, file.ext))
  const chosen = apps.find((a) => a.id === props.apps.defaults[file.ext]) ?? apps[0] ?? null

  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [covered, onClose])

  const openIn = async (appId: number, name: string) => {
    const result = await window.api.quick.open(appId)
    props.notify(result.ok ? `Opening ${file.name} in ${name}…` : result.message)
  }

  const addFolder = async () => {
    const result = await window.api.quick.addFolder()
    if (result.ok) props.onFolderAdded(result.folder)
    else props.notify(result.message)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view of ${file.name}`}
        className="fixed inset-8 z-50 flex overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-[#15181e]"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <ModelStage
            state={state}
            size={file.size}
            onLoad={loadLarge}
            toolbar={
              <ViewerButton title="Close quick view" onClick={onClose}>
                ✕
              </ViewerButton>
            }
          />
          {toolpath && (
            <div className="pt-5">
              <FeatureLegend geometry={toolpath} />
            </div>
          )}
        </div>
        <div className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Quick view</p>
          <h2 className="mt-1 text-sm font-semibold break-all select-text">{file.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">Not in your catalog. Nothing is added or changed.</p>

          <div className="mt-3 flex flex-col gap-2">
            {chosen ? (
              <div className="flex">
                <button
                  type="button"
                  onClick={() => void openIn(chosen.id, chosen.name)}
                  className="h-8 min-w-0 flex-1 truncate rounded-l-md bg-accent px-3 text-xs font-medium text-white hover:brightness-110"
                >
                  Open in {chosen.name}
                </button>
                <button
                  type="button"
                  title="Open with…"
                  aria-label="Open with…"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    props.openMenu({
                      x: r.right,
                      y: r.bottom + 4,
                      entries: [
                        { heading: 'Open with' },
                        ...apps.map((a) => ({ label: a.name, onSelect: () => void openIn(a.id, a.name) })),
                        { separator: true },
                        { label: 'Choose default apps…', onSelect: props.onManageApps }
                      ]
                    })
                  }}
                  className="h-8 rounded-r-md border-l border-white/30 bg-accent px-2.5 text-xs text-white hover:brightness-110"
                >
                  ▾
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={props.onManageApps}
                className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-white hover:brightness-110"
              >
                Add a slicer to open it with…
              </button>
            )}
            <div className="flex gap-2">
              <ActionButton onClick={() => void window.api.quick.reveal()}>Show in folder</ActionButton>
              <ActionButton onClick={() => void addFolder()} title="Catalog every file in this folder">
                Add folder to catalog
              </ActionButton>
            </div>
          </div>

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
      </div>
    </>
  )
}
