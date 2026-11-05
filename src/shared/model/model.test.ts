import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { featureOf, parseDuration } from './gcode'
import { Feature, ModelError, parseModel, type MeshGeometry, type ToolpathGeometry } from './index'

// Unit cube corners and outward-facing triangles.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
]
const FACES = [
  [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
  [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]
]

function binaryStl(size: number, header = 'binary'): Uint8Array {
  const bytes = new Uint8Array(84 + FACES.length * 50)
  bytes.set(strToU8(header))
  const view = new DataView(bytes.buffer)
  view.setUint32(80, FACES.length, true)
  FACES.forEach((face, i) => {
    face.forEach((corner, k) => {
      CORNERS[corner].forEach((c, axis) => view.setFloat32(84 + i * 50 + 12 + k * 12 + axis * 4, c * size, true))
    })
  })
  return bytes
}

function asciiSolid(name: string, size: number, offset = 0): string {
  const facets = FACES.map(
    (face) =>
      `  facet normal 0 0 0\n    outer loop\n${face
        .map((c) => `      vertex ${CORNERS[c].map((v, axis) => v * size + (axis === 0 ? offset : 0)).join(' ')}`)
        .join('\n')}\n    endloop\n  endfacet`
  )
  return `solid ${name}\n${facets.join('\n')}\nendsolid ${name}\n`
}

const mesh = (bytes: Uint8Array, ext: string) => parseModel(bytes, ext).geometry as MeshGeometry
const toolpath = (text: string) => parseModel(strToU8(text), 'gcode').geometry as ToolpathGeometry

describe('STL', () => {
  it('reads binary STL, even with a header starting with "solid"', () => {
    for (const header of ['binary', 'solid but actually binary']) {
      const g = mesh(binaryStl(10, header), 'stl')
      expect(g.triangles).toBe(12)
      expect(g.bounds).toEqual({ min: [0, 0, 0], max: [10, 10, 10] })
      expect(g.volume).toBeCloseTo(1000)
    }
  })

  it('reads ASCII STL with several solids as parts', () => {
    const text = asciiSolid('left', 10) + asciiSolid('right', 5, 20)
    const parsed = parseModel(strToU8(text), 'stl')
    const g = parsed.geometry as MeshGeometry
    expect(g.triangles).toBe(24)
    expect(Array.from(g.partStarts)).toEqual([0, 12])
    expect(g.bounds.max).toEqual([25, 10, 10])
    expect(g.volume).toBeCloseTo(1125)
    expect(parsed.info.title).toBe('left')
  })

  it('rejects files that are not STL', () => {
    expect(() => parseModel(strToU8('hello'), 'stl')).toThrow(ModelError)
  })
})

describe('3MF', () => {
  const cubeMesh = `<mesh><vertices>${CORNERS.map(
    (c) => `<vertex x="${c[0] * 10}" y="${c[1] * 10}" z="${c[2] * 10}"/>`
  ).join('')}</vertices><triangles>${FACES.map(
    (f) => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`
  ).join('')}</triangles></mesh>`

  function bambuStyle3mf(): Uint8Array {
    const root = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
 <metadata name="Title">Cable Clip &amp; Holder</metadata>
 <metadata name="Designer">Jo</metadata>
 <metadata name="Application">BambuStudio-01.09.00.70</metadata>
 <resources>
  <object id="2" name="Clip" type="model">
   <components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 5"/></components>
  </object>
  <object id="3" name="Hidden" type="model">${cubeMesh}</object>
 </resources>
 <build>
  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0" printable="1"/>
  <item objectid="2" transform="-1 0 0 0 1 0 0 0 1 0 0 0"/>
  <item objectid="3" printable="0"/>
 </build>
</model>`
    const object = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources><object id="1" type="model">${cubeMesh}</object></resources></model>`
    return zipSync({
      '_rels/.rels': strToU8(
        '<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
      ),
      '3D/3dmodel.model': strToU8(root),
      '3D/Objects/object_1.model': strToU8(object),
      'Metadata/plate_1.png': new Uint8Array([137, 80, 78, 71])
    })
  }

  it('follows components across model files and applies build transforms', () => {
    const parsed = parseModel(bambuStyle3mf(), '3mf')
    const g = parsed.geometry as MeshGeometry
    expect(g.triangles).toBe(24)
    expect(Array.from(g.partStarts)).toEqual([0, 12])
    // Item 1 sits at x 100–110, item 2 is mirrored to x -10–0; both lifted 5 mm by the component.
    expect(g.bounds).toEqual({ min: [-10, 0, 5], max: [110, 10, 15] })
    // A mirrored copy keeps outward normals, so volumes add up instead of cancelling.
    expect(g.volume).toBeCloseTo(2000)
  })

  it('reads metadata, object names and the plate thumbnail', () => {
    const parsed = parseModel(bambuStyle3mf(), '3mf')
    expect(parsed.info).toMatchObject({
      title: 'Cable Clip & Holder',
      designer: 'Jo',
      application: 'BambuStudio-01.09.00.70',
      objects: ['Clip', 'Clip']
    })
    expect(parsed.thumbnail?.mime).toBe('image/png')
    expect(Array.from(parsed.thumbnail!.data)).toEqual([137, 80, 78, 71])
  })

  it('converts units to millimetres', () => {
    const model = `<model unit="inch"><resources><object id="1">${cubeMesh}</object></resources><build><item objectid="1"/></build></model>`
    const g = mesh(zipSync({ '3D/3dmodel.model': strToU8(model) }), '3mf')
    expect(g.bounds.max[0]).toBeCloseTo(254)
  })

  it('explains broken files', () => {
    expect(() => parseModel(strToU8('not a zip'), '3mf')).toThrow(/zip/)
    expect(() => parseModel(zipSync({ 'a.txt': strToU8('x') }), '3mf')).toThrow(/no 3D model/)
  })
})

describe('G-code', () => {
  const thumb = btoa(String.fromCharCode(137, 80, 78, 71, 1, 2, 3))
  const prusa = `; generated by PrusaSlicer 2.7.1+win64 on 2026-10-01 at 10:00:00 UTC
; thumbnail begin 16x16 ${thumb.length}
; ${thumb}
; thumbnail end
M140 S60
M104 S170 ; preheat for probing
M82
G90
G28
G92 E0
G1 Z0.3
G1 X-5 Y180 E10 ; purge line, not part of the print
G92 E0
;LAYER_CHANGE
;Z:0.2
G1 Z0.2 F600
G1 X0 Y0
;TYPE:External perimeter
G1 X10 Y0 E1
G1 X10 Y10 E2
;TYPE:Solid infill
G1 X0 Y10 E3
G1 E2.2 ; retract
G1 X5 Y5 ; travel
G1 E3
;LAYER_CHANGE
;Z:0.4
G1 Z0.4
G1 Z0.8 ; z-hop travel, not a layer
G1 X0 Y0
G1 Z0.4
;TYPE:Perimeter
G1 X10 Y0 E4
; filament used [mm] = 1234.5, 10.5
; filament used [g] = 3.7
; estimated printing time (normal mode) = 1h 2m 3s
; filament_type = PETG
; layer_height = 0.2
; temperature = 240
; printer_settings_id = Original Prusa MK4 0.4 nozzle
`

  it('turns extrusion moves into segments by layer and feature', () => {
    const g = toolpath(prusa)
    expect(g.features.length).toBe(4)
    expect(Array.from(g.layerEnds)).toEqual([3, 4])
    expect(Array.from(g.layerZ)).toEqual([expect.closeTo(0.2), expect.closeTo(0.4)])
    expect(Array.from(g.features)).toEqual([Feature.OuterWall, Feature.OuterWall, Feature.SolidInfill, Feature.InnerWall])
    expect(g.bounds).toEqual({ min: [0, 0, expect.closeTo(0.2)], max: [10, 10, expect.closeTo(0.4)] })
  })

  it('reads PrusaSlicer stats and the embedded thumbnail', () => {
    const parsed = parseModel(strToU8(prusa), 'gcode')
    expect(parsed.info).toEqual({
      slicer: 'PrusaSlicer 2.7.1+win64',
      printer: 'Original Prusa MK4 0.4 nozzle',
      printTime: 3723,
      filamentLength: 1245,
      filamentWeight: 3.7,
      filamentType: 'PETG',
      layerHeight: 0.2,
      layers: 2,
      nozzleTemp: 240,
      bedTemp: 60
    })
    expect(Array.from(parsed.thumbnail!.data)).toEqual([137, 80, 78, 71, 1, 2, 3])
  })

  it('reads Cura headers, relative extrusion and layers without markers', () => {
    const cura = `;FLAVOR:Marlin
;TIME:5400
;Filament used: 1.5m
;Layer height: 0.12
;Generated with Cura_SteamEngine 5.7.1
M104 S205
M83
G1 Z0.12
;TYPE:WALL-OUTER
G1 X10 E0.5
G1 X10 Y10 E0.5
G1 E-0.8
G1 Z0.24
;TYPE:FILL
G1 X0 Y10 E0.4
`
    const parsed = parseModel(strToU8(cura), 'gcode')
    expect(parsed.info).toMatchObject({
      slicer: 'Cura 5.7.1',
      printTime: 5400,
      filamentLength: 1500,
      layerHeight: 0.12,
      layers: 2,
      nozzleTemp: 205
    })
    const g = parsed.geometry as ToolpathGeometry
    expect(Array.from(g.layerEnds)).toEqual([2, 3])
    expect(Array.from(g.features)).toEqual([Feature.OuterWall, Feature.OuterWall, Feature.Infill])
  })

  it('draws arcs as short segments that end exactly on the target', () => {
    const g = toolpath('M83\nG1 Z0.2\nG1 X10 Y0 F600\nG3 X0 Y10 I-10 J0 E1\n')
    const segments = g.features.length
    expect(segments).toBe(16) // quarter circle of radius 10 in ~1 mm steps
    const p = g.positions
    const last = (segments - 1) * 6 + 3
    expect([p[last], p[last + 1]]).toEqual([0, 10])
    const mid = 8 * 6
    expect(Math.hypot(p[mid], p[mid + 1])).toBeCloseTo(10, 4)
  })

  it('reads a Bambu .gcode.3mf plate with its thumbnail and slice info', () => {
    const plate = `; HEADER_BLOCK_START
; BambuStudio 01.09.00.70
; model printing time: 52m 10s; total estimated time: 58m 47s
; total layer number: 1
; total filament weight [g] : 12.34
; HEADER_BLOCK_END
M140 S55
M104 S140
G90
M83
; CHANGE_LAYER
; Z_HEIGHT: 0.2
G1 Z0.2
; FEATURE: Outer wall
G1 X10 Y0 E0.5
; FEATURE: Sparse infill
G2 X0 Y0 I-5 J0 E0.5
; nozzle_temperature = 220,220
; filament_type = PLA;PLA
; printer_model = Bambu Lab A1
`
    const bytes = zipSync({
      'Metadata/plate_1.gcode': strToU8(plate),
      'Metadata/plate_1.png': new Uint8Array([137, 80, 78, 71]),
      'Metadata/slice_info.config': strToU8(
        '<config><plate><metadata key="prediction" value="3527"/><metadata key="weight" value="12.34"/></plate></config>'
      ),
      '3D/3dmodel.model': strToU8('<model/>')
    })
    const parsed = parseModel(bytes, 'gcode.3mf')
    expect(parsed.info).toMatchObject({
      slicer: 'BambuStudio 01.09.00.70',
      printer: 'Bambu Lab A1',
      printTime: 3527,
      filamentWeight: 12.34,
      filamentType: 'PLA',
      layers: 1,
      nozzleTemp: 220,
      bedTemp: 55
    })
    expect(parsed.thumbnail?.data.length).toBe(4)
    const g = parsed.geometry as ToolpathGeometry
    expect(Array.from(g.features.slice(0, 2))).toEqual([Feature.OuterWall, Feature.Infill])
    expect(g.features.length).toBeGreaterThan(10) // half circle of radius 5
  })

  it('classifies slicer feature names', () => {
    expect(featureOf('Outer wall')).toBe(Feature.OuterWall)
    expect(featureOf('External perimeter')).toBe(Feature.OuterWall)
    expect(featureOf('WALL-INNER')).toBe(Feature.InnerWall)
    expect(featureOf('Internal solid infill')).toBe(Feature.SolidInfill)
    expect(featureOf('Top surface')).toBe(Feature.TopBottom)
    expect(featureOf('SKIN')).toBe(Feature.TopBottom)
    expect(featureOf('Support interface')).toBe(Feature.Support)
    expect(featureOf('Overhang perimeter')).toBe(Feature.Bridge)
    expect(featureOf('Skirt/Brim')).toBe(Feature.SkirtBrim)
    expect(featureOf('Custom')).toBe(Feature.Other)
  })

  it('parses slicer durations', () => {
    expect(parseDuration('1d 2h 3m 4s')).toBe(93784)
    expect(parseDuration('58m 47s')).toBe(3527)
    expect(parseDuration('3723')).toBe(3723)
    expect(parseDuration('soon')).toBeUndefined()
  })
})
