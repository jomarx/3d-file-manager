import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FileItem } from '@shared/api'
import { Feature, type ParsedModel, type ToolpathGeometry } from '@shared/model'
import { useModel, type ModelState } from '../hooks/useModel'
import { FEATURE_STYLE } from '../viewer/scene'
import { formatBytes, formatDate, formatDuration, formatMm, numberFormat, TYPE_LABEL, dirname } from '../format'
import ModelViewer, { ViewerButton } from './ModelViewer'

// Right-hand panel: 3D preview, metadata and file actions for the selection.
export default function PreviewPanel({ selected }: { selected: FileItem[] }) {
  const file = selected.length === 1 ? selected[0] : null
  const { state, loadLarge } = useModel(file)
  const model = state.status === 'ready' ? state.model : null
  const toolpath = model?.geometry?.kind === 'toolpath' ? model.geometry : null

  const [expanded, setExpanded] = useState(false)
  const [showImage, setShowImage] = useState(false)
  const [layers, setLayers] = useState(0)
  useEffect(() => setLayers(toolpath?.layerEnds.length ?? 0), [toolpath])
  useEffect(() => setShowImage(false), [file?.id])
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

  const thumbnailUrl = useObjectUrl(model?.thumbnail)

  const toolbar = (
    <>
      {thumbnailUrl && (
        <ViewerButton title="Slicer thumbnail" active={showImage} onClick={() => setShowImage((v) => !v)}>
          Image
        </ViewerButton>
      )}
      <ViewerButton title={expanded ? 'Close large view' : 'Large view'} onClick={() => setExpanded((v) => !v)}>
        {expanded ? '✕' : '⤢'}
      </ViewerButton>
    </>
  )

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
        <div className="relative min-h-0 flex-1">
          {selected.length === 0 ? (
            <Placeholder>Select a file to preview</Placeholder>
          ) : !file ? (
            <Placeholder>{selected.length} files selected</Placeholder>
          ) : model?.geometry && !(showImage && thumbnailUrl) ? (
            <ModelViewer geometry={model.geometry} layers={toolpath ? layers : undefined} toolbar={toolbar} />
          ) : model && thumbnailUrl ? (
            <>
              <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-4" />
              <div className="absolute top-2 right-2 flex gap-1">{model.geometry ? toolbar : null}</div>
            </>
          ) : (
            <Status state={state} file={file} onLoad={loadLarge} />
          )}
        </div>
        {toolpath && !showImage && (
          <LayerSlider geometry={toolpath} layers={layers} onChange={setLayers} />
        )}
      </div>

      {toolpath && <FeatureLegend geometry={toolpath} />}

      {file && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-semibold break-all select-text">{file.name}</h2>
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
        <p className="px-4 text-xs text-zinc-500">
          {formatBytes(selected.reduce((sum, f) => sum + f.size, 0))} in total
        </p>
      )}
    </aside>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center p-4 text-center text-xs text-zinc-400">{children}</div>
}

function Status({ state, file, onLoad }: { state: ModelState; file: FileItem; onLoad(): void }) {
  if (state.status === 'large') {
    return (
      <Placeholder>
        <div className="flex flex-col items-center gap-3">
          <span>
            This file is {formatBytes(file.size)}.
            <br />
            Previewing it may take a moment.
          </span>
          <button
            type="button"
            onClick={onLoad}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            Load preview
          </button>
        </div>
      </Placeholder>
    )
  }
  if (state.status === 'error') {
    return <Placeholder><span className="text-red-500 dark:text-red-400">{state.message}</span></Placeholder>
  }
  if (state.status === 'ready') return <Placeholder>Nothing to draw in this file.</Placeholder>
  const loading = state.status === 'loading' ? state : null
  const fraction = loading && loading.total > 0 ? loading.loaded / loading.total : 0
  return (
    <Placeholder>
      <div className="flex w-40 flex-col items-center gap-2">
        <span>
          {loading?.parsing
            ? 'Building preview…'
            : loading && loading.total > 8 * 1024 * 1024
              ? `Reading ${formatBytes(loading.loaded)} of ${formatBytes(loading.total)}…`
              : 'Loading…'}
        </span>
        <div className="h-1 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full bg-accent transition-[width] ${loading?.parsing ? 'animate-pulse' : ''}`}
            style={{ width: `${Math.round((loading?.parsing ? 1 : fraction) * 100)}%` }}
          />
        </div>
      </div>
    </Placeholder>
  )
}

function LayerSlider({
  geometry,
  layers,
  onChange
}: {
  geometry: ToolpathGeometry
  layers: number
  onChange(n: number): void
}) {
  const total = geometry.layerEnds.length
  if (total < 2) return null
  const z = geometry.layerZ[Math.max(0, layers - 1)]
  return (
    <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800">
      <input
        type="range"
        min={1}
        max={total}
        value={layers}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Layers shown"
        className="min-w-0 flex-1 accent-accent"
      />
      <span className="shrink-0 text-right whitespace-nowrap tabular-nums">
        Layer {layers}/{total} · {formatMm(z)} mm
      </span>
    </div>
  )
}

function FeatureLegend({ geometry }: { geometry: ToolpathGeometry }) {
  const present = useMemo(() => {
    const seen = new Set<Feature>()
    for (const f of geometry.features) seen.add(f)
    return [...seen].sort((a, b) => a - b)
  }, [geometry])
  if (present.length === 1 && present[0] === Feature.Other) {
    return <p className="-mt-2 px-4 pb-3 text-[11px] text-zinc-500">Colored by height (no feature info in this file)</p>
  }
  return (
    <ul className="-mt-2 flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-zinc-500">
      {present.map((f) => (
        <li key={f} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: FEATURE_STYLE[f].color }} />
          {FEATURE_STYLE[f].label}
        </li>
      ))}
    </ul>
  )
}

function ModelDetails({ model }: { model: ParsedModel }) {
  const { info, geometry } = model
  const b = geometry?.bounds
  const dims = b && [0, 1, 2].map((i) => formatMm(b.max[i] - b.min[i])).join(' × ') + ' mm'
  const temps = [
    info.nozzleTemp !== undefined && `${info.nozzleTemp} °C nozzle`,
    info.bedTemp !== undefined && `${info.bedTemp} °C bed`
  ].filter(Boolean)
  const filament = [
    info.filamentLength !== undefined && `${(info.filamentLength / 1000).toFixed(2)} m`,
    info.filamentWeight !== undefined && `${info.filamentWeight.toFixed(1)} g`
  ].filter(Boolean)
  const objects = info.objects
  return (
    <>
      <h3 className="mt-4 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
        {geometry?.kind === 'toolpath' || info.slicer ? 'Print' : 'Model'}
      </h3>
      <Details>
        {info.title && <Row label="Title">{info.title}</Row>}
        {info.designer && <Row label="Designer">{info.designer}</Row>}
        {dims && <Row label="Dimensions">{dims}</Row>}
        {geometry?.kind === 'mesh' && (
          <>
            <Row label="Triangles">{numberFormat.format(geometry.triangles)}</Row>
            <Row label="Volume">{(geometry.volume / 1000).toFixed(geometry.volume < 10_000 ? 2 : 1)} cm³</Row>
          </>
        )}
        {objects && objects.length > 0 && (
          <Row label="Objects">
            {objects.length > 4 ? `${objects.length} objects` : objects.join(', ')}
          </Row>
        )}
        {info.printTime !== undefined && <Row label="Print time">{formatDuration(info.printTime)}</Row>}
        {filament.length > 0 && <Row label="Filament">{filament.join(' · ')}</Row>}
        {info.filamentType && <Row label="Material">{info.filamentType}</Row>}
        {(info.layers !== undefined || info.layerHeight !== undefined) && (
          <Row label="Layers">
            {[info.layers, info.layerHeight !== undefined && `${formatMm(info.layerHeight)} mm`]
              .filter((v) => v !== undefined && v !== false)
              .join(' × ')}
          </Row>
        )}
        {temps.length > 0 && <Row label="Temperature">{temps.join(' · ')}</Row>}
        {info.printer && <Row label="Printer">{info.printer}</Row>}
        {info.slicer && <Row label="Slicer">{info.slicer}</Row>}
        {info.application && <Row label="Made with">{info.application}</Row>}
      </Details>
    </>
  )
}

function Details({ children }: { children: ReactNode }) {
  return <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">{children}</dl>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function useObjectUrl(image: ParsedModel['thumbnail']): string | null {
  const url = useMemo(
    () => (image ? URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mime })) : null),
    [image]
  )
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}
