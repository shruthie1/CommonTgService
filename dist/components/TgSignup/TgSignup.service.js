"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TgSignupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TgSignupService = void 0;
const common_1 = require("@nestjs/common");
const tl_1 = require("telegram/tl");
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const Logger_1 = require("telegram/extensions/Logger");
const Password_1 = require("telegram/Password");
const users_service_1 = require("../users/users.service");
const utils_1 = require("../../utils");
let TgSignupService = TgSignupService_1 = class TgSignupService {
    constructor(usersService) {
        this.usersService = usersService;
        this.logger = new common_1.Logger(TgSignupService_1.name);
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), TgSignupService_1.SESSION_CLEANUP_INTERVAL);
    }
    async onModuleDestroy() {
        clearInterval(this.cleanupInterval);
        const phones = Array.from(TgSignupService_1.activeClients.keys());
        await Promise.all(phones.map(phone => this.disconnectClient(phone)));
    }
    getRandomCredentials() {
        const index = Math.floor(Math.random() * TgSignupService_1.API_CREDENTIALS.length);
        return TgSignupService_1.API_CREDENTIALS[index];
    }
    async cleanupStaleSessions() {
        for (const [phone, session] of TgSignupService_1.activeClients) {
            try {
                if (session.client && !session.client.connected) {
                    await this.disconnectClient(phone);
                }
            }
            catch (error) {
                this.logger.error(`Error cleaning up session for ${phone}: ${error.message}`);
            }
        }
    }
    validatePhoneNumber(phone) {
        phone = phone.replace(/^\+/, '');
        if (!/^\d{10,15}$/.test(phone)) {
            throw new common_1.BadRequestException('Invalid phone number format');
        }
        return phone;
    }
    async disconnectClient(phone) {
        const session = TgSignupService_1.activeClients.get(phone);
        if (session) {
            try {
                clearTimeout(session.timeoutId);
                if (session.client?.connected) {
                    await session.client.disconnect();
                }
                if (session.client) {
                    await session.client.destroy();
                }
            }
            catch (error) {
                this.logger.warn(`Error disconnecting client for ${phone}: ${error.message}`);
            }
            finally {
                TgSignupService_1.activeClients.delete(phone);
            }
        }
    }
    async sendCode(phone) {
        try {
            this.logger.debug(`Validating phone number: ${phone}`);
            phone = this.validatePhoneNumber(phone);
            this.logger.debug(`Disconnecting any existing client for: ${phone}`);
            await this.disconnectClient(phone);
            this.logger.debug(`Fetching random credentials for API ID and API Hash`);
            const { apiId, apiHash } = this.getRandomCredentials();
            const session = new sessions_1.StringSession('');
            const client = new telegram_1.TelegramClient(session, apiId, apiHash, {
                connectionRetries: 5,
                retryDelay: 2000,
                useWSS: true,
                timeout: 30000
            });
            this.logger.debug(`Setting log level to ERROR for TelegramClient`);
            await client.setLogLevel(Logger_1.LogLevel.ERROR);
            this.logger.debug(`Connecting to Telegram server`);
            await client.connect();
            this.logger.debug(`Invoking API to send code to: ${phone}`);
            const sendResult = await client.invoke(new tl_1.Api.auth.SendCode({
                phoneNumber: phone,
                apiId,
                apiHash,
                settings: new tl_1.Api.CodeSettings({
                    currentNumber: true,
                    allowAppHash: true,
                }),
            }));
            this.logger.debug(`Received send code result for ${phone}: ${JSON.stringify(sendResult)}`);
            if (sendResult instanceof tl_1.Api.auth.SentCodeSuccess) {
                this.logger.error(`Unexpected immediate login for ${phone}`);
                throw new common_1.BadRequestException('Unexpected immediate login');
            }
            this.logger.debug(`Setting up session timeout for ${phone}`);
            const timeoutId = setTimeout(() => this.disconnectClient(phone), TgSignupService_1.LOGIN_TIMEOUT);
            this.logger.debug(`Storing client session for ${phone}`);
            TgSignupService_1.activeClients.set(phone, {
                client,
                phoneCodeHash: sendResult.phoneCodeHash,
                timeoutId,
                createdAt: Date.now()
            });
            return {
                phoneCodeHash: sendResult.phoneCodeHash,
                isCodeViaApp: sendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
            };
        }
        catch (error) {
            this.logger.error(`Failed to send code to ${phone}: ${error.message}`, error.stack);
            await this.disconnectClient(phone);
            throw new common_1.BadRequestException(error.message || 'Failed to send verification code');
        }
    }
    async verifyCode(phone, code, password) {
        try {
            this.logger.debug(`Validating phone number for verification: ${phone}`);
            phone = this.validatePhoneNumber(phone);
            this.logger.debug(`Fetching active session for ${phone}`);
            const session = TgSignupService_1.activeClients.get(phone);
            if (!session) {
                this.logger.warn(`No active signup session found for ${phone}`);
                throw new common_1.BadRequestException('No active signup session found. Please request a new code.');
            }
            this.logger.debug(`Checking session age for ${phone}`);
            if (Date.now() - session.createdAt > TgSignupService_1.LOGIN_TIMEOUT) {
                await this.disconnectClient(phone);
                this.logger.warn(`Verification code expired for ${phone}`);
                throw new common_1.BadRequestException('Verification code expired. Please request a new code.');
            }
            if (!session.client?.connected) {
                await this.disconnectClient(phone);
                this.logger.warn(`Client connection lost for ${phone}`);
                throw new common_1.BadRequestException('Connection lost. Please request a new code.');
            }
            this.logger.debug(`Invoking SignIn API for ${phone}`);
            const { client, phoneCodeHash } = session;
            try {
                this.logger.debug(`Attempting to sign in with code for ${phone}`);
                const signInResult = await client.invoke(new tl_1.Api.auth.SignIn({
                    phoneNumber: phone,
                    phoneCodeHash,
                    phoneCode: code,
                }));
                if (!signInResult) {
                    throw new common_1.BadRequestException('Invalid response from Telegram server');
                }
                this.logger.debug(`SignIn result for ${phone}: ${JSON.stringify(signInResult)}`);
                if (signInResult instanceof tl_1.Api.auth.AuthorizationSignUpRequired) {
                    this.logger.log(`New user registration required for ${phone}`);
                    const result = await this.handleNewUserRegistration(phone, client, phoneCodeHash);
                    await this.disconnectClient(phone);
                    return result;
                }
                const sessionString = client.session.save();
                if (!sessionString) {
                    throw new Error('Failed to generate session string');
                }
                this.logger.log(`User login successful for ${phone}`);
                const userData = await this.processLoginResult(signInResult.user, sessionString, password);
                await this.disconnectClient(phone);
                return userData;
            }
            catch (error) {
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
        }
        catch (error) {
            this.logger.error(`Verification failed for ${phone}: ${error.message}`, error.stack);
            await this.disconnectClient(phone);
            throw new common_1.BadRequestException(error.message || 'Verification failed');
        }
    }
    async handle2FALogin(phone, client, password) {
        try {
            this.logger.debug(`Fetching password SRP parameters for ${phone}`);
            const passwordSrpResult = await client.invoke(new tl_1.Api.account.GetPassword());
            this.logger.debug(`Computing password check for ${phone}`);
            const passwordCheck = await (0, Password_1.computeCheck)(passwordSrpResult, password);
            this.logger.debug(`Invoking CheckPassword API for ${phone}`);
            const signInResult = await client.invoke(new tl_1.Api.auth.CheckPassword({
                password: passwordCheck,
            }));
            if (!signInResult || !signInResult.user) {
                throw new common_1.BadRequestException('Invalid response from Telegram server');
            }
            this.logger.log(`2FA login successful for ${phone}`);
            const sessionString = client.session.save();
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }
            const userData = await this.processLoginResult(signInResult.user, sessionString, password);
            await this.disconnectClient(phone);
            return userData;
        }
        catch (error) {
            this.logger.error(`2FA login failed for ${phone}: ${error.message}`, error.stack);
            if (password) {
                throw new common_1.BadRequestException('Incorrect 2FA password');
            }
            throw new common_1.BadRequestException('2FA password required');
        }
    }
    async handleNewUserRegistration(phone, client, phoneCodeHash) {
        try {
            const randomName = `User${Math.random().toString(36).substring(2, 8)}`;
            const signUpResult = await client.invoke(new tl_1.Api.auth.SignUp({
                phoneNumber: phone,
                phoneCodeHash,
                firstName: randomName,
                lastName: '',
            }));
            if (!signUpResult || !signUpResult.user) {
                throw new common_1.BadRequestException('Invalid response from Telegram server');
            }
            const sessionString = client.session.save();
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }
            return await this.processLoginResult(signUpResult.user, sessionString);
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            this.logger.error(`Failed to register new user: ${errorDetails.message}`);
            throw new common_1.BadRequestException(errorDetails.message || 'Failed to register new user');
        }
    }
    async processLoginResult(user, sessionString, password) {
        try {
            if (!user || !sessionString) {
                throw new Error('Invalid user data or session string');
            }
            const now = new Date();
            const userData = {
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
            if (!userData.mobile || !userData.tgId) {
                throw new Error('Invalid user data received from Telegram');
            }
            const existingUser = await this.usersService.findOne(userData.tgId);
            if (existingUser) {
                return {
                    status: 200,
                    message: 'Login successful',
                    session: sessionString
                };
            }
            await this.usersService.create(userData);
            return {
                status: 200,
                message: 'Registration successful',
                session: sessionString
            };
        }
        catch (error) {
            this.logger.error('Error processing login result:', error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException('Failed to complete registration');
        }
    }
};
exports.TgSignupService = TgSignupService;
TgSignupService.LOGIN_TIMEOUT = 150000;
TgSignupService.SESSION_CLEANUP_INTERVAL = 120000;
TgSignupService.PHONE_PREFIX = "+";
TgSignupService.activeClients = new Map();
TgSignupService.API_CREDENTIALS = [
    { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
    { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
    { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
    { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
    { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
    { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" }
];
exports.TgSignupService = TgSignupService = TgSignupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], TgSignupService);
//# sourceMappingURL=TgSignup.service.js.map