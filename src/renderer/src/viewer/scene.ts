import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Feature, type Bounds, type MeshGeometry, type ModelGeometry, type ToolpathGeometry } from '@shared/model'

// Imperative three.js scene behind ModelViewer. Printers are Z-up, so the
// camera is too. Renders on demand (no animation loop) to stay idle when
// nothing moves.

export const PART_COLORS = ['#f97316', '#38bdf8', '#a3e635', '#c084fc', '#f472b6', '#facc15', '#2dd4bf']

export const FEATURE_STYLE: Record<Feature, { label: string; color: string }> = {
  [Feature.OuterWall]: { label: 'Outer wall', color: '#f97316' },
  [Feature.InnerWall]: { label: 'Inner wall', color: '#facc15' },
  [Feature.Infill]: { label: 'Sparse infill', color: '#dc2626' },
  [Feature.SolidInfill]: { label: 'Solid infill', color: '#a855f7' },
  [Feature.TopBottom]: { label: 'Top / bottom', color: '#ec4899' },
  [Feature.Bridge]: { label: 'Bridge / overhang', color: '#3b82f6' },
  [Feature.Support]: { label: 'Support', color: '#22c55e' },
  [Feature.SkirtBrim]: { label: 'Skirt / brim', color: '#14b8a6' },
  [Feature.Other]: { label: 'Other', color: '#a1a1aa' }
}

const VIEW_DIRECTION = new Vector3(0.65, -1, 0.8).normalize()

export class ViewerScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.1, 100_000)
  private controls: OrbitControls
  private resize: ResizeObserver
  private dark = window.matchMedia('(prefers-color-scheme: dark)')
  private content: Object3D | null = null
  private bounds: Bounds | null = null
  private grid: GridHelper | null = null
  private toolpath: { geometry: ToolpathGeometry; object: LineSegments } | null = null
  private frame = 0

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.domElement.style.display = 'block'
    host.appendChild(this.renderer.domElement)

    addLights(this.scene, this.camera)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.zoomToCursor = true
    this.controls.addEventListener('change', () => this.render())

    this.resize = new ResizeObserver(() => this.fitSize())
    this.resize.observe(host)
    this.dark.addEventListener('change', this.onTheme)
    this.fitSize()
  }

  setGeometry(geometry: ModelGeometry | null): void {
    this.clear()
    if (!geometry) return this.render()
    this.content = buildObject(geometry)
    if (geometry.kind === 'toolpath') this.toolpath = { geometry, object: this.content as LineSegments }
    this.scene.add(this.content)
    this.bounds = geometry.bounds
    this.addGrid()
    this.resetView()
  }

  // Shows toolpath layers 1..count.
  setLayers(count: number): void {
    if (!this.toolpath) return
    const ends = this.toolpath.geometry.layerEnds
    const n = Math.max(1, Math.min(count, ends.length))
    this.toolpath.object.geometry.setDrawRange(0, ends[n - 1] * 2)
    this.render()
  }

  resetView(): void {
    if (!this.bounds) return
    // Some margin so tall parts clear the toolbar buttons in the corner.
    this.controls.target.copy(frameBounds(this.camera, this.bounds, 1.2))
    this.controls.update()
    this.render()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.clear()
    this.resize.disconnect()
    this.dark.removeEventListener('change', this.onTheme)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private addGrid(): void {
    if (!this.bounds) return
    const { min, max } = this.bounds
    const span = Math.max(max[0] - min[0], max[1] - min[1])
    // 10 mm squares on a plate a bit larger than the footprint.
    const size = Math.max(50, Math.ceil((span * 1.5) / 10) * 10)
    const dark = this.dark.matches
    this.grid = new GridHelper(size, size / 10, dark ? 0x52525b : 0xa1a1aa, dark ? 0x27272a : 0xe4e4e7)
    this.grid.rotation.x = Math.PI / 2
    this.grid.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2] - 0.01)
    this.scene.add(this.grid)
  }

  private clear(): void {
    for (const obj of [this.content, this.grid]) {
      if (!obj) continue
      this.scene.remove(obj)
      disposeObject(obj)
    }
    this.content = null
    this.grid = null
    this.toolpath = null
    this.bounds = null
  }

  private onTheme = () => {
    if (!this.grid) return
    this.scene.remove(this.grid)
    this.grid.dispose()
    this.addGrid()
    this.render()
  }

  private fitSize(): void {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.render()
  }

  private render(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera))
  }
}

// A light that follows the camera from above left, plus soft sky light. The
// camera must be in the scene for its light to count.
export function addLights(scene: Scene, camera: PerspectiveCamera): void {
  camera.up.set(0, 0, 1)
  const key = new DirectionalLight(0xffffff, 2.2)
  key.position.set(-0.5, 1, 1.2) // camera space: from above, slightly left
  camera.add(key)
  scene.add(camera)
  const sky = new HemisphereLight(0xffffff, 0x50555f, 1.4)
  sky.position.set(0, 0, 1)
  scene.add(sky)
}

// Places the camera to see all of ounds from the default angle, with
// margin (1 = touching the edges). Returns the point it looks at.
export function frameBounds(camera: PerspectiveCamera, bounds: Bounds, margin: number): Vector3 {
  const { min, max } = bounds
  const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const radius = Math.max(1, new Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]).length() / 2)
  const fov = (camera.fov * Math.PI) / 180
  const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect))
  const distance = (radius / Math.sin(fit / 2)) * margin
  camera.near = Math.max(0.01, distance / 1000)
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance)
  camera.lookAt(center)
  return center
}

export function buildObject(geometry: ModelGeometry): Mesh | LineSegments {
  return geometry.kind === 'mesh' ? buildMesh(geometry) : buildToolpath(geometry)
}

export function disposeObject(obj: Object3D): void {
  const holder = obj as Mesh
  holder.geometry?.dispose()
  const materials = holder.material
  for (const m of Array.isArray(materials) ? materials : materials ? [materials] : []) (m as Material).dispose()
}

function buildMesh(g: MeshGeometry): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(g.positions, 3))
  geometry.computeVertexNormals()
  const parts = g.partStarts.length > 1 ? g.partStarts : [0]
  const materials = Array.from(parts, (_, i) => meshMaterial(PART_COLORS[i % PART_COLORS.length]))
  for (let i = 0; i < parts.length; i++) {
    const start = parts[i]
    const end = i + 1 < parts.length ? parts[i + 1] : g.triangles
    geometry.addGroup(start * 3, (end - start) * 3, i)
  }
  return new Mesh(geometry, materials)
}

function meshMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
}

function buildToolpath(g: ToolpathGeometry): LineSegments {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(g.positions, 3))
  const colors = new Float32Array(g.features.length * 6)
  const anyFeature = g.features.some((f) => f !== Feature.Other)
  const palette = Object.fromEntries(
    Object.entries(FEATURE_STYLE).map(([k, v]) => [k, new Color(v.color).toArray()])
  ) as Record<string, number[]>
  // Without slicer feature comments, shade by height instead.
  const low = new Color('#38bdf8')
  const high = new Color('#f97316')
  const span = Math.max(1e-6, g.bounds.max[2] - g.bounds.min[2])
  const tmp = new Color()
  for (let i = 0; i < g.features.length; i++) {
    let rgb: number[]
    if (anyFeature) {
      rgb = palette[g.features[i]]
    } else {
      const z = g.positions[i * 6 + 2]
      rgb = tmp.copy(low).lerp(high, (z - g.bounds.min[2]) / span).toArray()
    }
    colors.set(rgb, i * 6)
    colors.set(rgb, i * 6 + 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }))
}
