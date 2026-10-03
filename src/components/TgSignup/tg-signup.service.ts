import { Injectable, BadRequestException, InternalServerErrorException, OnModuleDestroy } from "@nestjs/common";
import { Api } from "telegram/tl";
import { TelegramClient } from "telegram";
import { TelegramClientParams } from "telegram/client/telegramBaseClient";
import { StringSession } from "telegram/sessions";
import { LogLevel } from "telegram/extensions/Logger";
import { computeCheck } from "telegram/Password";
import { UsersService } from "../users/users.service";
import { TgSignupResponse } from "./dto/tg-signup.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { parseError } from "../../utils/parseError";
import { generateTGConfig } from "../Telegram/utils/generateTGConfig";
import { Logger } from "../../utils";

type SignupStage = 'code_sent' | 'awaiting_password';

type ActiveSignupSession = {
    client: TelegramClient;
    phoneCodeHash: string;
    timeoutId: NodeJS.Timeout;
    createdAt: number;
    lastActivityAt: number;
    apiId: number;
    apiHash: string;
    tgParams: TelegramClientParams;
    sessionSnapshot: string;
    stage: SignupStage;
    codeType?: SignupCodeType;
    codeLength?: number;
    nextType?: string;
    /** Epoch ms before which Telegram will refuse a resend (from SentCode.timeout). */
    resendAvailableAt?: number;
    passwordHint?: string;
};

export type SignupCodeType =
    | 'app' | 'sms' | 'call' | 'flash_call' | 'missed_call' | 'email'
    | 'sms_word' | 'sms_phrase' | 'fragment_sms' | 'firebase_sms' | 'unknown';

export type SendCodeResult = Pick<TgSignupResponse,
    'phoneCodeHash' | 'isCodeViaApp' | 'codeLength' | 'nextType' | 'resendAfter' | 'message'> & {
    codeType?: SignupCodeType;
};

/** Fields GramJS RPC errors (and FloodWaitError) carry; everything else is read defensively. */
type RpcErrorLike = {
    errorMessage?: unknown;
    seconds?: unknown;
    message?: unknown;
    stack?: unknown;
};

type RejectEntry = { until: number; message: string };

const CODE_TYPE_BY_CLASS: Record<string, SignupCodeType> = {
    SentCodeTypeApp: 'app',
    SentCodeTypeSms: 'sms',
    SentCodeTypeCall: 'call',
    SentCodeTypeFlashCall: 'flash_call',
    SentCodeTypeMissedCall: 'missed_call',
    SentCodeTypeEmailCode: 'email',
    SentCodeTypeSmsWord: 'sms_word',
    SentCodeTypeSmsPhrase: 'sms_phrase',
    SentCodeTypeFragmentSms: 'fragment_sms',
    SentCodeTypeFirebaseSms: 'firebase_sms',
};

const DELIVERY_MESSAGE: Record<SignupCodeType, string> = {
    app: 'Code sent to your Telegram App',
    sms: 'Code sent via SMS',
    call: 'You will receive a phone call with the code',
    flash_call: 'You will receive a call. Enter the last digits of the calling number',
    missed_call: 'You will receive a missed call. Enter the last digits of the calling number',
    email: 'Code sent to your login email',
    sms_word: 'Code word sent via SMS',
    sms_phrase: 'Code phrase sent via SMS',
    fragment_sms: 'Code sent to your Fragment number',
    firebase_sms: 'Code sent via SMS',
    unknown: 'Code sent to your Telegram App',
};

// Production DC addresses (plain TCP, port 80 = GramJS default for node without WSS).
const TELEGRAM_DCS: Record<number, string> = {
    1: '149.154.175.53',
    2: '149.154.167.51',
    3: '149.154.175.100',
    4: '149.154.167.91',
    5: '91.108.56.130',
};

/** Strip a GramJS class name ("auth.SentCodeTypeApp") or a plain constructor name to its bare type. */
function bareTypeName(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const className = (value as { className?: unknown }).className;
    const name = typeof className === 'string' && className ? className : value.constructor?.name || '';
    return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
}

function maskPhone(phone: string): string {
    return phone && phone.length > 4 ? `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
}

/** Telegram RPC error text: FloodWaitError carries "FLOOD" + .seconds; plain errors carry the full code. */
function asRpc(error: unknown): RpcErrorLike {
    return error && typeof error === 'object' ? error as RpcErrorLike : {};
}

function rpcError(error: unknown): string {
    const value = asRpc(error).errorMessage;
    return typeof value === 'string' ? value : '';
}

/** Best human-readable text for logs: RPC code first, then Error.message, then the value itself. */
function errorText(error: unknown): string {
    const message = asRpc(error).message;
    return rpcError(error) || (typeof message === 'string' && message) || String(error);
}

function errorStack(error: unknown): string | undefined {
    const stack = asRpc(error).stack;
    return typeof stack === 'string' ? stack : undefined;
}

function floodSeconds(error: unknown): number | undefined {
    const seconds = asRpc(error).seconds;
    if (typeof seconds === 'number' && seconds > 0) return seconds;
    const message = asRpc(error).message;
    const pattern = /FLOOD_(?:PREMIUM_)?WAIT_(\d+)/;
    const match = pattern.exec(rpcError(error)) || pattern.exec(typeof message === 'string' ? message : '');
    return match ? Number(match[1]) : undefined;
}

function isFlood(error: unknown): boolean {
    const msg = rpcError(error);
    return msg === 'FLOOD' || msg.includes('FLOOD_WAIT') || msg.includes('FLOOD_PREMIUM_WAIT') || floodSeconds(error) !== undefined;
}

function formatWait(seconds: number | undefined): string {
    if (!seconds || seconds <= 300) return 'Please wait a few minutes before trying again';
    if (seconds < 3600) return `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minutes`;
    const hours = Math.ceil(seconds / 3600);
    return `Too many attempts. Please try again in ${hours} hour${hours === 1 ? '' : 's'}`;
}

@Injectable()
export class TgSignupService implements OnModuleDestroy {
    private readonly logger = new Logger(TgSignupService.name);
    private static readonly LOGIN_TIMEOUT = 300000; // 5 minutes
    private static readonly SESSION_CLEANUP_INTERVAL = 300000; // 5 minutes instead of 2
    private static readonly PHONE_PREFIX = "+"; // Prefix for phone numbers
    /** GramJS sleeps inside invoke() on FLOOD_WAIT <= this. Signup must fail fast, not hang the HTTP call. */
    private static readonly FLOOD_SLEEP_THRESHOLD = 3;
    private static readonly REJECT_CACHE_MAX = 5000;
    private static readonly BANNED_CACHE_MS = 6 * 60 * 60 * 1000;
    private static readonly INVALID_CACHE_MS = 60 * 60 * 1000;
    private readonly cleanupInterval: NodeJS.Timeout;

    // Map to store active client sessions
    private static readonly activeClients = new Map<string, ActiveSignupSession>();
    /** Serialises send/verify per phone so a double-tap cannot leak or clobber a session. */
    private static readonly phoneLocks = new Map<string, Promise<unknown>>();
    /** Collapses concurrent send-code calls for the same phone into one Telegram request. */
    private static readonly inflightSends = new Map<string, Promise<SendCodeResult>>();
    /** Short-circuits numbers Telegram already rejected (flood/banned/invalid) without a new connection. */
    private static readonly rejectCache = new Map<string, RejectEntry>();
    /** Learned home DC per dialling prefix, so fresh connects skip the PHONE_MIGRATE round trip. */
    private static readonly homeDcByPrefix = new Map<string, number>();

    constructor(private readonly usersService: UsersService) {
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), TgSignupService.SESSION_CLEANUP_INTERVAL);
        this.cleanupInterval.unref();
    }

    async onModuleDestroy() {
        clearInterval(this.cleanupInterval);
        // Cleanup all active sessions
        const phones = Array.from(TgSignupService.activeClients.keys());
        await Promise.all(phones.map(phone => this.disconnectClient(phone)));
    }

    private async cleanupStaleSessions() {
        for (const [phone, session] of TgSignupService.activeClients) {
            try {
                // Only cleanup if session is truly stale (disconnected and timeout exceeded)
                if (Date.now() - session.lastActivityAt > TgSignupService.LOGIN_TIMEOUT &&
                    (!session.client || !session.client.connected)) {
                    await this.disconnectClient(phone);
                }
            } catch (error: unknown) {
                this.logger.warn(`Error cleaning up session for ${maskPhone(phone)}: ${errorText(error)}`);
            }
        }
        const now = Date.now();
        for (const [phone, entry] of TgSignupService.rejectCache) {
            if (entry.until <= now) TgSignupService.rejectCache.delete(phone);
        }
    }

    private validatePhoneNumber(phone: string): string {
        // Accept "+91 99999-00001", "(91) 9999900001" and "0091..." (international dialling prefix).
        phone = String(phone || '').trim().replace(/[\s().-]/g, '').replace(/^\+/, '').replace(/^00/, '');

        // Validate phone number format
        if (!/^\d{8,15}$/.test(phone)) {
            throw new BadRequestException('Please enter a valid phone number');
        }

        return phone;
    }

    /** Shape check that needs no session: digits, or words for SmsWord/SmsPhrase codes. */
    private normalizeVerificationCode(code: string): string {
        const raw = String(code ?? '').trim();
        const digits = raw.replace(/[\s-]/g, '');
        if (/^\d{4,8}$/.test(digits)) {
            return digits;
        }
        if (/^[\p{L}]+(?:[\s-][\p{L}]+){0,7}$/u.test(raw) && raw.length <= 64) {
            return raw.replace(/\s+/g, ' ');
        }
        throw new BadRequestException('Code must be exactly 5 digits');
    }

    /** Type-aware check once we know what Telegram sent. */
    private validateCodeForSession(code: string, session: ActiveSignupSession): void {
        const isWordCode = session.codeType === 'sms_word' || session.codeType === 'sms_phrase';
        if (isWordCode) return;
        if (!/^\d+$/.test(code)) {
            throw new BadRequestException(`Code must be exactly ${session.codeLength || 5} digits`);
        }
        if (session.codeLength && code.length !== session.codeLength) {
            throw new BadRequestException(`Code must be exactly ${session.codeLength} digits`);
        }
    }

    private refreshSessionTimeout(phone: string, session: ActiveSignupSession): void {
        clearTimeout(session.timeoutId);
        session.timeoutId = this.scheduleExpiry(phone, session);
        session.lastActivityAt = Date.now();
    }

    /** The timer only tears down the session it was created for, never a newer one for the same phone. */
    private scheduleExpiry(phone: string, session: ActiveSignupSession): NodeJS.Timeout {
        const timeoutId = setTimeout(() => {
            if (TgSignupService.activeClients.get(phone) === session) {
                void this.disconnectClient(phone);
            }
        }, TgSignupService.LOGIN_TIMEOUT);
        timeoutId.unref?.();
        return timeoutId;
    }

    private captureSessionSnapshot(session: ActiveSignupSession): void {
        try {
            session.sessionSnapshot = (session.client?.session?.save?.() as unknown as string) || session.sessionSnapshot || '';
        } catch {
            // Best-effort only.
        }
    }

    private async buildTelegramClient(sessionSnapshot: string, apiId: number, apiHash: string, tgParams: TelegramClientParams, phone?: string): Promise<TelegramClient> {
        const stringSession = new StringSession(sessionSnapshot || '');
        // Learned DCs are production IPv4/TCP addresses; only apply them to clients using that transport.
        if (!sessionSnapshot && phone && this.dcRoutingApplies(tgParams)) {
            this.applyLearnedHomeDc(stringSession, phone);
        }
        const client = new TelegramClient(stringSession, apiId, apiHash, {
            ...(tgParams || {}),
            floodSleepThreshold: TgSignupService.FLOOD_SLEEP_THRESHOLD,
        });
        await client.setLogLevel(LogLevel.ERROR);
        return client;
    }

    private dcRoutingApplies(tgParams: TelegramClientParams | undefined): boolean {
        return !tgParams?.testServers && !tgParams?.useIPV6 && !tgParams?.useWSS;
    }

    private dcRoutingEnabled(): boolean {
        return process.env.TG_SIGNUP_DC_ROUTING !== 'false';
    }

    /** Country prefixes are 1-3 digits; 3 digits is specific enough to separate e.g. +91 from +92x. */
    private dcPrefix(phone: string): string {
        return phone.slice(0, 3);
    }

    private applyLearnedHomeDc(stringSession: StringSession, phone: string): void {
        if (!this.dcRoutingEnabled() || typeof stringSession?.setDC !== 'function') return;
        const dcId = TgSignupService.homeDcByPrefix.get(this.dcPrefix(phone));
        const ip = dcId ? TELEGRAM_DCS[dcId] : undefined;
        if (dcId && ip) {
            stringSession.setDC(dcId, ip, 80);
        }
    }

    private learnHomeDc(phone: string, client: TelegramClient): void {
        const dcId = Number(client?.session?.dcId);
        if (!this.dcRoutingEnabled() || !TELEGRAM_DCS[dcId]) return;
        TgSignupService.homeDcByPrefix.set(this.dcPrefix(phone), dcId);
    }

    private async ensureConnectedClient(phone: string, session: ActiveSignupSession): Promise<TelegramClient> {
        if (session.client?.connected) {
            return session.client;
        }

        try {
            await session.client?.connect();
            this.captureSessionSnapshot(session);
            session.lastActivityAt = Date.now();
            return session.client;
        } catch (error: unknown) {
            this.logger.warn(`Connection lost for ${maskPhone(phone)}, rebuilding signup client`);
        }

        this.captureSessionSnapshot(session);
        try {
            await session.client?.destroy();
        } catch {
            // Best-effort cleanup only.
        }

        const rebuiltClient = await this.buildTelegramClient(
            session.sessionSnapshot,
            session.apiId,
            session.apiHash,
            session.tgParams,
        );
        await rebuiltClient.connect();
        session.client = rebuiltClient;
        this.captureSessionSnapshot(session);
        session.lastActivityAt = Date.now();
        return rebuiltClient;
    }

    private codeTypeOf(type: Api.auth.TypeSentCodeType | undefined): SignupCodeType {
        if (!type) return 'unknown';
        if (type instanceof Api.auth.SentCodeTypeApp) return 'app';
        return CODE_TYPE_BY_CLASS[bareTypeName(type)] || 'unknown';
    }

    private mapSentCodeResult(sendResult: Api.auth.SentCode): SendCodeResult {
        if (sendResult instanceof Api.auth.SentCodeSuccess) {
            this.logger.error('Unexpected immediate login during send/resend code');
            throw new BadRequestException('Unexpected immediate login');
        }
        if (bareTypeName(sendResult) === 'SentCodePaymentRequired') {
            throw new BadRequestException('Telegram requires this number to be verified in the official Telegram app first');
        }
        const typeName = bareTypeName(sendResult?.type);
        if (typeName === 'SentCodeTypeSetUpEmailRequired') {
            throw new BadRequestException('Telegram requires a login email for this number. Set it up in the Telegram app and try again');
        }
        if (!sendResult?.phoneCodeHash) {
            throw new Error('SentCode without phoneCodeHash');
        }

        const codeType = this.codeTypeOf(sendResult.type);
        const sentType = sendResult.type;
        const length = sentType && 'length' in sentType ? Number(sentType.length) : NaN;
        const nextTypeName = bareTypeName(sendResult.nextType);
        const resendAfter = Number(sendResult.timeout) > 0 ? Number(sendResult.timeout) : undefined;

        return {
            phoneCodeHash: sendResult.phoneCodeHash,
            isCodeViaApp: sendResult.type instanceof Api.auth.SentCodeTypeApp,
            codeType,
            codeLength: Number.isInteger(length) && length > 0 ? length : undefined,
            nextType: nextTypeName ? nextTypeName.replace(/^CodeType/, '').toLowerCase() : undefined,
            resendAfter,
            message: DELIVERY_MESSAGE[codeType],
        };
    }

    private applySentCode(session: ActiveSignupSession, mapped: SendCodeResult): void {
        session.phoneCodeHash = mapped.phoneCodeHash!;
        session.codeType = mapped.codeType;
        session.codeLength = mapped.codeLength;
        session.nextType = mapped.nextType;
        session.resendAvailableAt = mapped.resendAfter ? Date.now() + mapped.resendAfter * 1000 : undefined;
        session.stage = 'code_sent';
        session.passwordHint = undefined;
    }

    private async disconnectClient(phone: string): Promise<void> {
        const session = TgSignupService.activeClients.get(phone);
        if (session) {
            try {
                clearTimeout(session.timeoutId);
                await session.client.destroy();
                this.logger.log(`Client disconnected for ${maskPhone(phone)}`);
            } catch (error: unknown) {
                this.logger.warn(`Error disconnecting client for ${maskPhone(phone)}: ${errorText(error)}`);
            } finally {
                TgSignupService.activeClients.delete(phone);
            }
        }
    }

    private async withPhoneLock<T>(phone: string, task: () => Promise<T>): Promise<T> {
        const previous = TgSignupService.phoneLocks.get(phone) || Promise.resolve();
        const run = previous.catch(() => undefined).then(task);
        const tail = run.catch(() => undefined);
        TgSignupService.phoneLocks.set(phone, tail);
        try {
            return await run;
        } finally {
            if (TgSignupService.phoneLocks.get(phone) === tail) {
                TgSignupService.phoneLocks.delete(phone);
            }
        }
    }

    private rememberRejection(phone: string, message: string, ttlMs: number): void {
        if (ttlMs <= 0) return;
        if (TgSignupService.rejectCache.size >= TgSignupService.REJECT_CACHE_MAX) {
            const oldest = TgSignupService.rejectCache.keys().next().value;
            if (oldest !== undefined) TgSignupService.rejectCache.delete(oldest);
        }
        TgSignupService.rejectCache.set(phone, { until: Date.now() + ttlMs, message });
    }

    private cachedRejection(phone: string): RejectEntry | undefined {
        const entry = TgSignupService.rejectCache.get(phone);
        if (!entry) return undefined;
        if (entry.until <= Date.now()) {
            TgSignupService.rejectCache.delete(phone);
            return undefined;
        }
        return entry;
    }

    /** Errors that mean "stop now" rather than "try a fresh connection". */
    private isTerminalSendError(error: unknown): boolean {
        const msg = rpcError(error);
        return error instanceof BadRequestException || isFlood(error) ||
            msg.includes('PHONE_NUMBER_BANNED') || msg.includes('PHONE_NUMBER_INVALID') ||
            msg.includes('PHONE_NUMBER_FLOOD');
    }

    private mapSendError(phone: string, error: unknown): BadRequestException {
        if (error instanceof BadRequestException) {
            return error;
        }
        const msg = rpcError(error);
        if (msg.includes('PHONE_NUMBER_BANNED')) {
            const message = 'This phone number has been banned from Telegram';
            this.rememberRejection(phone, message, TgSignupService.BANNED_CACHE_MS);
            return new BadRequestException(message);
        }
        if (msg.includes('PHONE_NUMBER_INVALID')) {
            const message = 'Please enter a valid phone number';
            this.rememberRejection(phone, message, TgSignupService.INVALID_CACHE_MS);
            return new BadRequestException(message);
        }
        if (msg.includes('PHONE_NUMBER_FLOOD')) {
            const message = 'Too many code requests for this number. Please try again in a few hours';
            this.rememberRejection(phone, message, 60 * 60 * 1000);
            return new BadRequestException(message);
        }
        if (isFlood(error)) {
            const seconds = floodSeconds(error);
            const message = formatWait(seconds);
            this.rememberRejection(phone, message, (seconds || 0) * 1000);
            return new BadRequestException(message);
        }
        if (msg.includes('SEND_CODE_UNAVAILABLE')) {
            return new BadRequestException('No more ways to resend the code. Please wait for it or try again later');
        }
        if (msg.includes('PHONE_NUMBER_OCCUPIED') || msg.includes('API_ID_INVALID') || msg.includes('API_ID_PUBLISHED_FLOOD')) {
            this.logger.error(`Signup app credentials rejected by Telegram: ${msg}`);
        }
        return new BadRequestException('Unable to send OTP. Please try again');
    }

    async sendCode(phone: string): Promise<SendCodeResult> {
        let normalized: string;
        try {
            normalized = this.validatePhoneNumber(phone);
        } catch (error: unknown) {
            this.logger.warn(`Rejected send-code for malformed phone`);
            throw error;
        }

        const inflight = TgSignupService.inflightSends.get(normalized);
        if (inflight) {
            this.logger.debug(`Joining in-flight send-code for ${maskPhone(normalized)}`);
            return inflight;
        }

        const pending = this.withPhoneLock(normalized, () => this.sendCodeLocked(normalized));
        TgSignupService.inflightSends.set(normalized, pending);
        try {
            return await pending;
        } finally {
            if (TgSignupService.inflightSends.get(normalized) === pending) {
                TgSignupService.inflightSends.delete(normalized);
            }
        }
    }

    private async sendCodeLocked(phone: string): Promise<SendCodeResult> {
        const startedAt = Date.now();
        const timings: Record<string, number> = {};
        const mark = (step: string, from: number) => { timings[step] = Date.now() - from; };
        let path = 'fresh';
        // A flood on resend does not invalidate the code already delivered; keep that session usable.
        let keepExistingSession = false;

        try {
            const rejected = this.cachedRejection(phone);
            if (rejected) {
                path = 'cached_reject';
                throw new BadRequestException(rejected.message);
            }

            const existingSession = TgSignupService.activeClients.get(phone);
            if (existingSession && existingSession.stage === 'code_sent') {
                // Telegram told us when a resend becomes possible; until then the code already sent is still the one to use.
                if (existingSession.resendAvailableAt && existingSession.resendAvailableAt > Date.now()) {
                    path = 'cooldown';
                    this.refreshSessionTimeout(phone, existingSession);
                    return {
                        phoneCodeHash: existingSession.phoneCodeHash,
                        isCodeViaApp: existingSession.codeType === 'app',
                        codeType: existingSession.codeType,
                        codeLength: existingSession.codeLength,
                        nextType: existingSession.nextType,
                        resendAfter: Math.ceil((existingSession.resendAvailableAt - Date.now()) / 1000),
                        message: `Code already sent. ${DELIVERY_MESSAGE[existingSession.codeType || 'unknown']}`,
                    };
                }

                this.refreshSessionTimeout(phone, existingSession);
                try {
                    const t = Date.now();
                    const client = await this.ensureConnectedClient(phone, existingSession);
                    mark('connect', t);
                    const t2 = Date.now();
                    let sentCode: Api.auth.SentCode;
                    if (existingSession.nextType || existingSession.codeType === undefined || existingSession.codeType === 'unknown') {
                        path = 'resend';
                        sentCode = await client.invoke(
                            new Api.auth.ResendCode({
                                phoneNumber: phone,
                                phoneCodeHash: existingSession.phoneCodeHash,
                            })
                        ) as Api.auth.SentCode;
                    } else {
                        // No alternative delivery channel: ResendCode would fail with SEND_CODE_UNAVAILABLE,
                        // so re-request on the already-connected client instead of rebuilding config + connection.
                        path = 'resend_same_client';
                        sentCode = await this.invokeSendCode(client, phone, existingSession.apiId, existingSession.apiHash);
                    }
                    mark('sendCode', t2);

                    const mapped = this.mapSentCodeResult(sentCode);
                    this.applySentCode(existingSession, mapped);
                    this.captureSessionSnapshot(existingSession);
                    return mapped;
                } catch (error: unknown) {
                    if (this.isTerminalSendError(error)) {
                        keepExistingSession = isFlood(error) || rpcError(error).includes('PHONE_NUMBER_FLOOD');
                        throw error;
                    }
                    this.logger.warn(`Resend failed for ${maskPhone(phone)} (${errorText(error)}); falling back to a fresh sendCode`);
                    path = 'resend_failed_fresh';
                }
            }
            await this.disconnectClient(phone);

            let t = Date.now();
            const { apiId, apiHash, params: tgParams } = await generateTGConfig(phone);
            mark('config', t);

            const client = await this.buildTelegramClient('', apiId, apiHash, tgParams, phone);

            const activeSession: ActiveSignupSession = {
                client,
                phoneCodeHash: '',
                timeoutId: undefined as unknown as NodeJS.Timeout,
                createdAt: Date.now(),
                lastActivityAt: Date.now(),
                apiId,
                apiHash,
                tgParams,
                sessionSnapshot: '',
                stage: 'code_sent',
            };

            let mapped: SendCodeResult;
            try {
                t = Date.now();
                await client.connect();
                mark('connect', t);
                t = Date.now();
                const sentCode = await this.invokeSendCode(client, phone, apiId, apiHash);
                mark('sendCode', t);
                mapped = this.mapSentCodeResult(sentCode);
                mapped = await this.upgradeUnusableDelivery(phone, client, mapped);
            } catch (error: unknown) {
                await client.destroy().catch(() => undefined);
                throw error;
            }

            this.applySentCode(activeSession, mapped);
            activeSession.sessionSnapshot = (client.session.save() as unknown as string) || '';
            activeSession.timeoutId = this.scheduleExpiry(phone, activeSession);
            TgSignupService.activeClients.set(phone, activeSession);
            if (this.dcRoutingApplies(tgParams)) {
                this.learnHomeDc(phone, client);
            }

            return mapped;
        } catch (error: unknown) {
            if (!(error instanceof BadRequestException) || path !== 'cached_reject') {
                this.logger.error(`Failed to send code to ${maskPhone(phone)}: ${errorText(error)}`, errorStack(error));
            }
            if (!keepExistingSession) {
                await this.disconnectClient(phone);
            }
            throw this.mapSendError(phone, error);
        } finally {
            const session = TgSignupService.activeClients.get(phone);
            this.logger.log(
                `[SEND_CODE] ${maskPhone(phone)} path=${path} total=${Date.now() - startedAt}ms ` +
                Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(' ') +
                (session ? ` dc=${session.client?.session?.dcId ?? '?'} type=${session.codeType} next=${session.nextType ?? '-'}` : ''),
            );
        }
    }

    private async invokeSendCode(client: TelegramClient, phone: string, apiId: number, apiHash: string): Promise<Api.auth.SentCode> {
        return await client.invoke(
            new Api.auth.SendCode({
                phoneNumber: phone,
                apiId,
                apiHash,
                settings: new Api.CodeSettings({
                    currentNumber: true,
                    allowAppHash: true,
                }),
            })
        ) as Api.auth.SentCode;
    }

    /**
     * Firebase SMS needs a Play Integrity / SafetyNet token we cannot produce, so the user would never
     * get a code. When Telegram offers another channel, switch to it immediately.
     */
    private async upgradeUnusableDelivery(phone: string, client: TelegramClient, mapped: SendCodeResult): Promise<SendCodeResult> {
        if (mapped.codeType !== 'firebase_sms' || !mapped.nextType) {
            return mapped;
        }
        try {
            const resent = await client.invoke(
                new Api.auth.ResendCode({ phoneNumber: phone, phoneCodeHash: mapped.phoneCodeHash! })
            ) as Api.auth.SentCode;
            this.logger.log(`Switched ${maskPhone(phone)} away from firebase_sms delivery`);
            return this.mapSentCodeResult(resent);
        } catch (error: unknown) {
            this.logger.warn(`Could not switch ${maskPhone(phone)} away from firebase_sms: ${errorText(error)}`);
            return mapped;
        }
    }

    async verifyCode(phone: string, code: string, password?: string): Promise<TgSignupResponse> {
        phone = this.validatePhoneNumber(phone);
        return this.withPhoneLock(phone, () => this.verifyCodeLocked(phone, code, password));
    }

    private async verifyCodeLocked(phone: string, code: string, password?: string): Promise<TgSignupResponse> {
        const startedAt = Date.now();
        let outcome = 'error';
        try {
            const session = TgSignupService.activeClients.get(phone);
            const awaitingPassword = session?.stage === 'awaiting_password';
            // On the password step the code was already accepted; the frontend re-posts it but we don't need it.
            if (!awaitingPassword) {
                code = this.normalizeVerificationCode(code);
            }

            if (!session) {
                this.logger.warn(`No active signup session found for ${maskPhone(phone)}`);
                throw new BadRequestException('Session Expired. Please start again');
            }

            this.refreshSessionTimeout(phone, session);
            const client = await this.ensureConnectedClient(phone, session);

            if (awaitingPassword) {
                if (!password) {
                    outcome = 'needs_2fa';
                    return this.twoFactorRequired(session);
                }
                const result = await this.handle2FALogin(phone, client, password);
                outcome = '2fa_ok';
                return result;
            }

            this.validateCodeForSession(code, session);
            const { phoneCodeHash } = session;

            try {
                this.logger.debug(`Attempting to sign in with code for ${maskPhone(phone)}`);
                const signInResult = await client.invoke(
                    new Api.auth.SignIn({
                        phoneNumber: phone,
                        phoneCodeHash,
                        phoneCode: code,
                    })
                ) as Api.auth.TypeAuthorization;

                if (!signInResult) {
                    throw new BadRequestException('Invalid response from Telegram server');
                }

                if (signInResult instanceof Api.auth.AuthorizationSignUpRequired) {
                    this.logger.log(`New user registration required for ${maskPhone(phone)}`);
                    const result = await this.handleNewUserRegistration(phone, client, phoneCodeHash, signInResult.termsOfService);
                    await this.disconnectClient(phone);
                    outcome = 'signup_ok';
                    return result;
                }

                // Store the session string before processing
                const sessionString = client.session.save() as unknown as string;
                if (!sessionString) {
                    throw new Error('Failed to generate session string');
                }
                session.sessionSnapshot = sessionString;

                const userData = await this.processLoginResult(signInResult.user, sessionString, password);
                await this.disconnectClient(phone);
                outcome = 'login_ok';
                return userData;
            } catch (error: unknown) {
                const msg = rpcError(error);
                if (msg === 'SESSION_PASSWORD_NEEDED') {
                    this.logger.warn(`2FA required for ${maskPhone(phone)}`);
                    session.stage = 'awaiting_password';
                    const srp = await this.fetchPasswordParams(phone, client);
                    session.passwordHint = srp?.hint || undefined;
                    if (!password) {
                        outcome = 'needs_2fa';
                        return this.twoFactorRequired(session);
                    }
                    const result = await this.handle2FALogin(phone, client, password, srp);
                    outcome = '2fa_ok';
                    return result;
                }
                if (msg.includes('PHONE_NUMBER_UNOCCUPIED')) {
                    const result = await this.handleNewUserRegistration(phone, client, phoneCodeHash);
                    await this.disconnectClient(phone);
                    outcome = 'signup_ok';
                    return result;
                }
                if (msg.includes('PHONE_CODE_INVALID')) {
                    outcome = 'invalid_code';
                    throw new BadRequestException('Invalid OTP,  Try again!');
                }
                if (msg.includes('PHONE_CODE_EXPIRED') || msg.includes('PHONE_CODE_EMPTY') ||
                    msg.includes('PHONE_CODE_HASH_EMPTY') || msg.includes('AUTH_RESTART')) {
                    outcome = 'expired';
                    await this.disconnectClient(phone);
                    // "Session expired" is what the payment frontend matches to return to the phone step.
                    throw new BadRequestException('OTP expired. Session expired, please request a new code');
                }
                if (msg.includes('PHONE_NUMBER_BANNED')) {
                    await this.disconnectClient(phone);
                    throw new BadRequestException('This phone number has been banned from Telegram');
                }
                if (isFlood(error)) {
                    throw new BadRequestException(formatWait(floodSeconds(error)));
                }

                this.logger.warn(`Verification attempt failed for ${maskPhone(phone)}: ${errorText(error)}`);
                throw new BadRequestException('Verification failed. Please try again.');
            }
        } catch (error: unknown) {
            this.logger.error(`Verification error for ${maskPhone(phone)}: ${errorText(error)}`);

            const message = errorText(error);
            if (message.includes('No active signup session') ||
                message.includes('Connection failed')) {
                await this.disconnectClient(phone);
            }

            throw error instanceof BadRequestException ? error :
                new BadRequestException(
                    (typeof asRpc(error).message === 'string' && asRpc(error).message as string) || 'Verification failed, please try again');
        } finally {
            this.logger.log(`[VERIFY] ${maskPhone(phone)} outcome=${outcome} total=${Date.now() - startedAt}ms`);
        }
    }

    private twoFactorRequired(session: ActiveSignupSession): TgSignupResponse {
        return {
            status: 400,
            message: 'Two-factor authentication required',
            requires2FA: true,
            passwordHint: session.passwordHint,
        };
    }

    private async fetchPasswordParams(phone: string, client: TelegramClient): Promise<Api.account.Password | undefined> {
        try {
            return await client.invoke(new Api.account.GetPassword()) as Api.account.Password;
        } catch (error: unknown) {
            this.logger.warn(`GetPassword failed for ${maskPhone(phone)}: ${errorText(error)}`);
            return undefined;
        }
    }

    private async handle2FALogin(
        phone: string,
        client: TelegramClient,
        password: string,
        prefetchedSrp?: Api.account.Password,
    ): Promise<TgSignupResponse> {
        // The password-check phase (GetPassword + computeCheck + CheckPassword) is the only part
        // that indicates a wrong 2FA password. Anything after a successful CheckPassword (session
        // capture, persistence) is a downstream failure and must surface its real error rather than
        // being mislabelled as an incorrect password.
        let signInResult: Api.auth.Authorization;
        try {
            let srp = prefetchedSrp;
            for (let attempt = 0; ; attempt++) {
                if (!srp) {
                    this.logger.debug(`Fetching password SRP parameters for ${maskPhone(phone)}`);
                    srp = await client.invoke(new Api.account.GetPassword()) as Api.account.Password;
                }
                try {
                    this.logger.debug(`Computing password check for ${maskPhone(phone)}`);
                    const passwordCheck = await computeCheck(srp, password);

                    this.logger.debug(`Invoking CheckPassword API for ${maskPhone(phone)}`);
                    signInResult = await client.invoke(
                        new Api.auth.CheckPassword({
                            password: passwordCheck,
                        })
                    ) as Api.auth.Authorization;
                    break;
                } catch (error: unknown) {
                    // SRP params are single-use; a stale srp_id needs fresh params, not a different password.
                    if (attempt === 0 && rpcError(error).includes('SRP_ID_INVALID')) {
                        srp = undefined;
                        continue;
                    }
                    throw error;
                }
            }

            if (!signInResult || !signInResult.user) {
                throw new BadRequestException('Invalid response from Telegram server');
            }
        } catch (error: unknown) {
            const msg = rpcError(error);
            this.logger.error(`2FA password check failed for ${maskPhone(phone)}: ${errorText(error)}`, errorStack(error));
            if (msg.includes('PHONE_PASSWORD_FLOOD') || isFlood(error)) {
                throw new BadRequestException(msg.includes('PHONE_PASSWORD_FLOOD')
                    ? 'Too many password attempts. Please try again later'
                    : formatWait(floodSeconds(error)));
            }
            if (msg.includes('PASSWORD_HASH_INVALID')) {
                const session = TgSignupService.activeClients.get(phone);
                const hint = session?.passwordHint ? ` (hint: ${session.passwordHint})` : '';
                throw new BadRequestException(`Incorrect 2FA password${hint}`);
            }
            if (password) {
                throw new BadRequestException('Incorrect 2FA password');
            }
            throw new BadRequestException('2FA password required');
        }

        // Password was accepted by Telegram. From here on, errors are downstream failures
        // (session capture / persistence) and propagate with their real cause.
        this.logger.log(`2FA login successful for ${maskPhone(phone)}`);
        const sessionString = client.session.save() as unknown as string;
        if (!sessionString) {
            throw new Error('Failed to generate session string');
        }

        const userData = await this.processLoginResult(signInResult.user, sessionString, password);
        await this.disconnectClient(phone);
        return userData;
    }

    private async handleNewUserRegistration(
        phone: string,
        client: TelegramClient,
        phoneCodeHash: string,
        termsOfService?: Api.help.TypeTermsOfService,
    ): Promise<TgSignupResponse> {
        try {
            let signUpResult: Api.auth.Authorization;
            try {
                signUpResult = await this.invokeSignUp(client, phone, phoneCodeHash, `User${Math.random().toString(36).substring(2, 8)}`);
            } catch (error: unknown) {
                if (!rpcError(error).includes('FIRSTNAME_INVALID')) throw error;
                signUpResult = await this.invokeSignUp(client, phone, phoneCodeHash, 'User');
            }

            if (!signUpResult || !signUpResult.user) {
                throw new BadRequestException('Invalid response from Telegram server');
            }

            await this.acceptTermsOfService(phone, client, termsOfService);

            const sessionString = client.session.save() as unknown as string;
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }

            return await this.processLoginResult(signUpResult.user, sessionString);
        } catch (error: unknown) {
            const errorDetails = parseError(error, "TGSIGNUP", false);
            this.logger.error(`Failed to register new user: ${errorDetails.message}`);
            throw new BadRequestException(errorDetails.message || 'Failed to register new user');
        }
    }

    private async invokeSignUp(client: TelegramClient, phone: string, phoneCodeHash: string, firstName: string): Promise<Api.auth.Authorization> {
        return await client.invoke(
            new Api.auth.SignUp({
                phoneNumber: phone,
                phoneCodeHash,
                firstName,
                lastName: '', // Keep empty for privacy
            })
        ) as Api.auth.Authorization;
    }

    /** Official clients accept the ToS after sign-up; skipping it is a fingerprint signal. Best-effort. */
    private async acceptTermsOfService(phone: string, client: TelegramClient, termsOfService?: Api.help.TypeTermsOfService): Promise<void> {
        // Guarded: test doubles of Api do not always carry the help namespace.
        const AcceptTermsOfService = Api.help?.AcceptTermsOfService;
        if (!termsOfService?.id || !AcceptTermsOfService) return;
        try {
            await client.invoke(new AcceptTermsOfService({ id: termsOfService.id }));
        } catch (error: unknown) {
            this.logger.warn(`AcceptTermsOfService failed for ${maskPhone(phone)}: ${errorText(error)}`);
        }
    }

    private async processLoginResult(user: Api.TypeUser, sessionString: string, password?: string): Promise<TgSignupResponse> {
        try {
            if (!user || !sessionString) {
                throw new Error('Invalid user data or session string');
            }

            // UserEmpty carries only an id; the mobile/tgId guard below rejects it.
            const tgUser = user as Partial<Api.User>;
            // Add additional user metadata
            const now = new Date();
            const userData: CreateUserDto = {
                mobile: tgUser.phone?.toString()?.replace(/^\+/, '') || '',
                session: sessionString,
                firstName: tgUser.firstName || '',
                lastName: tgUser.lastName || '',
                username: tgUser.username || '',
                tgId: tgUser.id?.toString() || '',
                twoFA: !!password,
                password: password || null,
                expired: false,
                channels: 0,
                personalChats: 0,
                totalChats: 0,
                contacts: 0,
                msgs: 0,
                photoCount: 0,
                videoCount: 0,
                movieCount: 0,
                ownPhotoCount: 0,
                otherPhotoCount: 0,
                ownVideoCount: 0,
                otherVideoCount: 0,
                lastActive: now.toISOString().split('T')[0],
                calls: {
                    totalCalls: 0,
                    outgoing: 0,
                    incoming: 0,
                    video: 0,
                    audio: 0,
                },
                gender: 'unknown',
            };

            // Validate required fields
            if (!userData.mobile || !userData.tgId) {
                throw new Error('Invalid user data received from Telegram');
            }

            await this.usersService.create(userData);
            return {
                status: 200,
                message: 'Registration successful',
                session: sessionString,
            };
        } catch (error: unknown) {
            this.logger.error('Error processing login result:', error);
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to complete registration');
        }
    }
}
