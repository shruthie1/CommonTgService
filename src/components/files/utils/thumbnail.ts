// Real thumbnails for GET /folders/:folder/files/:filename/thumbnail.
//
// Before this, the thumbnail route sent the full original (up to 4096² px, ~3 MB) for every
// avatar. Now an image is resized to `w` px on its longest side (default 128, clamped 64..512),
// kept in aspect ratio, never enlarged, and encoded as webp. Encoded output is kept in a
// byte-bounded in-memory LRU so repeat loads do not re-encode.
//
// sharp is a native module. The CI bundle (cts-master.js) leaves every node_module external, so
// sharp resolves from the VM's own node_modules (`server` repo, branches `cms` and `ums` both
// declare sharp ^0.34.5). It is required lazily: if it is missing or fails to load on a VM, the
// route sends the original (logged once) instead of crashing the whole service at boot.

export const THUMB_DEFAULT_WIDTH = 128;
export const THUMB_MIN_WIDTH = 64;
export const THUMB_MAX_WIDTH = 512;
export const THUMB_CACHE_MAX_BYTES = 16 * 1024 * 1024;
export const THUMB_WEBP_QUALITY = 72;

/** `?w=` → integer px in [64, 512]; missing or unparseable → 128. */
export function clampThumbWidth(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null || value === '') return THUMB_DEFAULT_WIDTH;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return THUMB_DEFAULT_WIDTH;
  return Math.min(THUMB_MAX_WIDTH, Math.max(THUMB_MIN_WIDTH, n));
}

/** LRU bounded by total buffer bytes (Map keeps insertion order; re-insert on hit). */
export class ByteLru {
  private readonly map = new Map<string, Buffer>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): Buffer | undefined {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: Buffer): void {
    if (value.length > this.maxBytes) return;
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.length;
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.bytes += value.length;
    while (this.bytes > this.maxBytes) {
      const oldestKey = this.map.keys().next().value as string;
      this.bytes -= this.map.get(oldestKey)!.length;
      this.map.delete(oldestKey);
    }
  }

  get size(): number {
    return this.map.size;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharpFactory = (input: string | Buffer, options?: Record<string, unknown>) => any;

export type SharpLoadResult = { sharp: SharpFactory } | { error: Error };

let sharpLoad: SharpLoadResult | undefined;

/** Loads sharp once per process; a load failure is remembered, not retried per request. */
export function loadSharp(): SharpLoadResult {
  if (!sharpLoad) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('sharp');
      sharpLoad = { sharp: (mod && mod.default) || mod };
    } catch (error) {
      sharpLoad = { error: error as Error };
    }
  }
  return sharpLoad;
}

/** Resize to `width` on the longest side (aspect kept, no enlargement), EXIF-rotated, webp. */
export async function renderThumbnail(
  sharp: SharpFactory,
  filePath: string,
  width: number,
): Promise<Buffer> {
  return sharp(filePath, { failOn: 'error' })
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toBuffer();
}
