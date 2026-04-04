import sharp from 'sharp';

/**
 * Maximum allowed Hamming distance between two aHash values for images to be
 * considered a match. aHash is resilient to JPEG recompression artifacts
 * (empirically 3-6 bit drift), so 10 provides a comfortable margin.
 */
export const AHASH_MATCH_THRESHOLD = 10;

/**
 * Compute the average hash (aHash) of an image.
 *
 * Algorithm:
 * 1. Resize to 8x8 pixels
 * 2. Convert to grayscale
 * 3. Compute mean pixel value
 * 4. For each pixel: '1' if >= mean, '0' otherwise
 *
 * Returns a 64-character binary string.
 */
export async function computeAHash(imageBuffer: Buffer): Promise<string> {
    const { data } = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const mean = pixels.reduce((sum, v) => sum + v, 0) / pixels.length;

    return pixels.map((v) => (v >= mean ? '1' : '0')).join('');
}

/**
 * Count the number of bit positions where two equal-length binary strings differ.
 */
export function hammingDistance(a: string, b: string): number {
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) distance++;
    }
    return distance;
}
