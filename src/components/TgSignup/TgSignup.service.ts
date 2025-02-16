import { Injectable, BadRequestException, Logger, InternalServerErrorException, OnModuleDestroy } from "@nestjs/common";
import { Api } from "telegram/tl";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { LogLevel } from "telegram/extensions/Logger";
import { computeCheck } from "telegram/Password";
import { sleep } from "telegram/Helpers";
import { UsersService } from "../users/users.service";
import { TgSignupResponse } from "./dto/tg-signup.dto";
import { fetchWithTimeout, parseError, ppplbot } from "../../utils";
import { CreateUserDto } from "../users/dto/create-user.dto";

interface ITelegramCredentials {
    apiId: number;
    apiHash: string;
}

@Injectable()
export class TgSignupService implements OnModuleDestroy {
    private readonly logger = new Logger(TgSignupService.name);
    private static readonly LOGIN_TIMEOUT = 150000; // 2.5 minutes
    private static readonly SESSION_CLEANUP_INTERVAL = 120000; // 2 minutes
    private static readonly PHONE_PREFIX = "+"; // Prefix for phone numbers
    private readonly cleanupInterval: NodeJS.Timeout;

    // Map to store active client sessions
    private static readonly activeClients = new Map<string, {
        client: TelegramClient;
        phoneCodeHash: string;
        timeoutId: NodeJS.Timeout;
        createdAt: number;
    }>();

    // API credentials pool for load balancing with correct hashes
    private static readonly API_CREDENTIALS: ITelegramCredentials[] = [
        { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
        { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
        { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
        { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
        { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
        { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" }
    ];

    constructor(private readonly usersService: UsersService) {
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), TgSignupService.SESSION_CLEANUP_INTERVAL);
    }

    async onModuleDestroy() {
        clearInterval(this.cleanupInterval);
        // Cleanup all active sessions
        const phones = Array.from(TgSignupService.activeClients.keys());
        await Promise.all(phones.map(phone => this.disconnectClient(phone)));
    }

    private getRandomCredentials(): ITelegramCredentials {
        const index = Math.floor(Math.random() * TgSignupService.API_CREDENTIALS.length);
        return TgSignupService.API_CREDENTIALS[index];
    }

    private async cleanupStaleSessions() {
        for (const [phone, session] of TgSignupService.activeClients) {
            try {
                if (session.client && !session.client.connected) {
                    await this.disconnectClient(phone);
                }
            } catch (error) {
                this.logger.error(`Error cleaning up session for ${phone}: ${error.message}`);
            }
        }
    }

    private validatePhoneNumber(phone: string): string {
        // Remove any existing + prefix
        phone = phone.replace(/^\+/, '');

        // Validate phone number format
        if (!/^\d{10,15}$/.test(phone)) {
            throw new BadRequestException('Invalid phone number format');
        }

        return phone;
    }

    private async disconnectClient(phone: string): Promise<void> {
        const session = TgSignupService.activeClients.get(phone);
        if (session) {
            try {
                clearTimeout(session.timeoutId);
                if (session.client?.connected) {
                    await session.client.disconnect();
                }
                if (session.client) {
                    await session.client.destroy();
                }
            } catch (error) {
                this.logger.warn(`Error disconnecting client for ${phone}: ${error.message}`);
            } finally {
                TgSignupService.activeClients.delete(phone);
            }
        }
    }

    async sendCode(phone: string): Promise<Pick<TgSignupResponse, 'phoneCodeHash' | 'isCodeViaApp'>> {
        try {
            this.logger.debug(`Validating phone number: ${phone}`);
            phone = this.validatePhoneNumber(phone);

            this.logger.debug(`Disconnecting any existing client for: ${phone}`);
            await this.disconnectClient(phone);

            this.logger.debug(`Fetching random credentials for API ID and API Hash`);
            const { apiId, apiHash } = this.getRandomCredentials();
            const session = new StringSession('');
            const client = new TelegramClient(session, apiId, apiHash, {
                connectionRetries: 5,
                retryDelay: 2000,
                useWSS: true,
                timeout: 30000
            });

            this.logger.debug(`Setting log level to ERROR for TelegramClient`);
            await client.setLogLevel(LogLevel.ERROR);

            this.logger.debug(`Connecting to Telegram server`);
            await client.connect();

            this.logger.debug(`Invoking API to send code to: ${phone}`);
            const sendResult = await client.invoke(
                new Api.auth.SendCode({
                    phoneNumber: phone,
                    apiId,
                    apiHash,
                    settings: new Api.CodeSettings({
                        currentNumber: true,
                        allowAppHash: true,
                    }),
                })
            );

            this.logger.debug(`Received send code result for ${phone}: ${JSON.stringify(sendResult)}`);

            if (sendResult instanceof Api.auth.SentCodeSuccess) {
                this.logger.error(`Unexpected immediate login for ${phone}`);
                throw new BadRequestException('Unexpected immediate login');
            }

            this.logger.debug(`Setting up session timeout for ${phone}`);
            const timeoutId = setTimeout(() => this.disconnectClient(phone), TgSignupService.LOGIN_TIMEOUT);

            this.logger.debug(`Storing client session for ${phone}`);
            TgSignupService.activeClients.set(phone, {
                client,
                phoneCodeHash: sendResult.phoneCodeHash,
                timeoutId,
                createdAt: Date.now()
            });

            return {
                phoneCodeHash: sendResult.phoneCodeHash,
                isCodeViaApp: sendResult.type instanceof Api.auth.SentCodeTypeApp,
            };
        } catch (error) {
            this.logger.error(`Failed to send code to ${phone}: ${error.message}`, error.stack);
            await this.disconnectClient(phone);
            throw new BadRequestException(error.message || 'Failed to send verification code');
        }
    }

    async verifyCode(phone: string, code: string, password?: string): Promise<TgSignupResponse> {
        try {
            this.logger.debug(`Validating phone number for verification: ${phone}`);
            phone = this.validatePhoneNumber(phone);

            this.logger.debug(`Fetching active session for ${phone}`);
            const session = TgSignupService.activeClients.get(phone);
            if (!session) {
                this.logger.warn(`No active signup session found for ${phone}`);
                throw new BadRequestException('No active signup session found. Please request a new code.');
            }

            this.logger.debug(`Checking session age for ${phone}`);
            if (Date.now() - session.createdAt > TgSignupService.LOGIN_TIMEOUT) {
                await this.disconnectClient(phone);
                this.logger.warn(`Verification code expired for ${phone}`);
                throw new BadRequestException('Verification code expired. Please request a new code.');
            }

            if (!session.client?.connected) {
                await this.disconnectClient(phone);
                this.logger.warn(`Client connection lost for ${phone}`);
                throw new BadRequestException('Connection lost. Please request a new code.');
            }

            this.logger.debug(`Invoking SignIn API for ${phone}`);
            const { client, phoneCodeHash } = session;

            try {
                this.logger.debug(`Attempting to sign in with code for ${phone}`);
                const signInResult = await client.invoke(
                    new Api.auth.SignIn({
                        phoneNumber: phone,
                        phoneCodeHash,
                        phoneCode: code,
                    })
                ) as Api.auth.Authorization;

                if (!signInResult) {
                    throw new BadRequestException('Invalid response from Telegram server');
                }

                this.logger.debug(`SignIn result for ${phone}: ${JSON.stringify(signInResult)}`);

                if (signInResult instanceof Api.auth.AuthorizationSignUpRequired) {
                    this.logger.log(`New user registration required for ${phone}`);
                    const result = await this.handleNewUserRegistration(phone, client, phoneCodeHash);
                    await this.disconnectClient(phone);
                    return result;
                }

                // Store the session string before processing
                const sessionString = client.session.save() as unknown as string;
                if (!sessionString) {
                    throw new Error('Failed to generate session string');
                }

                this.logger.log(`User login successful for ${phone}`);
                const userData = await this.processLoginResult(signInResult.user, sessionString, password);
                await this.disconnectClient(phone);
                return userData;
            } catch (error) {
                if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
                    this.logger.warn(`2FA required for ${phone}`);
                    if (!password) {
                        return {
                            status: 400,
                            message: 'Two-factor authentication required',
                            requires2FA: true
                        };
                    }
                    return await this.handle2FALogin(phone, session.client, password);
                }

                throw error;
            }
        } catch (error) {
            this.logger.error(`Verification failed for ${phone}: ${error.message}`, error.stack);
            await this.disconnectClient(phone);
            throw new BadRequestException(error.message || 'Verification failed');
        }
    }

    private async handle2FALogin(phone: string, client: TelegramClient, password: string): Promise<TgSignupResponse> {
        try {
            this.logger.debug(`Fetching password SRP parameters for ${phone}`);
            const passwordSrpResult = await client.invoke(new Api.account.GetPassword());

            this.logger.debug(`Computing password check for ${phone}`);
            const passwordCheck = await computeCheck(passwordSrpResult, password);

            this.logger.debug(`Invoking CheckPassword API for ${phone}`);
            const signInResult = await client.invoke(
                new Api.auth.CheckPassword({
                    password: passwordCheck,
                })
            ) as Api.auth.Authorization;

            if (!signInResult || !signInResult.user) {
                throw new BadRequestException('Invalid response from Telegram server');
            }

            this.logger.log(`2FA login successful for ${phone}`);
            const sessionString = client.session.save() as unknown as string;
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }

            const userData = await this.processLoginResult(signInResult.user, sessionString, password);
            await this.disconnectClient(phone);
            return userData;
        } catch (error) {
            this.logger.error(`2FA login failed for ${phone}: ${error.message}`, error.stack);
            if (password) {
                throw new BadRequestException('Incorrect 2FA password');
            }
            throw new BadRequestException('2FA password required');
        }
    }

    private async handleNewUserRegistration(
        phone: string,
        client: TelegramClient,
        phoneCodeHash: string
    ): Promise<TgSignupResponse> {
        try {
            const randomName = `User${Math.random().toString(36).substring(2, 8)}`;
            const signUpResult = await client.invoke(
                new Api.auth.SignUp({
                    phoneNumber: phone,
                    phoneCodeHash,
                    firstName: randomName,
                    lastName: '', // Keep empty for privacy
                })
            ) as Api.auth.Authorization;

            if (!signUpResult || !signUpResult.user) {
                throw new BadRequestException('Invalid response from Telegram server');
            }

            const sessionString = client.session.save() as unknown as string;
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }

            return await this.processLoginResult(signUpResult.user, sessionString);
        } catch (error) {
            const errorDetails = parseError(error);
            this.logger.error(`Failed to register new user: ${errorDetails.message}`);
            throw new BadRequestException(errorDetails.message || 'Failed to register new user');
        }
    }

    private async processLoginResult(user: any, sessionString: string, password?: string): Promise<TgSignupResponse> {
        try {
            if (!user || !sessionString) {
                throw new Error('Invalid user data or session string');
            }

            // Add additional user metadata
            const now = new Date();
            const userData: CreateUserDto = {
                mobile: user.phone?.toString()?.replace(/^\+/, '') || '',
                session: sessionString,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                username: user.username || '',
                tgId: user.id?.toString() || '',
                twoFA: !!password,
                password: password || null,
                lastActive: now.toISOString().split('T')[0],
                expired: false,
                channels: 0,
                personalChats: 0,
                totalChats: 0,
                otherPhotoCount: 0,
                ownPhotoCount: 0,
                ownVideoCount: 0,
                otherVideoCount: 0,
                recentUsers: [],
                calls: {
                    chatCallCounts: [],
                    incoming: 0,
                    outgoing: 0,
                    totalCalls: 0,
                    video: 0,
                },
                contacts: 0,
                movieCount: 0,
                msgs: 0,
                photoCount: 0,
                videoCount: 0,
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
        } catch (error) {
            this.logger.error('Error processing login result:', error);
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to complete registration');
        }
    }
}
