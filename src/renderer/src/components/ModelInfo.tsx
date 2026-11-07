import { useMemo, type ReactNode } from 'react'
import { Feature, type ParsedModel, type ToolpathGeometry } from '@shared/model'
import { FEATURE_STYLE } from '../viewer/scene'
import { formatDuration, formatMm, numberFormat } from '../format'

// What a parsed file says about itself, shown under the 3D view.

export function FeatureLegend({ geometry }: { geometry: ToolpathGeometry }) {
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

export function ModelDetails({ model }: { model: ParsedModel }) {
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

export function Details({ children }: { children: ReactNode }) {
  return <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">{children}</dl>
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}
