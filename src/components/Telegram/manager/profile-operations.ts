import { Api } from 'telegram';
import * as fs from 'fs';
import { CustomFile } from 'telegram/client/uploads';
import { sleep } from 'telegram/Helpers';
import { TgContext, PrivacyBatchSettings } from './types';

// ---- Privacy: read-first, write only mismatches ----

interface PrivacyExpectation {
    key: Api.TypeInputPrivacyKey;
    label: string;
    desired: 'allow' | 'disallow';
}

/**
 * Read-first privacy enforcement with human-like sequential timing.
 *
 * 1. Read each rule sequentially with small random gaps.
 * 2. Collect mismatches.
 * 3. Write only mismatches sequentially with larger delays
 *    (mimics a user toggling settings one at a time).
 *
 * Returns count of rules that were actually written.
 */
interface PrivacyResult {
    updated: number;
    readFailures: number;
    writeFailures: number;
    allConfirmed: boolean;
}

async function ensurePrivacy(ctx: TgContext, expectations: PrivacyExpectation[]): Promise<PrivacyResult> {
    let readFailures = 0;
    let writeFailures = 0;

    // Phase 1: sequential reads with human-like gaps
    const mismatches: PrivacyExpectation[] = [];
    for (const expectation of expectations) {
        const { key, label, desired } = expectation;
        try {
            const current = await ctx.client.invoke(new Api.account.GetPrivacy({ key }));
            const hasAllowAll = current.rules.some((r: any) => r.className === 'PrivacyValueAllowAll');
            const hasDisallowAll = current.rules.some((r: any) => r.className === 'PrivacyValueDisallowAll');
            const isCorrect = desired === 'allow' ? hasAllowAll : hasDisallowAll;

            if (isCorrect) {
                ctx.logger.debug(ctx.phoneNumber, `Privacy ${label}: OK (${desired})`);
            } else {
                ctx.logger.info(ctx.phoneNumber, `Privacy ${label}: mismatch → need ${desired} (was ${hasAllowAll ? 'allow' : hasDisallowAll ? 'disallow' : 'other'})`);
                mismatches.push(expectation);
            }
        } catch (err: any) {
            ctx.logger.warn(ctx.phoneNumber, `Privacy ${label}: read failed — ${err.message}`);
            readFailures++;
        }
        await sleep(1000 + Math.random() * 2000);
    }

    if (mismatches.length === 0) {
        return { updated: 0, readFailures, writeFailures, allConfirmed: readFailures === 0 };
    }

    // Phase 2: sequential writes with larger human-like delays
    let updated = 0;
    for (const { key, label, desired } of mismatches) {
        try {
            const rules = desired === 'allow'
                ? [new Api.InputPrivacyValueAllowAll()]
                : [new Api.InputPrivacyValueDisallowAll()];
            await ctx.client.invoke(new Api.account.SetPrivacy({ key, rules }));
            ctx.logger.info(ctx.phoneNumber, `Privacy ${label}: fixed → ${desired}`);
            updated++;
        } catch (err: any) {
            ctx.logger.warn(ctx.phoneNumber, `Privacy ${label}: write failed — ${err.message}`);
            writeFailures++;
        }
        await sleep(3000 + Math.random() * 7000);
    }
    return { updated, readFailures, writeFailures, allConfirmed: readFailures === 0 && writeFailures === 0 };
}

/**
 * Active-account privacy: read-first, only fix ProfilePhoto and LastSeen.
 * PhoneCall, PhoneNumber, Forwards, About stay as warmup set them.
 */
const ACTIVE_PRIVACY: PrivacyExpectation[] = [
    { key: new Api.InputPrivacyKeyPhoneCall(), label: 'PhoneCall', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyProfilePhoto(), label: 'ProfilePhoto', desired: 'allow' },
    { key: new Api.InputPrivacyKeyForwards(), label: 'Forwards', desired: 'allow' },
    { key: new Api.InputPrivacyKeyPhoneNumber(), label: 'PhoneNumber', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyStatusTimestamp(), label: 'LastSeen', desired: 'allow' },
];

export async function updatePrivacy(ctx: TgContext): Promise<void> {
    const result = await ensurePrivacy(ctx, ACTIVE_PRIVACY);
    if (!result.allConfirmed) {
        ctx.logger.warn(ctx.phoneNumber, `Privacy activate incomplete: ${result.readFailures} read failure(s), ${result.writeFailures} write failure(s)`);
    }
    ctx.logger.info(ctx.phoneNumber, `Privacy check complete: ${result.updated} rule(s) corrected`);
}

/**
 * Deactivate privacy: hide everything when archived/rotated.
 * Aligned with promote-clients HIDE_ALL_PRIVACY preset.
 */
const DEACTIVATE_PRIVACY: PrivacyExpectation[] = [
    { key: new Api.InputPrivacyKeyPhoneCall(), label: 'PhoneCall', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyProfilePhoto(), label: 'ProfilePhoto', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyForwards(), label: 'Forwards', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyPhoneNumber(), label: 'PhoneNumber', desired: 'disallow' },
    { key: new Api.InputPrivacyKeyStatusTimestamp(), label: 'LastSeen', desired: 'disallow' },
];

export async function updatePrivacyforDeletedAccount(ctx: TgContext): Promise<void> {
    const result = await ensurePrivacy(ctx, DEACTIVATE_PRIVACY);
    if (!result.allConfirmed) {
        const msg = `Privacy deactivate incomplete: ${result.readFailures} read failure(s), ${result.writeFailures} write failure(s)`;
        ctx.logger.warn(ctx.phoneNumber, msg);
        throw new Error(msg);
    }
    ctx.logger.info(ctx.phoneNumber, `Privacy deactivated: ${result.updated} rule(s) hidden`);
}

export async function updatePrivacyBatch(ctx: TgContext, settings: PrivacyBatchSettings): Promise<boolean> {
    if (!ctx.client) throw new Error('Client not initialized');

    const privacyRules: Record<string, Api.TypeInputPrivacyRule[]> = {
        everybody: [new Api.InputPrivacyValueAllowAll()],
        contacts: [new Api.InputPrivacyValueAllowContacts()],
        nobody: [new Api.InputPrivacyValueDisallowAll()],
    };

    const privacyMap: Record<string, new () => Api.TypeInputPrivacyKey> = {
        phoneNumber: Api.InputPrivacyKeyPhoneNumber,
        lastSeen: Api.InputPrivacyKeyStatusTimestamp,
        profilePhotos: Api.InputPrivacyKeyProfilePhoto,
        forwards: Api.InputPrivacyKeyForwards,
        calls: Api.InputPrivacyKeyPhoneCall,
        groups: Api.InputPrivacyKeyChatInvite,
    };

    // Sequential writes with delays to avoid parallel burst detection
    for (const [key, value] of Object.entries(settings)) {
        if (value && key in privacyMap) {
            await ctx.client.invoke(new Api.account.SetPrivacy({
                key: new privacyMap[key](),
                rules: privacyRules[value],
            }));
            ctx.logger.debug(ctx.phoneNumber, `Privacy batch: ${key} → ${value}`);
            await sleep(2000 + Math.random() * 3000);
        }
    }

    return true;
}

export async function updateProfile(ctx: TgContext, firstName: string, about: string): Promise<void> {
    const data: Record<string, string> = { lastName: '' };
    if (firstName !== undefined) data['firstName'] = firstName;
    if (about !== undefined) data['about'] = about;

    try {
        await ctx.client.invoke(new Api.account.UpdateProfile(data));
        ctx.logger.info(ctx.phoneNumber, 'Updated Name: ', firstName);
    } catch (error) {
        throw error;
    }
}

export async function updateUsername(ctx: TgContext, baseUsername: string): Promise<string> {
    let newUserName = '';
    let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
    let increment = 0;

    if (username === '') {
        try {
            await ctx.client.invoke(new Api.account.UpdateUsername({ username }));
            ctx.logger.info(ctx.phoneNumber, `Removed Username successfully.`);
        } catch (error) {
            ctx.logger.info(ctx.phoneNumber, error);
        }
    } else {
        while (increment < 10) {
            try {
                const result = await ctx.client.invoke(new Api.account.CheckUsername({ username }));
                ctx.logger.info(ctx.phoneNumber, `Available: ${result} (${username})`);
                if (result) {
                    await ctx.client.invoke(new Api.account.UpdateUsername({ username }));
                    ctx.logger.info(ctx.phoneNumber, `Username '${username}' updated successfully.`);
                    newUserName = username;
                    break;
                } else {
                    if (increment >= 6) {
                        const randomNums = Math.floor(Math.random() * 90 + 10);
                        username = baseUsername + randomNums;
                    } else {
                        username = baseUsername + increment;
                    }
                    increment++;
                    await sleep(2000);
                }
            } catch (error) {
                ctx.logger.info(ctx.phoneNumber, error.message);
                if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                    newUserName = username;
                    break;
                }
                if (increment >= 6) {
                    const randomChars = Math.random().toString(36).substring(2, 6);
                    username = baseUsername + randomChars;
                } else {
                    username = baseUsername + increment;
                }
                increment++;
                await sleep(2000);
            }
        }
    }
    return newUserName;
}

export async function updateProfilePic(ctx: TgContext, image: string): Promise<void> {
    try {
        const file = await ctx.client.uploadFile({
            file: new CustomFile('pic.jpg', fs.statSync(image).size, image),
            workers: 1,
        });
        ctx.logger.info(ctx.phoneNumber, 'file uploaded');
        await ctx.client.invoke(new Api.photos.UploadProfilePhoto({ file }));
        ctx.logger.info(ctx.phoneNumber, 'profile pic updated');
    } catch (error) {
        throw error;
    }
}

export async function downloadProfilePic(ctx: TgContext, photoIndex: number): Promise<string | undefined> {
    try {
        const photos = await ctx.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));

        if (photos.photos.length > 0) {
            ctx.logger.info(ctx.phoneNumber, `You have ${photos.photos.length} profile photos.`);
            if (photoIndex < photos.photos.length) {
                const selectedPhoto = <Api.Photo>photos.photos[photoIndex];
                const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                const photoFileSize = selectedPhoto.sizes[index];

                const photoBuffer = await ctx.client.downloadFile(
                    new Api.InputPhotoFileLocation({
                        id: selectedPhoto.id,
                        accessHash: selectedPhoto.accessHash,
                        fileReference: selectedPhoto.fileReference,
                        thumbSize: photoFileSize.type,
                    }),
                    { dcId: selectedPhoto.dcId }
                );

                if (photoBuffer) {
                    const outputPath = `profile_picture_${photoIndex + 1}.jpg`;
                    fs.writeFileSync(outputPath, photoBuffer);
                    ctx.logger.info(ctx.phoneNumber, `Profile picture downloaded as '${outputPath}'`);
                    return outputPath;
                } else {
                    ctx.logger.info(ctx.phoneNumber, 'Failed to download the photo.');
                }
            } else {
                ctx.logger.info(ctx.phoneNumber, `Photo index ${photoIndex} is out of range.`);
            }
        } else {
            ctx.logger.info(ctx.phoneNumber, 'No profile photos found.');
        }
    } catch (err) {
        ctx.logger.error(ctx.phoneNumber, 'Error:', err);
    }
    return undefined;
}

export async function deleteProfilePhotos(ctx: TgContext): Promise<void> {
    try {
        const result = await ctx.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me' }));
        ctx.logger.info(ctx.phoneNumber, `Profile Pics found: ${result.photos.length}`);
        if (result && result.photos?.length > 0) {
            await ctx.client.invoke(
                new Api.photos.DeletePhotos({
                    id: <Api.TypeInputPhoto[]><unknown>result.photos,
                })
            );
        }
        ctx.logger.info(ctx.phoneNumber, 'Deleted profile Photos');
    } catch (error) {
        throw error;
    }
}
