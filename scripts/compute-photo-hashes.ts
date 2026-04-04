#!/usr/bin/env npx ts-node
/**
 * Scans persona/{dbcoll}/ directories and computes aHash for each image.
 * Outputs JSON suitable for the clients API profilePics field.
 *
 * Usage: npx ts-node scripts/compute-photo-hashes.ts <dbcoll>
 * Output: [{ "filename": "dp1.jpg", "phash": "1010..." }, ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeAHash } from '../src/utils/image-hash';

async function main() {
    const dbcoll = process.argv[2];
    if (!dbcoll) {
        console.error('Usage: npx ts-node scripts/compute-photo-hashes.ts <dbcoll>');
        process.exit(1);
    }

    const dir = path.join(process.cwd(), 'persona', dbcoll);
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
    if (files.length === 0) {
        console.error(`No image files found in ${dir}`);
        process.exit(1);
    }

    const results: Array<{ filename: string; phash: string }> = [];

    for (const file of files) {
        const buffer = fs.readFileSync(path.join(dir, file));
        const phash = await computeAHash(buffer);
        results.push({ filename: file, phash });
        console.error(`  ${file} → ${phash}`);
    }

    console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
