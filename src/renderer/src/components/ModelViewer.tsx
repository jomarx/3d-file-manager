import { useEffect, useRef, type ReactNode } from 'react'
import type { ModelGeometry } from '@shared/model'
import { ViewerScene } from '../viewer/scene'

interface Props {
  geometry: ModelGeometry
  // Toolpaths only: number of layers to show from the bottom.
  layers?: number
  // Extra buttons shown next to "Reset view".
  toolbar?: ReactNode
}

export default function ModelViewer({ geometry, layers, toolbar }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ViewerScene | null>(null)

  useEffect(() => {
    const s = new ViewerScene(host.current!)
    scene.current = s
    return () => {
      s.dispose()
      scene.current = null
    }
  }, [])

  useEffect(() => scene.current?.setGeometry(geometry), [geometry])

  useEffect(() => {
    if (layers !== undefined) scene.current?.setLayers(layers)
  }, [layers, geometry])

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="absolute top-2 right-2 flex gap-1">
        {toolbar}
        <ViewerButton title="Reset view" onClick={() => scene.current?.resetView()}>
          ⟲
        </ViewerButton>
      </div>
    </div>
  )
}

export function ViewerButton({
  title,
  active,
  onClick,
  children
}: {
  title: string
  active?: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-7 min-w-7 place-items-center rounded-md border px-1.5 text-xs backdrop-blur ${
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-zinc-300/80 bg-white/70 text-zinc-600 hover:text-zinc-900 dark:border-zinc-700/80 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
