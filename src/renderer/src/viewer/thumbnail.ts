import { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { ModelGeometry, ParsedModel } from '@shared/model'
import { addLights, buildObject, disposeObject, frameBounds } from './scene'

// Grid tiles are 4:3 and up to about 250 px wide; this covers high-DPI screens.
const WIDTH = 400
const HEIGHT = 300

// One offscreen renderer for all thumbnails; browsers cap WebGL contexts.
let renderer: WebGLRenderer | null = null

/**
 * Draws a parsed model as a PNG: the slicer's own picture when the file has
 * one, otherwise the model from the viewer's default angle on a transparent
 * background. Null when there is nothing to draw.
 */
export async function drawThumbnail(model: ParsedModel): Promise<Uint8Array | null> {
  let canvas = model.thumbnail ? await drawImage(model.thumbnail) : null
  if (!canvas && model.geometry) canvas = drawGeometry(model.geometry)
  if (!canvas) return null
  // toBlob copies the pixels right away, so the shared canvas can be reused.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}

async function drawImage(image: NonNullable<ParsedModel['thumbnail']>): Promise<HTMLCanvasElement | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([image.data as BlobPart], { type: image.mime }))
  } catch {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const scale = Math.min(WIDTH / bitmap.width, HEIGHT / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  canvas.getContext('2d')!.drawImage(bitmap, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
  bitmap.close()
  return canvas
}

function drawGeometry(geometry: ModelGeometry): HTMLCanvasElement {
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(WIDTH, HEIGHT, false)
  }
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, WIDTH / HEIGHT, 0.1, 100_000)
  addLights(scene, camera)
  const object = buildObject(geometry)
  scene.add(object)
  frameBounds(camera, geometry.bounds, 1.05)
  renderer.render(scene, camera)
  disposeObject(object)
  return renderer.domElement
}
