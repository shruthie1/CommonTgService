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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function getErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (isRecord(error)) {
        const errorMessage = error.errorMessage;
        if (typeof errorMessage === 'string')
            return errorMessage;
        const message = error.message;
        if (typeof message === 'string')
            return message;
    }
    return String(error);
}
async function ensurePrivacy(ctx, expectations) {
    let readFailures = 0;
    let writeFailures = 0;
    const failureReasons = [];
    const mismatches = [];
    for (const expectation of expectations) {
        const { key, label, desired } = expectation;
        try {
            const current = await ctx.client.invoke(new telegram_1.Api.account.GetPrivacy({ key }));
            const hasAllowAll = current.rules.some((rule) => rule.className === 'PrivacyValueAllowAll');
            const hasDisallowAll = current.rules.some((rule) => rule.className === 'PrivacyValueDisallowAll');
            const isCorrect = desired === 'allow' ? hasAllowAll : hasDisallowAll;
            if (isCorrect) {
                ctx.logger.debug(ctx.phoneNumber, `Privacy ${label}: OK (${desired})`);
            }
            else {
                ctx.logger.info(ctx.phoneNumber, `Privacy ${label}: mismatch → need ${desired} (was ${hasAllowAll ? 'allow' : hasDisallowAll ? 'disallow' : 'other'})`);
                mismatches.push(expectation);
            }
        }
        catch (err) {
            const errorMessage = getErrorMessage(err);
            ctx.logger.warn(ctx.phoneNumber, `Privacy ${label}: read failed — ${errorMessage}`);
            failureReasons.push(`${label} read: ${errorMessage}`);
            readFailures++;
        }
        await (0, Helpers_1.sleep)(1000 + Math.random() * 2000);
    }
    if (mismatches.length === 0) {
        return { updated: 0, readFailures, writeFailures, allConfirmed: readFailures === 0, failureReasons };
    }
    let updated = 0;
    for (const { key, label, desired } of mismatches) {
        try {
            const rules = desired === 'allow'
                ? [new telegram_1.Api.InputPrivacyValueAllowAll()]
                : [new telegram_1.Api.InputPrivacyValueDisallowAll()];
            await ctx.client.invoke(new telegram_1.Api.account.SetPrivacy({ key, rules }));
            ctx.logger.info(ctx.phoneNumber, `Privacy ${label}: fixed → ${desired}`);
            updated++;
        }
        catch (err) {
            const errorMessage = getErrorMessage(err);
            ctx.logger.warn(ctx.phoneNumber, `Privacy ${label}: write failed — ${errorMessage}`);
            failureReasons.push(`${label} write: ${errorMessage}`);
            writeFailures++;
        }
        await (0, Helpers_1.sleep)(3000 + Math.random() * 7000);
    }
    return { updated, readFailures, writeFailures, allConfirmed: readFailures === 0 && writeFailures === 0, failureReasons };
}
const ACTIVE_PRIVACY = [
    { key: new telegram_1.Api.InputPrivacyKeyPhoneCall(), label: 'PhoneCall', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(), label: 'ProfilePhoto', desired: 'allow' },
    { key: new telegram_1.Api.InputPrivacyKeyForwards(), label: 'Forwards', desired: 'allow' },
    { key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(), label: 'PhoneNumber', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(), label: 'LastSeen', desired: 'allow' },
];
async function updatePrivacy(ctx) {
    const result = await ensurePrivacy(ctx, ACTIVE_PRIVACY);
    if (!result.allConfirmed) {
        ctx.logger.warn(ctx.phoneNumber, `Privacy activate incomplete: ${result.readFailures} read failure(s), ${result.writeFailures} write failure(s)`);
    }
    ctx.logger.info(ctx.phoneNumber, `Privacy check complete: ${result.updated} rule(s) corrected`);
}
const DEACTIVATE_PRIVACY = [
    { key: new telegram_1.Api.InputPrivacyKeyPhoneCall(), label: 'PhoneCall', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(), label: 'ProfilePhoto', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyForwards(), label: 'Forwards', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(), label: 'PhoneNumber', desired: 'disallow' },
    { key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(), label: 'LastSeen', desired: 'disallow' },
];
async function updatePrivacyforDeletedAccount(ctx) {
    const result = await ensurePrivacy(ctx, DEACTIVATE_PRIVACY);
    if (!result.allConfirmed) {
        const details = result.failureReasons.slice(0, 5).join('; ');
        const msg = `Privacy deactivate incomplete: ${result.readFailures} read failure(s), ${result.writeFailures} write failure(s)${details ? ` — ${details}` : ''}`;
        ctx.logger.warn(ctx.phoneNumber, msg);
        throw new Error(msg);
    }
    ctx.logger.info(ctx.phoneNumber, `Privacy deactivated: ${result.updated} rule(s) hidden`);
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
    for (const [key, value] of Object.entries(settings)) {
        if (value && key in privacyMap) {
            await ctx.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new privacyMap[key](),
                rules: privacyRules[value],
            }));
            ctx.logger.debug(ctx.phoneNumber, `Privacy batch: ${key} → ${value}`);
            await (0, Helpers_1.sleep)(2000 + Math.random() * 3000);
        }
    }
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