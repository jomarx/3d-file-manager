// Parsed model data shared by the parsers, the parse worker and the viewer.
// Everything is plain typed arrays so results can be transferred between threads.

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

// Triangle soup (3 vertices per triangle, 3 floats per vertex), in millimetres.
export interface MeshGeometry {
  kind: 'mesh'
  positions: Float32Array
  // Triangle index where each part starts, so the viewer can tint parts differently.
  partStarts: Uint32Array
  triangles: number
  bounds: Bounds
  volume: number // mm³, from the signed volume of the triangles
}

// Toolpath as line segments (2 vertices per segment), grouped by layer.
export interface ToolpathGeometry {
  kind: 'toolpath'
  positions: Float32Array
  features: Uint8Array // one Feature per segment
  layerEnds: Uint32Array // segment count at the end of each layer
  layerZ: Float32Array
  bounds: Bounds
}

export type ModelGeometry = MeshGeometry | ToolpathGeometry

export enum Feature {
  Other = 0,
  OuterWall,
  InnerWall,
  Infill,
  SolidInfill,
  TopBottom,
  Support,
  SkirtBrim,
  Bridge
}

export interface ModelInfo {
  title?: string
  designer?: string
  application?: string // app that wrote a 3MF
  objects?: string[] // 3MF object names on the build plate
  slicer?: string
  printer?: string
  printTime?: number // seconds
  filamentLength?: number // mm
  filamentWeight?: number // g
  filamentType?: string
  layerHeight?: number // mm
  layers?: number
  nozzleTemp?: number // °C
  bedTemp?: number // °C
}

export interface ParsedModel {
  geometry: ModelGeometry | null
  info: ModelInfo
  thumbnail?: { mime: 'image/png' | 'image/jpeg'; data: Uint8Array }
}

export class ModelError extends Error {}
