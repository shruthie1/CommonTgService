"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePrivacy = updatePrivacy;
exports.updatePrivacyforDeletedAccount = updatePrivacyforDeletedAccount;
exports.updatePrivacyBatch = updatePrivacyBatch;
exports.updateProfile = updateProfile;
exports.updateUsername = updateUsername;
exports.updateProfilePic = updateProfilePic;
exports.downloadProfilePic = downloadProfilePic;
exports.deleteProfilePhotos = deleteProfilePhotos;
const telegram_1 = require("telegram");
const fs = __importStar(require("fs"));
const uploads_1 = require("telegram/client/uploads");
const Helpers_1 = require("telegram/Helpers");
async function setPrivacyRules(ctx, rules) {
    await Promise.all(rules.map(({ key, rules: privacyRules }) => ctx.client.invoke(new telegram_1.Api.account.SetPrivacy({ key, rules: privacyRules }))));
}
async function updatePrivacy(ctx) {
    try {
        await setPrivacyRules(ctx, [
            { key: new telegram_1.Api.InputPrivacyKeyPhoneCall(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(), rules: [new telegram_1.Api.InputPrivacyValueAllowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyForwards(), rules: [new telegram_1.Api.InputPrivacyValueAllowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(), rules: [new telegram_1.Api.InputPrivacyValueAllowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyAbout(), rules: [new telegram_1.Api.InputPrivacyValueAllowAll()] },
        ]);
        ctx.logger.info(ctx.phoneNumber, 'Privacy Updated (all settings)');
    }
    catch (e) {
        throw e;
    }
}
async function updatePrivacyforDeletedAccount(ctx) {
    try {
        await setPrivacyRules(ctx, [
            { key: new telegram_1.Api.InputPrivacyKeyPhoneCall(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(), rules: [new telegram_1.Api.InputPrivacyValueAllowAll()] },
            { key: new telegram_1.Api.InputPrivacyKeyAbout(), rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()] },
        ]);
        ctx.logger.info(ctx.phoneNumber, 'Privacy Updated for Deleted Account (all settings)');
    }
    catch (e) {
        throw e;
    }
}
async function updatePrivacyBatch(ctx, settings) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const privacyRules = {
        everybody: [new telegram_1.Api.InputPrivacyValueAllowAll()],
        contacts: [new telegram_1.Api.InputPrivacyValueAllowContacts()],
        nobody: [new telegram_1.Api.InputPrivacyValueDisallowAll()],
    };
    const privacyMap = {
        phoneNumber: telegram_1.Api.InputPrivacyKeyPhoneNumber,
        lastSeen: telegram_1.Api.InputPrivacyKeyStatusTimestamp,
        profilePhotos: telegram_1.Api.InputPrivacyKeyProfilePhoto,
        forwards: telegram_1.Api.InputPrivacyKeyForwards,
        calls: telegram_1.Api.InputPrivacyKeyPhoneCall,
        groups: telegram_1.Api.InputPrivacyKeyChatInvite,
    };
    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
        if (value && key in privacyMap) {
            updates.push(ctx.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new privacyMap[key](),
                rules: privacyRules[value],
            })));
        }
    }
    await Promise.all(updates);
    return true;
}
async function updateProfile(ctx, firstName, about) {
    const data = { lastName: '' };
    if (firstName !== undefined)
        data['firstName'] = firstName;
    if (about !== undefined)
        data['about'] = about;
    try {
        await ctx.client.invoke(new telegram_1.Api.account.UpdateProfile(data));
        ctx.logger.info(ctx.phoneNumber, 'Updated Name: ', firstName);
    }
    catch (error) {
        throw error;
    }
}
async function updateUsername(ctx, baseUsername) {
    let newUserName = '';
    let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
    let increment = 0;
    if (username === '') {
        try {
            await ctx.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
            ctx.logger.info(ctx.phoneNumber, `Removed Username successfully.`);
        }
        catch (error) {
            ctx.logger.info(ctx.phoneNumber, error);
        }
    }
    else {
        while (increment < 10) {
            try {
                const result = await ctx.client.invoke(new telegram_1.Api.account.CheckUsername({ username }));
                ctx.logger.info(ctx.phoneNumber, `Available: ${result} (${username})`);
                if (result) {
                    await ctx.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                    ctx.logger.info(ctx.phoneNumber, `Username '${username}' updated successfully.`);
                    newUserName = username;
                    break;
                }
                else {
                    if (increment >= 6) {
                        const randomNums = Math.floor(Math.random() * 90 + 10);
                        username = baseUsername + randomNums;
                    }
                    else {
                        username = baseUsername + increment;
                    }
                    increment++;
                    await (0, Helpers_1.sleep)(2000);
                }
            }
            catch (error) {
                ctx.logger.info(ctx.phoneNumber, error.message);
                if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                    newUserName = username;
                    break;
                }
                if (increment >= 6) {
                    const randomChars = Math.random().toString(36).substring(2, 6);
                    username = baseUsername + randomChars;
                }
                else {
                    username = baseUsername + increment;
                }
                increment++;
                await (0, Helpers_1.sleep)(2000);
            }
        }
    }
    return newUserName;
}
async function updateProfilePic(ctx, image) {
    try {
        const file = await ctx.client.uploadFile({
            file: new uploads_1.CustomFile('pic.jpg', fs.statSync(image).size, image),
            workers: 1,
        });
        ctx.logger.info(ctx.phoneNumber, 'file uploaded');
        await ctx.client.invoke(new telegram_1.Api.photos.UploadProfilePhoto({ file }));
        ctx.logger.info(ctx.phoneNumber, 'profile pic updated');
    }
    catch (error) {
        throw error;
    }
}
async function downloadProfilePic(ctx, photoIndex) {
    try {
        const photos = await ctx.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
        if (photos.photos.length > 0) {
            ctx.logger.info(ctx.phoneNumber, `You have ${photos.photos.length} profile photos.`);
            if (photoIndex < photos.photos.length) {
                const selectedPhoto = photos.photos[photoIndex];
                const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                const photoFileSize = selectedPhoto.sizes[index];
                const photoBuffer = await ctx.client.downloadFile(new telegram_1.Api.InputPhotoFileLocation({
                    id: selectedPhoto.id,
                    accessHash: selectedPhoto.accessHash,
                    fileReference: selectedPhoto.fileReference,
                    thumbSize: photoFileSize.type,
                }), { dcId: selectedPhoto.dcId });
                if (photoBuffer) {
                    const outputPath = `profile_picture_${photoIndex + 1}.jpg`;
                    fs.writeFileSync(outputPath, photoBuffer);
                    ctx.logger.info(ctx.phoneNumber, `Profile picture downloaded as '${outputPath}'`);
                    return outputPath;
                }
                else {
                    ctx.logger.info(ctx.phoneNumber, 'Failed to download the photo.');
                }
            }
            else {
                ctx.logger.info(ctx.phoneNumber, `Photo index ${photoIndex} is out of range.`);
            }
        }
        else {
            ctx.logger.info(ctx.phoneNumber, 'No profile photos found.');
        }
    }
    catch (err) {
        ctx.logger.error(ctx.phoneNumber, 'Error:', err);
    }
    return undefined;
}
async function deleteProfilePhotos(ctx) {
    try {
        const result = await ctx.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me' }));
        ctx.logger.info(ctx.phoneNumber, `Profile Pics found: ${result.photos.length}`);
        if (result && result.photos?.length > 0) {
            await ctx.client.invoke(new telegram_1.Api.photos.DeletePhotos({
                id: result.photos,
            }));
        }
        ctx.logger.info(ctx.phoneNumber, 'Deleted profile Photos');
    }
    catch (error) {
        throw error;
    }
}
//# sourceMappingURL=profile-operations.js.map