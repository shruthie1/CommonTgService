"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.set2fa = set2fa;
exports.updatePrivacyBatch = updatePrivacyBatch;
exports.updatePrivacy = updatePrivacy;
exports.getSessionInfo = getSessionInfo;
exports.terminateSession = terminateSession;
exports.deleteProfilePhotos = deleteProfilePhotos;
exports.createNewSession = createNewSession;
exports.waitForOtp = waitForOtp;
exports.updateProfile = updateProfile;
exports.updateUsername = updateUsername;
const telegram_1 = require("telegram");
const big_integer_1 = __importDefault(require("big-integer"));
async function set2fa(client) {
    console.log('2FA setup not implemented in this utility');
    throw new Error('2FA setup not implemented');
}
async function updatePrivacyBatch(client, settings) {
    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
        const privacyRule = getPrivacyRule(value);
        let inputPrivacyKey;
        switch (key) {
            case 'phoneNumber':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyPhoneNumber();
                break;
            case 'lastSeen':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyStatusTimestamp();
                break;
            case 'profilePhotos':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyProfilePhoto();
                break;
            case 'forwards':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyForwards();
                break;
            case 'calls':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyPhoneCall();
                break;
            case 'groups':
                inputPrivacyKey = new telegram_1.Api.InputPrivacyKeyChatInvite();
                break;
            default:
                continue;
        }
        updates.push(client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: inputPrivacyKey,
            rules: [privacyRule]
        })));
    }
    await Promise.all(updates);
    return true;
}
async function updatePrivacy(client) {
    try {
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
            rules: [
                new telegram_1.Api.InputPrivacyValueDisallowAll()
            ],
        }));
        console.log("Calls Updated");
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
            rules: [
                new telegram_1.Api.InputPrivacyValueAllowAll()
            ],
        }));
        console.log("PP Updated");
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyForwards(),
            rules: [
                new telegram_1.Api.InputPrivacyValueAllowAll()
            ],
        }));
        console.log("forwards Updated");
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
            rules: [
                new telegram_1.Api.InputPrivacyValueDisallowAll()
            ],
        }));
        console.log("Number Updated");
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
            rules: [
                new telegram_1.Api.InputPrivacyValueAllowAll(),
            ],
        }));
        console.log("LastSeen Updated");
        await client.invoke(new telegram_1.Api.account.SetPrivacy({
            key: new telegram_1.Api.InputPrivacyKeyAbout(),
            rules: [
                new telegram_1.Api.InputPrivacyValueAllowAll()
            ],
        }));
        console.log("About Updated");
    }
    catch (e) {
        throw e;
    }
}
async function getSessionInfo(client) {
    const [authorizationsResult, devicesResult] = await Promise.all([
        client.invoke(new telegram_1.Api.account.GetAuthorizations()),
        client.invoke(new telegram_1.Api.account.GetWebAuthorizations())
    ]);
    const sessions = authorizationsResult.authorizations.map((auth) => ({
        hash: auth.hash.toString(),
        deviceModel: auth.deviceModel,
        platform: auth.platform,
        systemVersion: auth.systemVersion,
        appName: auth.appName,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        country: auth.country,
        region: auth.region
    }));
    const webSessions = devicesResult.authorizations.map((auth) => ({
        hash: auth.hash.toString(),
        domain: auth.domain,
        browser: auth.browser,
        platform: auth.platform,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        region: auth.region
    }));
    return {
        sessions,
        webSessions
    };
}
async function terminateSession(client, options) {
    if (options.exceptCurrent) {
        if (options.type === 'app') {
            await client.invoke(new telegram_1.Api.auth.ResetAuthorizations());
        }
        else {
            await client.invoke(new telegram_1.Api.account.ResetWebAuthorizations());
        }
    }
    else {
        if (options.type === 'app') {
            await client.invoke(new telegram_1.Api.account.ResetAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
        else {
            await client.invoke(new telegram_1.Api.account.ResetWebAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
    }
    return true;
}
async function deleteProfilePhotos(client) {
    const photos = await client.invoke(new telegram_1.Api.photos.GetUserPhotos({
        userId: new telegram_1.Api.InputUserSelf(),
        offset: 0,
        maxId: (0, big_integer_1.default)(0),
        limit: 100
    }));
    if ('photos' in photos && photos.photos.length > 0) {
        const photoIds = photos.photos.map((photo) => new telegram_1.Api.InputPhoto({
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference
        }));
        await client.invoke(new telegram_1.Api.photos.DeletePhotos({
            id: photoIds
        }));
        console.log(`Deleted ${photoIds.length} profile photos`);
    }
}
async function createNewSession(client) {
    const sessionString = client.session.save();
    return sessionString || '';
}
async function waitForOtp(client) {
    throw new Error('OTP waiting functionality not implemented');
}
async function updateProfile(client, firstName, about) {
    const data = {
        lastName: "",
    };
    if (firstName !== undefined) {
        data["firstName"] = firstName;
    }
    if (about !== undefined) {
        data["about"] = about;
    }
    try {
        const result = await client.invoke(new telegram_1.Api.account.UpdateProfile(data));
        console.log("Updated Name: ", firstName);
    }
    catch (error) {
        throw error;
    }
}
async function updateUsername(client, baseUsername, sleep) {
    let newUserName = '';
    let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
    let increment = 0;
    if (username === '') {
        try {
            await client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
            console.log(`Removed Username successfully.`);
        }
        catch (error) {
            console.log(error);
        }
    }
    else {
        while (increment < 10) {
            try {
                const result = await client.invoke(new telegram_1.Api.account.CheckUsername({ username }));
                console.log(result, " - ", username);
                if (result) {
                    await client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                    console.log(`Username '${username}' updated successfully.`);
                    newUserName = username;
                    break;
                }
                else {
                    if (increment >= 6) {
                        const randomChars = Math.random().toString(36).substring(2, 6);
                        username = baseUsername + randomChars;
                    }
                    else {
                        username = baseUsername + increment;
                    }
                    increment++;
                    await sleep(2000);
                }
            }
            catch (error) {
                console.log(error.message);
                if (error.errorMessage === 'USERNAME_NOT_MODIFIED') {
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
                await sleep(2000);
            }
        }
    }
    return newUserName;
}
function getPrivacyRule(value) {
    switch (value) {
        case 'everybody':
            return new telegram_1.Api.InputPrivacyValueAllowAll();
        case 'contacts':
            return new telegram_1.Api.InputPrivacyValueAllowContacts();
        case 'nobody':
            return new telegram_1.Api.InputPrivacyValueDisallowAll();
        default:
            return new telegram_1.Api.InputPrivacyValueAllowContacts();
    }
}
//# sourceMappingURL=privacy-session.js.map