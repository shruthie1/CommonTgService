/**
 * Tests for CloudinaryService (src/cloudinary.ts).
 *
 * External boundaries mocked:
 *   - `cloudinary` SDK (v2.config / uploader.upload / uploader.upload_large /
 *      api.resources / api.create_folder)
 *   - `fetchWithTimeout` (network)
 *   - `fs` (filesystem)
 *   - `adm-zip` (zip extraction)
 *
 * The wrapper logic (singleton, resource map, download+extract flow,
 * upload aggregation, error handling) runs for real.
 */

const v2 = {
    config: jest.fn(),
    uploader: {
        upload: jest.fn(),
        upload_large: jest.fn(),
    },
    api: {
        resources: jest.fn(),
        create_folder: jest.fn(),
    },
};
jest.mock('cloudinary', () => ({ v2 }));

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
    process.env.CL_NAME = 'cloud';
    process.env.CL_APIKEY = 'key';
    process.env.CL_APISECRET = 'secret';
});

describe('constructor + getInstance', () => {
    test('configures the SDK with env credentials on construction', async () => {
        fetchWithTimeout.mockResolvedValue({ status: 200, data: Buffer.from('zip') });
        await CloudinaryService.getInstance('myfolder');
        expect(v2.config).toHaveBeenCalledWith({
            cloud_name: 'cloud',
            api_key: 'key',
            api_secret: 'secret',
        });
    });

    test('is a singleton across getInstance calls', async () => {
        fetchWithTimeout.mockResolvedValue({ status: 200, data: Buffer.from('zip') });
        const a = await CloudinaryService.getInstance('f1');
        const b = await CloudinaryService.getInstance('f2');
        expect(a).toBe(b);
        expect(v2.config).toHaveBeenCalledTimes(1); // constructed once only
    });
});

describe('downloadAndExtractZip', () => {
    test('downloads, writes, extracts, and cleans up on a 200 response', async () => {
        fetchWithTimeout.mockResolvedValueOnce({ status: 200, data: Buffer.from('zipdata') });
        const svc = new CloudinaryService();
        await svc.downloadAndExtractZip('https://cms.example.com/folder/files/download-all');

        expect(fetchWithTimeout).toHaveBeenCalledWith(
            'https://cms.example.com/folder/files/download-all',
            { responseType: 'arraybuffer' },
        );
        expect(fsMock.writeFileSync).toHaveBeenCalled();
        expect(extractAllTo).toHaveBeenCalled();
        expect(fsMock.unlinkSync).toHaveBeenCalled();
    });

    test('throws when the download is not a 200', async () => {
        fetchWithTimeout.mockResolvedValueOnce({ status: 500, data: null });
        const svc = new CloudinaryService();
        await expect(svc.downloadAndExtractZip('https://x/y')).rejects.toThrow(
            /Unable to download zip file/,
        );
        expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    test('throws when fetch returns undefined', async () => {
        fetchWithTimeout.mockResolvedValueOnce(undefined);
        const svc = new CloudinaryService();
        await expect(svc.downloadAndExtractZip('https://x/y')).rejects.toThrow(
            /Unable to download zip file/,
        );
    });
});

describe('getResourcesFromFolder', () => {
    test('delegates to downloadAndExtractZip with the CMS url', async () => {
        fetchWithTimeout.mockResolvedValueOnce({ status: 200, data: Buffer.from('z') });
        const svc = new CloudinaryService();
        await svc.getResourcesFromFolder('photos');
        expect(fetchWithTimeout).toHaveBeenCalledWith(
            'https://cms.paidgirls.site/folders/photos/files/download-all',
            { responseType: 'arraybuffer' },
        );
    });
});

describe('createFolder', () => {
    test('returns the SDK result on success', async () => {
        v2.api.create_folder.mockResolvedValueOnce({ success: true });
        const svc = new CloudinaryService();
        expect(await svc.createFolder('f')).toEqual({ success: true });
    });

    test('rethrows on SDK failure', async () => {
        v2.api.create_folder.mockRejectedValueOnce(new Error('create fail'));
        const svc = new CloudinaryService();
        await expect(svc.createFolder('f')).rejects.toThrow('create fail');
    });
});

describe('createNewFolder', () => {
    test('creates the folder then uploads resources', async () => {
        v2.api.create_folder.mockResolvedValueOnce({});
        v2.uploader.upload_large.mockResolvedValue({ ok: true });
        const svc = new CloudinaryService();
        svc.resources.set('a', 'https://img/a.jpg');
        await svc.createNewFolder('f');
        expect(v2.api.create_folder).toHaveBeenCalledWith('f');
        expect(v2.uploader.upload_large).toHaveBeenCalledWith('https://img/a.jpg', {
            folder: 'f',
            resource_type: 'auto',
            public_id: 'a',
        });
    });
});

describe('uploadFilesToFolder', () => {
    test('uploads every resource and returns results', async () => {
        v2.uploader.upload_large.mockResolvedValue({ ok: true });
        const svc = new CloudinaryService();
        svc.resources.set('k1', 'u1');
        svc.resources.set('k2', 'u2');
        const res = await svc.uploadFilesToFolder('folder');
        expect(res).toHaveLength(2);
        expect(v2.uploader.upload_large).toHaveBeenCalledTimes(2);
    });

    test('rethrows if any upload fails', async () => {
        v2.uploader.upload_large.mockRejectedValueOnce(new Error('upload fail'));
        const svc = new CloudinaryService();
        svc.resources.set('k1', 'u1');
        await expect(svc.uploadFilesToFolder('folder')).rejects.toThrow('upload fail');
    });
});

describe('overwriteFile', () => {
    test('uploads with overwrite options on success', async () => {
        v2.uploader.upload.mockResolvedValueOnce({ public_id: 'index_nbzca5.js' });
        const svc = new CloudinaryService();
        await svc.overwriteFile();
        expect(v2.uploader.upload).toHaveBeenCalledWith(
            './src/test.js',
            expect.objectContaining({ overwrite: true, public_id: 'index_nbzca5.js' }),
        );
    });

    test('swallows upload errors via parseError', async () => {
        v2.uploader.upload.mockRejectedValueOnce(new Error('overwrite fail'));
        const svc = new CloudinaryService();
        await expect(svc.overwriteFile()).resolves.toBeUndefined();
    });
});

describe('findAndSaveResources', () => {
    test('maps resources, saves files, and populates the resource map', async () => {
        v2.api.resources.mockResolvedValueOnce({
            resources: [
                { public_id: 'folder/alice_abc', url: 'https://img/alice.jpg' },
                { public_id: 'folder/bob_def', url: 'https://img/bob.png' },
            ],
        });
        // saveFile -> fetchWithTimeout returns statusText OK and file does not exist
        fetchWithTimeout.mockResolvedValue({ statusText: 'OK', data: Buffer.from('img') });
        fsMock.existsSync.mockReturnValue(false);

        const svc = new CloudinaryService();
        await svc.findAndSaveResources('folder', 'image');

        expect(svc.resources.get('alice')).toBe('https://img/alice.jpg');
        expect(svc.resources.get('bob')).toBe('https://img/bob.png');
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    test('handles a per-resource error without rejecting (inner catch)', async () => {
        v2.api.resources.mockResolvedValueOnce({
            resources: [{ public_id: 'badpublicid', url: 'https://img/x.jpg' }], // no "/" -> split throws
        });
        const svc = new CloudinaryService();
        await expect(svc.findAndSaveResources('folder', 'image')).resolves.toBeUndefined();
    });

    test('handles the api.resources call failing (outer catch)', async () => {
        v2.api.resources.mockRejectedValueOnce(new Error('api fail'));
        const svc = new CloudinaryService();
        await expect(svc.findAndSaveResources('folder', 'image')).resolves.toBeUndefined();
    });

    test('saveFile replaces an existing file when it already exists', async () => {
        v2.api.resources.mockResolvedValueOnce({
            resources: [{ public_id: 'folder/cat_abc', url: 'https://img/cat.jpg' }],
        });
        fetchWithTimeout.mockResolvedValue({ statusText: 'OK', data: Buffer.from('img') });
        fsMock.existsSync.mockReturnValue(true); // exists -> unlink then write
        const svc = new CloudinaryService();
        await svc.findAndSaveResources('folder', 'image');
        expect(fsMock.unlinkSync).toHaveBeenCalled();
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    test('saveFile throws (caught by parseError) when download is not OK', async () => {
        v2.api.resources.mockResolvedValueOnce({
            resources: [{ public_id: 'folder/dog_abc', url: 'https://img/dog.jpg' }],
        });
        fetchWithTimeout.mockResolvedValue({ statusText: 'NotFound', data: null });
        const svc = new CloudinaryService();
        await expect(svc.findAndSaveResources('folder', 'image')).resolves.toBeUndefined();
        // url was still mapped before saveFile threw
        expect(svc.resources.get('dog')).toBe('https://img/dog.jpg');
    });
});

describe('accessors', () => {
    test('get returns the mapped url or empty string', () => {
        const svc = new CloudinaryService();
        svc.resources.set('p', 'https://u');
        expect(svc.get('p')).toBe('https://u');
        expect(svc.get('missing')).toBe('');
    });

    test('get swallows errors when the map is broken', () => {
        const svc = new CloudinaryService();
        (svc as any).resources = null; // force a throw inside get
        expect(svc.get('p')).toBeUndefined();
    });

    test('getBuffer returns the mapped url or empty string', () => {
        const svc = new CloudinaryService();
        svc.resources.set('p', 'https://u');
        expect(svc.getBuffer('p')).toBe('https://u');
        expect(svc.getBuffer('missing')).toBe('');
    });

    test('getBuffer swallows errors when the map is broken', () => {
        const svc = new CloudinaryService();
        (svc as any).resources = null;
        expect(svc.getBuffer('p')).toBeUndefined();
    });

    test('printResources iterates without throwing', () => {
        const svc = new CloudinaryService();
        svc.resources.set('a', '1');
        expect(() => svc.printResources()).not.toThrow();
    });

    test('printResources swallows errors', () => {
        const svc = new CloudinaryService();
        (svc as any).resources = {
            forEach: () => {
                throw new Error('iterate fail');
            },
        };
        expect(() => svc.printResources()).not.toThrow();
    });
});
