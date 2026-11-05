import { BoundsTracker, Growable } from './growable'
import type { MeshGeometry } from './types'

// Collects triangles from STL or 3MF into a MeshGeometry.
export class MeshBuilder {
  private positions = new Growable(Float32Array, 3 * 3 * 4096)
  private parts = new Growable(Uint32Array, 8)
  private partStart = -1
  private box = new BoundsTracker()
  private volume = 0
  triangles = 0

  // Begins a new part unless the current one is still empty.
  startPart(): void {
    if (this.partStart === this.triangles) return
    this.partStart = this.triangles
    this.parts.push(this.triangles)
  }

  triangle(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ): void {
    if (this.partStart < 0) this.startPart()
    this.positions.push3(ax, ay, az)
    this.positions.push3(bx, by, bz)
    this.positions.push3(cx, cy, cz)
    this.box.add(ax, ay, az)
    this.box.add(bx, by, bz)
    this.box.add(cx, cy, cz)
    // Signed volume of the tetrahedron (origin, a, b, c).
    this.volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    this.triangles++
  }

  build(): MeshGeometry {
    const parts = this.parts.view()
    // Drop a trailing part that never received triangles.
    const used = parts.length > 0 && parts[parts.length - 1] === this.triangles ? parts.subarray(0, -1) : parts
    return {
      kind: 'mesh',
      positions: this.positions.view(),
      partStarts: used.slice(),
      triangles: this.triangles,
      bounds: this.box.bounds(),
      volume: Math.abs(this.volume)
    }
  }
}
