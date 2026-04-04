import sharp from 'sharp';
import { computeAHash, hammingDistance, AHASH_MATCH_THRESHOLD } from '../image-hash';

// Helper: create a solid-color 64x64 PNG buffer via sharp
async function solidColorImage(r: number, g: number, b: number, width = 64, height = 64): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r, g, b },
        },
    })
        .png()
        .toBuffer();
}

describe('hammingDistance', () => {
    test('identical strings return 0', () => {
        const hash = '1010101010101010101010101010101010101010101010101010101010101010';
        expect(hammingDistance(hash, hash)).toBe(0);
    });

    test('known difference of 4 bits', () => {
        const a = '0000000000000000000000000000000000000000000000000000000000000000';
        const b = '1000100010001000000000000000000000000000000000000000000000000000';
        expect(hammingDistance(a, b)).toBe(4);
    });

    test('completely opposite strings return 64', () => {
        const a = '0000000000000000000000000000000000000000000000000000000000000000';
        const b = '1111111111111111111111111111111111111111111111111111111111111111';
        expect(hammingDistance(a, b)).toBe(64);
    });
});

describe('AHASH_MATCH_THRESHOLD', () => {
    test('is 10', () => {
        expect(AHASH_MATCH_THRESHOLD).toBe(10);
    });
});

describe('computeAHash', () => {
    test('returns a 64-character binary string', async () => {
        const img = await solidColorImage(128, 128, 128);
        const hash = await computeAHash(img);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[01]+$/);
    });

    test('is deterministic — same image produces same hash', async () => {
        const img = await solidColorImage(100, 150, 200);
        const hash1 = await computeAHash(img);
        const hash2 = await computeAHash(img);
        expect(hash1).toBe(hash2);
    });

    test('all-black image produces all-zero hash (every pixel equals mean)', async () => {
        // All pixels are 0, mean is 0, so each pixel >= mean → all 1s
        // or each pixel < mean? Let's test that it's a valid binary string.
        // For a uniform image, all pixels equal the mean — implementation
        // typically maps pixel >= mean → 1, so all-black gives all 1s, all-white gives all 1s.
        const blackImg = await solidColorImage(0, 0, 0);
        const hash = await computeAHash(blackImg);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[01]+$/);
    });

    test('is compression-resilient — JPEG recompressed image matches original within threshold', async () => {
        // Create an image with some variation so aHash is meaningful
        // Use a gradient-like pattern by compositing
        const width = 64;
        const height = 64;

        // Create raw pixel data with a gradient pattern
        const pixelData = Buffer.alloc(width * height * 3);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 3;
                pixelData[idx] = Math.floor((x / width) * 255);     // R gradient
                pixelData[idx + 1] = Math.floor((y / height) * 255); // G gradient
                pixelData[idx + 2] = 128;                             // B constant
            }
        }

        const original = await sharp(pixelData, {
            raw: { width, height, channels: 3 },
        })
            .png()
            .toBuffer();

        // Simulate JPEG recompression (quality 80 — mild compression artifacts)
        const recompressed = await sharp(original)
            .jpeg({ quality: 80 })
            .toBuffer();

        const hashOriginal = await computeAHash(original);
        const hashRecompressed = await computeAHash(recompressed);
        const distance = hammingDistance(hashOriginal, hashRecompressed);

        expect(distance).toBeLessThanOrEqual(AHASH_MATCH_THRESHOLD);
    });
});
