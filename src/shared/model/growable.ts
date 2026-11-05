// Append-only typed arrays that double when full; `view()` trims to length.

type TypedArray = Float32Array | Uint8Array | Uint32Array
type Ctor<T extends TypedArray> = new (length: number) => T

export class Growable<T extends TypedArray> {
  private data: T
  length = 0

  constructor(
    private readonly ctor: Ctor<T>,
    capacity = 1024
  ) {
    this.data = new ctor(capacity)
  }

  private reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return
    let size = this.data.length * 2
    while (size < this.length + extra) size *= 2
    const next = new this.ctor(size)
    next.set(this.data.subarray(0, this.length) as never)
    this.data = next
  }

  push(value: number): void {
    this.reserve(1)
    this.data[this.length++] = value
  }

  push3(a: number, b: number, c: number): void {
    this.reserve(3)
    const d = this.data
    d[this.length] = a
    d[this.length + 1] = b
    d[this.length + 2] = c
    this.length += 3
  }

  view(): T {
    return this.data.slice(0, this.length) as T
  }
}

export class BoundsTracker {
  min: [number, number, number] = [Infinity, Infinity, Infinity]
  max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  add(x: number, y: number, z: number): void {
    if (x < this.min[0]) this.min[0] = x
    if (y < this.min[1]) this.min[1] = y
    if (z < this.min[2]) this.min[2] = z
    if (x > this.max[0]) this.max[0] = x
    if (y > this.max[1]) this.max[1] = y
    if (z > this.max[2]) this.max[2] = z
  }

  get empty(): boolean {
    return this.min[0] > this.max[0]
  }

  bounds() {
    return this.empty
      ? { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] }
      : { min: this.min, max: this.max }
  }
}
