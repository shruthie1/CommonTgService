import { Api } from 'telegram';
import { deleteProfilePhotos } from '../deleteProfilePics';

describe('deleteProfilePhotos', () => {
    let infoSpy: jest.SpyInstance;
    beforeEach(() => {
        infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    test('fetches photos when none provided and deletes them', async () => {
        const photos = [{ id: 1 }, { id: 2 }];
        const client = { invoke: jest.fn().mockResolvedValueOnce({ photos }).mockResolvedValueOnce(undefined) } as any;
        await deleteProfilePhotos(client);
        expect(client.invoke).toHaveBeenCalledTimes(2);
        expect(client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.photos.GetUserPhotos);
        expect(client.invoke.mock.calls[1][0]).toBeInstanceOf(Api.photos.DeletePhotos);
    });

    test('skips delete when no photos exist', async () => {
        const client = { invoke: jest.fn().mockResolvedValue({ photos: [] }) } as any;
        await deleteProfilePhotos(client);
        // only the GetUserPhotos call, no DeletePhotos
        expect(client.invoke).toHaveBeenCalledTimes(1);
    });

    test('uses provided photos without fetching', async () => {
        const client = { invoke: jest.fn().mockResolvedValue(undefined) } as any;
        await deleteProfilePhotos(client, [{ id: 9 }] as any);
        expect(client.invoke).toHaveBeenCalledTimes(1);
        expect(client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.photos.DeletePhotos);
    });

    test('rethrows errors', async () => {
        const client = { invoke: jest.fn().mockRejectedValue(new Error('boom')) } as any;
        await expect(deleteProfilePhotos(client)).rejects.toThrow('boom');
    });
});
