/**
 * Tests for CloudinaryService (src/cloudinary.ts).
 *
 * The direct-Cloudinary methods were removed (dead code); this service now only
 * downloads + extracts persona-pic zips from the CMS /folders endpoint.
 *
 * External boundaries mocked: fetchWithTimeout (network), fs, adm-zip.
 * The wrapper logic (singleton, download+extract flow, unique paths, errors) runs for real.
 */

const fetchWithTimeout = jest.fn();
jest.mock('../utils/fetchWithTimeout', () => ({ fetchWithTimeout: (...a: any[]) => fetchWithTimeout(...a) }));

const fsMock = {
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    existsSync: jest.fn(),
};
jest.mock('fs', () => fsMock);

const extractAllTo = jest.fn();
jest.mock('adm-zip', () => jest.fn().mockImplementation(() => ({ extractAllTo })));

import { CloudinaryService } from '../cloudinary';

beforeEach(() => {
    jest.clearAllMocks();
    (CloudinaryService as any).instance = undefined;
});

describe('getInstance', () => {
    test('returns a singleton', async () => {
        const a = await CloudinaryService.getInstance('x');
        const b = await CloudinaryService.getInstance('y');
        expect(a).toBe(b);
    });
});

describe('downloadAndExtractZip', () => {
    test('writes the zip, extracts to a unique dir, cleans up, and returns the dir', async () => {
        fetchWithTimeout.mockResolvedValue({ status: 200, data: Buffer.from('zip') });
        const svc = await CloudinaryService.getInstance();

        const dir = await svc.downloadAndExtractZip('https://cms.paidgirls.site/folders/f/files/download-all');

        expect(fetchWithTimeout).toHaveBeenCalledWith(
            'https://cms.paidgirls.site/folders/f/files/download-all',
            { responseType: 'arraybuffer' },
        );
        expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
        expect(extractAllTo).toHaveBeenCalledTimes(1);
        expect(fsMock.unlinkSync).toHaveBeenCalledTimes(1);
        expect(typeof dir).toBe('string');
        expect(dir).toContain('cloudinary-extract-');
    });

    test('throws when the download does not return 200', async () => {
        fetchWithTimeout.mockResolvedValue({ status: 500 });
        const svc = await CloudinaryService.getInstance();
        await expect(svc.downloadAndExtractZip('https://x/y')).rejects.toThrow('Unable to download zip file');
        expect(extractAllTo).not.toHaveBeenCalled();
    });
});

describe('getResourcesFromFolder', () => {
    test('downloads the folder zip from the CMS download-all endpoint', async () => {
        fetchWithTimeout.mockResolvedValue({ status: 200, data: Buffer.from('zip') });
        const svc = await CloudinaryService.getInstance();

        await svc.getResourcesFromFolder('persona1');

        expect(fetchWithTimeout).toHaveBeenCalledWith(
            'https://cms.paidgirls.site/folders/persona1/files/download-all',
            { responseType: 'arraybuffer' },
        );
    });
});
