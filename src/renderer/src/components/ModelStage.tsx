import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ParsedModel, ToolpathGeometry } from '@shared/model'
import type { ModelState } from '../hooks/useModel'
import { formatBytes, formatMm } from '../format'
import ModelViewer, { ViewerButton } from './ModelViewer'

// The 3D view of a file, or how far loading it has got, with the slicer
// thumbnail as an alternative and a layer slider for toolpaths. Fills a flex column.
export default function ModelStage(props: {
  state: ModelState
  size: number
  onLoad(): void
  // Buttons shown before the stage's own.
  toolbar?: ReactNode
}) {
  const { state } = props
  const model = state.status === 'ready' ? state.model : null
  const toolpath = model?.geometry?.kind === 'toolpath' ? model.geometry : null

  const [showImage, setShowImage] = useState(false)
  const [layers, setLayers] = useState(0)
  useEffect(() => setLayers(toolpath?.layerEnds.length ?? 0), [toolpath])
  useEffect(() => setShowImage(false), [model])

  const thumbnailUrl = useObjectUrl(model?.thumbnail)

  const toolbar = (
    <>
      {thumbnailUrl && (
        <ViewerButton title="Slicer thumbnail" active={showImage} onClick={() => setShowImage((v) => !v)}>
          Image
        </ViewerButton>
      )}
      {props.toolbar}
    </>
  )

  return (
    <>
      <div className="relative min-h-0 flex-1">
        {model?.geometry && !(showImage && thumbnailUrl) ? (
          <ModelViewer geometry={model.geometry} layers={toolpath ? layers : undefined} toolbar={toolbar} />
        ) : model && thumbnailUrl ? (
          <>
            <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-4" />
            <div className="absolute top-2 right-2 flex gap-1">{model.geometry ? toolbar : props.toolbar}</div>
          </>
        ) : (
          <>
            <Status state={state} size={props.size} onLoad={props.onLoad} />
            {props.toolbar && <div className="absolute top-2 right-2 flex gap-1">{props.toolbar}</div>}
          </>
        )}
      </div>
      {toolpath && !showImage && <LayerSlider geometry={toolpath} layers={layers} onChange={setLayers} />}
    </>
  )
}

export function Placeholder({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center p-4 text-center text-xs text-zinc-400">{children}</div>
}

function Status({ state, size, onLoad }: { state: ModelState; size: number; onLoad(): void }) {
  if (state.status === 'large') {
    return (
      <Placeholder>
        <div className="flex flex-col items-center gap-3">
          <span>
            This file is {formatBytes(size)}.
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

function useObjectUrl(image: ParsedModel['thumbnail']): string | null {
  const url = useMemo(
    () => (image ? URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mime })) : null),
    [image]
  )
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}
