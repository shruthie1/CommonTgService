import { Api } from 'telegram';
import * as fs from 'fs';
import { CustomFile } from 'telegram/client/uploads';
import { sleep } from 'telegram/Helpers';
import { TgContext, PrivacyBatchSettings } from './types';

// ---- Shared privacy rule setter (parallelized) ----

async function setPrivacyRules(
    ctx: TgContext,
    rules: Array<{ key: Api.TypeInputPrivacyKey; rules: Api.TypeInputPrivacyRule[] }>
): Promise<void> {
    await Promise.all(
        rules.map(({ key, rules: privacyRules }) =>
            ctx.client.invoke(new Api.account.SetPrivacy({ key, rules: privacyRules }))
        )
    );
}

export async function updatePrivacy(ctx: TgContext): Promise<void> {
    try {
        await setPrivacyRules(ctx, [
            { key: new Api.InputPrivacyKeyPhoneCall(), rules: [new Api.InputPrivacyValueDisallowAll()] },
            { key: new Api.InputPrivacyKeyProfilePhoto(), rules: [new Api.InputPrivacyValueAllowAll()] },
            { key: new Api.InputPrivacyKeyForwards(), rules: [new Api.InputPrivacyValueAllowAll()] },
            { key: new Api.InputPrivacyKeyPhoneNumber(), rules: [new Api.InputPrivacyValueDisallowAll()] },
            { key: new Api.InputPrivacyKeyStatusTimestamp(), rules: [new Api.InputPrivacyValueAllowAll()] },
            { key: new Api.InputPrivacyKeyAbout(), rules: [new Api.InputPrivacyValueAllowAll()] },
        ]);
        ctx.logger.info(ctx.phoneNumber, 'Privacy Updated (all settings)');
    } catch (e) {
        throw e;
    }
}

export async function updatePrivacyforDeletedAccount(ctx: TgContext): Promise<void> {
    try {
        await setPrivacyRules(ctx, [
            { key: new Api.InputPrivacyKeyPhoneCall(), rules: [new Api.InputPrivacyValueDisallowAll()] },
            { key: new Api.InputPrivacyKeyProfilePhoto(), rules: [new Api.InputPrivacyValueDisallowAll()] },
            { key: new Api.InputPrivacyKeyPhoneNumber(), rules: [new Api.InputPrivacyValueDisallowAll()] },
            { key: new Api.InputPrivacyKeyStatusTimestamp(), rules: [new Api.InputPrivacyValueAllowAll()] },
            { key: new Api.InputPrivacyKeyAbout(), rules: [new Api.InputPrivacyValueDisallowAll()] },
        ]);
        ctx.logger.info(ctx.phoneNumber, 'Privacy Updated for Deleted Account (all settings)');
    } catch (e) {
        throw e;
    }
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

    const updates: Promise<Api.account.PrivacyRules>[] = [];

    for (const [key, value] of Object.entries(settings)) {
        if (value && key in privacyMap) {
            updates.push(ctx.client.invoke(new Api.account.SetPrivacy({
                key: new privacyMap[key](),
                rules: privacyRules[value],
            })));
        }
    }

    await Promise.all(updates);
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
