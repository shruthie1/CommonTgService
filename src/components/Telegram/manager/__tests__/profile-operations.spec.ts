import { Api } from 'telegram';
import * as fs from 'fs';
import {
    updatePrivacy,
    updatePrivacyforDeletedAccount,
    updatePrivacyBatch,
    updateProfile,
    updateUsername,
    updateProfilePic,
    downloadProfilePic,
    deleteProfilePhotos,
} from '../profile-operations';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => ({
    statSync: jest.fn(() => ({ size: 123 })),
    writeFileSync: jest.fn(),
}));

function makeLogger() {
    return {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };
}

function makeCtx(client: any) {
    return {
        client,
        phoneNumber: '9990001111',
        logger: makeLogger(),
    } as any;
}

describe('profile-operations', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('updatePrivacy / ensurePrivacy', () => {
        test('writes only mismatched rules', async () => {
            // GetPrivacy returns rules; first all-correct, rest mismatch
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) {
                    // ProfilePhoto desired allow → return allow (correct)
                    if (req.key instanceof Api.InputPrivacyKeyProfilePhoto) {
                        return { rules: [new Api.PrivacyValueAllowAll()] };
                    }
                    // everything else returns "other" (mismatch)
                    return { rules: [] };
                }
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await updatePrivacy(ctx);
            // 5 reads + writes for the 4 mismatches
            const writes = invoke.mock.calls.filter(c => c[0] instanceof Api.account.SetPrivacy);
            expect(writes.length).toBe(4);
            expect(ctx.logger.info).toHaveBeenCalled();
        });

        test('handles read failures and logs incomplete', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) {
                    throw { errorMessage: 'FLOOD' };
                }
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await updatePrivacy(ctx);
            expect(ctx.logger.warn).toHaveBeenCalled();
        });

        test('all rules already correct → no writes', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) {
                    if (req.key instanceof Api.InputPrivacyKeyProfilePhoto ||
                        req.key instanceof Api.InputPrivacyKeyForwards ||
                        req.key instanceof Api.InputPrivacyKeyStatusTimestamp) {
                        return { rules: [new Api.PrivacyValueAllowAll()] };
                    }
                    return { rules: [new Api.PrivacyValueDisallowAll()] };
                }
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await updatePrivacy(ctx);
            const writes = invoke.mock.calls.filter(c => c[0] instanceof Api.account.SetPrivacy);
            expect(writes.length).toBe(0);
        });
    });

    describe('updatePrivacyforDeletedAccount', () => {
        test('throws when read failures occur', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) throw new Error('boom');
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await expect(updatePrivacyforDeletedAccount(ctx)).rejects.toThrow(/incomplete/);
        });

        test('surfaces error.message when GramJS error has no errorMessage field', async () => {
            // Some network/runtime rejections are plain objects with only `message`
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) throw { message: 'socket hang up' };
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await expect(updatePrivacyforDeletedAccount(ctx)).rejects.toThrow(/socket hang up/);
        });

        test('falls back to String(error) for non-standard rejection values', async () => {
            // A rejection that is neither Error nor a record with message/errorMessage
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) throw 'RAW_STRING_FAILURE';
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await expect(updatePrivacyforDeletedAccount(ctx)).rejects.toThrow(/RAW_STRING_FAILURE/);
        });

        test('falls back to String(error) for a record without message fields', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) throw { code: 500, retryable: false };
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            // record without string message → String(error) === '[object Object]'
            await expect(updatePrivacyforDeletedAccount(ctx)).rejects.toThrow(/object Object/);
        });

        test('succeeds when all confirmed (writes mismatches)', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) return { rules: [] };
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await updatePrivacyforDeletedAccount(ctx);
            expect(ctx.logger.info).toHaveBeenCalledWith(ctx.phoneNumber, expect.stringContaining('Privacy deactivated'));
        });

        test('throws on write failure', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.GetPrivacy) return { rules: [] };
                if (req instanceof Api.account.SetPrivacy) throw new Error('writefail');
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await expect(updatePrivacyforDeletedAccount(ctx)).rejects.toThrow(/incomplete/);
        });
    });

    describe('updatePrivacyBatch', () => {
        test('throws when client missing', async () => {
            await expect(updatePrivacyBatch(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });

        test('applies known keys with mapped values', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke });
            const result = await updatePrivacyBatch(ctx, {
                phoneNumber: 'everybody',
                lastSeen: 'contacts',
                profilePhotos: 'nobody',
                groups: 'everybody',
            } as any);
            expect(result).toBe(true);
            expect(invoke).toHaveBeenCalledTimes(4);
        });

        test('skips falsy / unknown keys', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke });
            await updatePrivacyBatch(ctx, { phoneNumber: undefined, unknownKey: 'everybody' } as any);
            expect(invoke).not.toHaveBeenCalled();
        });
    });

    describe('updateProfile', () => {
        test('invokes UpdateProfile with firstName and about', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke });
            await updateProfile(ctx, 'John', 'bio');
            expect(invoke).toHaveBeenCalledTimes(1);
            const req = invoke.mock.calls[0][0];
            expect(req).toBeInstanceOf(Api.account.UpdateProfile);
        });

        test('rethrows error', async () => {
            const invoke = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({ invoke });
            await expect(updateProfile(ctx, 'John', 'bio')).rejects.toThrow('fail');
        });
    });

    describe('updateUsername', () => {
        test('removes username when empty', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, '');
            expect(result).toBe('');
            expect(invoke).toHaveBeenCalledTimes(1);
        });

        test('logs error when removing empty username fails', async () => {
            const invoke = jest.fn().mockRejectedValue(new Error('remove fail'));
            const ctx = makeCtx({ invoke });
            await updateUsername(ctx, '');
            expect(ctx.logger.info).toHaveBeenCalled();
        });

        test('updates available username on first try', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.CheckUsername) return true;
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, 'mike');
            expect(result).toBe('mike');
        });

        test('retries with increment when unavailable, then succeeds', async () => {
            let calls = 0;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.CheckUsername) {
                    calls++;
                    return calls >= 3; // unavailable twice then available
                }
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, 'mike');
            expect(result).toBe('mike1');
        });

        test('uses random numbers suffix beyond 6 increments', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.CheckUsername) return false; // always unavailable
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, 'mike');
            expect(result).toBe(''); // loop exhausts without success
        });

        test('breaks on USERNAME_NOT_MODIFIED error', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.CheckUsername) throw new Error('USERNAME_NOT_MODIFIED');
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, 'mike');
            expect(result).toBe('mike');
        });

        test('handles generic check errors with retries', async () => {
            let n = 0;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.account.CheckUsername) {
                    n++;
                    throw new Error('SOME_ERROR');
                }
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            const result = await updateUsername(ctx, 'mike');
            expect(result).toBe('');
            expect(n).toBe(10);
        });
    });

    describe('updateProfilePic', () => {
        test('uploads file and invokes UploadProfilePhoto', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'file' });
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ uploadFile, invoke });
            await updateProfilePic(ctx, '/tmp/pic.jpg');
            expect(uploadFile).toHaveBeenCalled();
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.photos.UploadProfilePhoto);
        });

        test('rethrows on error', async () => {
            const uploadFile = jest.fn().mockRejectedValue(new Error('upload fail'));
            const ctx = makeCtx({ uploadFile, invoke: jest.fn() });
            await expect(updateProfilePic(ctx, '/tmp/pic.jpg')).rejects.toThrow('upload fail');
        });
    });

    describe('downloadProfilePic', () => {
        function makePhoto() {
            return Object.assign(Object.create(Api.Photo.prototype), {
                id: 1, accessHash: 2, fileReference: Buffer.from('x'), dcId: 1,
                sizes: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
            });
        }
        test('downloads selected photo and writes file', async () => {
            const photo = makePhoto();
            const invoke = jest.fn().mockResolvedValue({ photos: [photo] });
            const downloadFile = jest.fn().mockResolvedValue(Buffer.from('img'));
            const ctx = makeCtx({ invoke, downloadFile });
            const result = await downloadProfilePic(ctx, 0);
            expect(result).toBe('profile_picture_1.jpg');
        });

        test('returns undefined when no photos', async () => {
            const invoke = jest.fn().mockResolvedValue({ photos: [] });
            const ctx = makeCtx({ invoke });
            const result = await downloadProfilePic(ctx, 0);
            expect(result).toBeUndefined();
        });

        test('out of range index logs and returns undefined', async () => {
            const invoke = jest.fn().mockResolvedValue({ photos: [makePhoto()] });
            const ctx = makeCtx({ invoke });
            const result = await downloadProfilePic(ctx, 5);
            expect(result).toBeUndefined();
        });

        test('download returns empty → logs failure', async () => {
            const invoke = jest.fn().mockResolvedValue({ photos: [makePhoto()] });
            const downloadFile = jest.fn().mockResolvedValue(null);
            const ctx = makeCtx({ invoke, downloadFile });
            const result = await downloadProfilePic(ctx, 0);
            expect(result).toBeUndefined();
            expect(ctx.logger.info).toHaveBeenCalledWith(ctx.phoneNumber, 'Failed to download the photo.');
        });

        test('error path logs and returns undefined', async () => {
            const invoke = jest.fn().mockRejectedValue(new Error('boom'));
            const ctx = makeCtx({ invoke });
            const result = await downloadProfilePic(ctx, 0);
            expect(result).toBeUndefined();
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });

    describe('deleteProfilePhotos', () => {
        test('deletes photos when present', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.photos.GetUserPhotos) return { photos: [{ id: 1 }, { id: 2 }] };
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await deleteProfilePhotos(ctx);
            const del = invoke.mock.calls.find(c => c[0] instanceof Api.photos.DeletePhotos);
            expect(del).toBeDefined();
        });

        test('no photos → does not call DeletePhotos', async () => {
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.photos.GetUserPhotos) return { photos: [] };
                return undefined;
            });
            const ctx = makeCtx({ invoke });
            await deleteProfilePhotos(ctx);
            const del = invoke.mock.calls.find(c => c[0] instanceof Api.photos.DeletePhotos);
            expect(del).toBeUndefined();
        });

        test('rethrows error', async () => {
            const invoke = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({ invoke });
            await expect(deleteProfilePhotos(ctx)).rejects.toThrow('fail');
        });
    });
});
