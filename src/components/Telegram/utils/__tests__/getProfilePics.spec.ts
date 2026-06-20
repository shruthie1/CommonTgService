import { Api } from 'telegram';
import { getProfilePics } from '../getProfilePics';

describe('getProfilePics', () => {
    test('returns photos array from invoke result', async () => {
        const photos = [{ id: 1 }, { id: 2 }];
        const client = { invoke: jest.fn().mockResolvedValue({ photos }) } as any;
        const result = await getProfilePics(client);
        expect(result).toBe(photos);
        const arg = client.invoke.mock.calls[0][0];
        expect(arg).toBeInstanceOf(Api.photos.GetUserPhotos);
        expect((arg as Api.photos.GetUserPhotos).userId).toBe('me');
    });

    test('passes explicit user entity', async () => {
        const client = { invoke: jest.fn().mockResolvedValue({ photos: [] }) } as any;
        await getProfilePics(client, 'someUser');
        const arg = client.invoke.mock.calls[0][0] as Api.photos.GetUserPhotos;
        expect(arg.userId).toBe('someUser');
    });

    test('returns undefined when result is nullish', async () => {
        const client = { invoke: jest.fn().mockResolvedValue(undefined) } as any;
        expect(await getProfilePics(client)).toBeUndefined();
    });
});
