"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const Helpers_1 = require("telegram/Helpers");
const schedule = __importStar(require("node-schedule-tz"));
const components_1 = require("./components");
const utils_1 = require("./utils");
const runtime_config_service_1 = require("./control-plane/config/runtime-config.service");
const account_maintenance_service_1 = require("./control-plane/maintenance/account-maintenance.service");
let AppService = AppService_1 = class AppService {
    constructor(usersService, telegramService, userDataService, clientService, activeChannelsService, upiIdService, statService, stat2Service, promoteStatService, channelsService, timestampService, botsService, eventManagerService, runtimeConfig, bufferClientService, maintenance) {
        this.usersService = usersService;
        this.telegramService = telegramService;
        this.userDataService = userDataService;
        this.clientService = clientService;
        this.activeChannelsService = activeChannelsService;
        this.upiIdService = upiIdService;
        this.statService = statService;
        this.stat2Service = stat2Service;
        this.promoteStatService = promoteStatService;
        this.channelsService = channelsService;
        this.timestampService = timestampService;
        this.botsService = botsService;
        this.eventManagerService = eventManagerService;
        this.runtimeConfig = runtimeConfig;
        this.bufferClientService = bufferClientService;
        this.maintenance = maintenance;
        this.logger = new common_1.Logger(AppService_1.name);
        this.userAccessData = new Map();
        this.joinChannelMap = new Map();
        this.joinChannelQueueRunning = false;
        this.scheduledJobs = [];
        this.refresTime = 0;
        console.log('App Module Constructor initiated !!');
    }
    onModuleInit() {
        console.log('App Module initiated !!');
        if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
            this.logger.log('Starting UMS access-data cleanup interval (every 15 minutes)');
            this.cleanupInterval = setInterval(() => this.cleanupOldAccessData(), 15 * 60 * 1000);
        }
        try {
            if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
                const channelJoinJob = schedule.scheduleJob('ums-channel-join-cycle', '25 2,9,16 * * * ', 'Asia/Kolkata', async () => {
                    this.logger.log('Starting UMS primary-client channel join/leave cycle');
                    try {
                        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=ExecutingjoinchannelForClients-${process.env.clientId}`);
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error, 'UMS scheduled join notification failed');
                    }
                    try {
                        if (new Date().getUTCDate() % 3 === 1) {
                            this.logger.log('UMS channel cycle branch=leave-all');
                            await this.leaveChannelsAll();
                        }
                        else {
                            this.logger.log('UMS channel cycle branch=join');
                            await this.joinchannelForClients();
                        }
                        this.logger.log('Completed UMS primary-client channel join/leave cycle');
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error, 'UMS scheduled channel join failed');
                    }
                });
                if (channelJoinJob)
                    this.scheduledJobs.push(channelJoinJob);
            }
            if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
                const retentionJob = schedule.scheduleJob('ums-user-data-retention', '0 3 * * * ', 'Asia/Kolkata', async () => {
                    this.logger.log('Starting UMS user-data/timestamp retention');
                    try {
                        const res = await this.userDataService.removeRedundantData();
                        await this.timestampService.clear();
                        console.log('Deleted userdata older than month | count: ', res.deletedCount);
                        this.logger.log(`Completed UMS user-data/timestamp retention: deleted=${res.deletedCount}`);
                    }
                    catch (e) {
                        console.error('Error Deleteing old userData', e);
                    }
                });
                if (retentionJob)
                    this.scheduledJobs.push(retentionJob);
            }
            console.log('Added enabled UMS cron jobs:', this.runtimeConfig.activeSchedulers());
        }
        catch (error) {
            console.log('Some Error: ', error);
        }
    }
    async setupClient(clientId, query) {
        return this.clientService.setupClient(clientId, query);
    }
    async checkBufferClients() {
        await this.bufferClientService.checkBufferClients();
    }
    async rotateReadyBufferClients() {
        return this.bufferClientService.rotateReadyBufferClients();
    }
    async joinBufferClients() {
        await this.bufferClientService.joinchannelForBufferClients();
    }
    async updateBufferClientInfo() {
        try {
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Updating Buffer Clients Info`);
        }
        catch (error) {
            this.logger.error('CMS buffer-info notification failed; continuing update', error);
        }
        await this.bufferClientService.updateInfo();
    }
    async forwardGetRequest(externalUrl, queryParams) {
        try {
            return (await axios_1.default.get(externalUrl, { params: queryParams })).data;
        }
        catch (error) {
            const axiosError = error;
            this.logger.error(`Forward request failed: ${axiosError.message}`, axiosError.stack);
            throw new Error(`Forward GET request failed: ${axiosError.message}`);
        }
    }
    async processEligibleUsers(limit, skip) {
        return this.maintenance.processEligibleUsers(limit, skip);
    }
    async checkPromotions() {
        setInterval(async () => {
            const clients = await this.clientService.findAll();
            for (const client of clients) {
                const userPromoteStats = await this.promoteStatService.findByClient(client.clientId);
                if (userPromoteStats?.isActive &&
                    (Date.now() - userPromoteStats?.lastUpdatedTimeStamp) / (1000 * 60) >
                        6) {
                    try {
                        await (0, utils_1.fetchWithTimeout)(`${client.repl}/promote`, {
                            timeout: 120000,
                        });
                        console.log(client.clientId, ': Promote Triggered!!');
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error, 'Promotion Check Err');
                    }
                }
                else {
                    console.log(client.clientId, ': ALL Good!! ---', Math.floor((Date.now() - userPromoteStats?.lastUpdatedTimeStamp) /
                        (1000 * 60)));
                }
            }
        }, 240000);
    }
    async getPromotionStatsPlain() {
        let resp = '';
        const result = await this.promoteStatService.findAll();
        for (const data of result) {
            resp += `\n${data.client.toUpperCase()} : ${data.totalCount} ${data.totalCount > 0 ? ` | ${Number((Date.now() - data.lastUpdatedTimeStamp) / (1000 * 60)).toFixed(2)}` : ''}`;
        }
        return resp;
    }
    async leaveChannelsAll() {
        await this.sendToAll('leavechannels');
    }
    async sendToAll(endpoint) {
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            const url = `${client.repl}/${endpoint}`;
            console.log('Trying : ', url);
            (0, utils_1.fetchWithTimeout)(url);
            await (0, Helpers_1.sleep)(2000);
        }
    }
    async exitPrimary() {
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            if (client.clientId.toLowerCase().includes('1')) {
                await (0, utils_1.fetchWithTimeout)(`${client.repl}/exit`);
                await (0, Helpers_1.sleep)(40000);
            }
        }
    }
    async exitSecondary() {
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            if (client.clientId.toLowerCase().includes('2')) {
                await (0, utils_1.fetchWithTimeout)(`${client.repl}/exit`);
                await (0, Helpers_1.sleep)(40000);
            }
        }
    }
    async refreshPrimary() {
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            if (client.clientId.toLowerCase().includes('1')) {
                await (0, utils_1.fetchWithTimeout)(`${client.repl}/exec/refresh`);
                await (0, Helpers_1.sleep)(40000);
            }
        }
    }
    async refreshSecondary() {
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            if (client.clientId.toLowerCase().includes('2')) {
                await (0, utils_1.fetchWithTimeout)(`${client.repl}/exec/refresh`);
                await (0, Helpers_1.sleep)(40000);
            }
        }
    }
    async getUser(limit, skip) {
        const currentDate = new Date();
        const weekAgoDate = new Date(currentDate);
        weekAgoDate.setDate(currentDate.getDate() - 7);
        const monthAgoDate = new Date(currentDate);
        monthAgoDate.setDate(currentDate.getDate() - 30);
        const threeMonthAgoDate = new Date(currentDate);
        threeMonthAgoDate.setDate(currentDate.getDate() - 90);
        const query = {
            expired: false,
            $or: [
                { createdAt: { $gt: monthAgoDate }, updatedAt: { $lt: weekAgoDate } },
                {
                    createdAt: { $lte: monthAgoDate, $gt: threeMonthAgoDate },
                    updatedAt: { $lt: monthAgoDate },
                },
                {
                    createdAt: { $lte: threeMonthAgoDate },
                    updatedAt: { $lte: threeMonthAgoDate },
                },
            ],
        };
        const users = await this.usersService.executeQuery(query, {}, limit || 300, skip || 0);
        return users;
    }
    getHello() {
        return 'Hello World!';
    }
    cleanupOldAccessData() {
        const currentTime = Date.now();
        for (const [chatId, accessData] of this.userAccessData.entries()) {
            const recentAccessData = accessData.timestamps.filter((timestamp) => currentTime - timestamp <= 15 * 60 * 1000);
            if (recentAccessData.length === 0) {
                this.userAccessData.delete(chatId);
            }
            else if (recentAccessData.length < accessData.timestamps.length) {
                this.userAccessData.set(chatId, {
                    timestamps: recentAccessData,
                    videoDetails: accessData.videoDetails,
                });
            }
        }
    }
    async isRecentUser(chatId) {
        const accessData = this.userAccessData.get(chatId) || {
            timestamps: [],
            videoDetails: {},
        };
        const currentTime = Date.now();
        const recentAccessData = accessData.timestamps.filter((timestamp) => currentTime - timestamp <= 15 * 60 * 1000);
        recentAccessData.push(currentTime);
        this.userAccessData.set(chatId, {
            videoDetails: accessData.videoDetails,
            timestamps: recentAccessData,
        });
        const result = {
            count: recentAccessData.length,
            videoDetails: accessData.videoDetails,
        };
        console.log('Get', chatId, result);
        return result;
    }
    async updateRecentUser(chatId, videoDetails) {
        const accessData = this.userAccessData.get(chatId) || {
            timestamps: [],
            videoDetails: {},
        };
        const updatedVideoDetails = { ...accessData.videoDetails, ...videoDetails };
        this.userAccessData.set(chatId, {
            videoDetails: updatedVideoDetails,
            timestamps: accessData.timestamps,
        });
        const result = {
            count: accessData.timestamps.length,
            videoDetails: updatedVideoDetails,
        };
        console.log('Update:', chatId, {
            videoDetails: updatedVideoDetails,
            timestamps: accessData.timestamps,
        });
        return result;
    }
    async resetRecentUser(chatId) {
        this.userAccessData.delete(chatId);
        console.log('Deleted User Access Data for: ', chatId);
        return { count: 0 };
    }
    async getPaymentStats(chatId, profile) {
        const resp = {
            paid: 0,
            demoGiven: 0,
            secondShow: 0,
            fullShow: 0,
            latestCallTime: 0,
            canCall: true,
            videos: [],
        };
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        const twentyDays = Date.now() - 20 * 24 * 60 * 60 * 1000;
        try {
            const query1 = {
                chatId,
                profile: { $exists: true, $ne: profile },
                payAmount: { $gte: 10 },
            };
            const query2 = { chatId, profile: { $exists: true, $ne: profile } };
            const document = await this.userDataService.executeQuery(query1);
            const document2 = await this.userDataService.executeQuery(query2);
            if (document.length > 0) {
                resp.paid = document.length;
            }
            if (document2.length > 0) {
                for (const doc of document2) {
                    if (doc.canReply == 0 && doc.lastMsgTimeStamp > threeDaysAgo) {
                        resp.canCall = false;
                    }
                    if (doc.callTime > threeDaysAgo) {
                        if (doc.demoGiven) {
                            resp.demoGiven++;
                        }
                        if (doc.secondShow) {
                            resp.secondShow++;
                        }
                        if (doc.fullShow) {
                            resp.fullShow++;
                        }
                        if (doc.callTime > resp.latestCallTime) {
                            resp.latestCallTime = doc.callTime;
                        }
                        resp.videos.push(...doc.videos);
                    }
                    else {
                        if (doc.lastMsgTimeStamp < twentyDays) {
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`ReSetting UserData for Profile: ${doc.profile} | ChatId: ${doc.chatId}\n\n LastMsg: ${getReadableTimeDifference(doc.lastMsgTimeStamp, Date.now())} `)}`);
                            await this.userDataService.update(doc.profile, doc.chatId, {
                                payAmount: 0,
                                demoGiven: false,
                                secondShow: false,
                                highestPayAmount: 0,
                                lastMsgTimeStamp: Date.now(),
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
        console.log(resp);
        return resp;
    }
    async sendToChannel(chatId, token, message) {
        function decodeIfEncoded(str) {
            try {
                return str !== decodeURIComponent(str) ? decodeURIComponent(str) : str;
            }
            catch (e) {
                return str;
            }
        }
        function escapeMarkdownV2(text) {
            text = text.replace(/([\\_*`\[\]()~>#+\-=|{}.!])/g, '\\$1');
            return text;
        }
        const decodedMessage = decodeIfEncoded(message);
        console.log('Message:', decodedMessage);
        const category = !token
            ? AppService_1.CHANNEL_CATEGORY_MAP[chatId]
            : undefined;
        if (category) {
            try {
                const sent = await this.botsService.sendMessageByCategory(category, decodedMessage);
                if (sent)
                    return { ok: true };
                console.warn(`sendToChannel: category ${category} send returned falsy; falling back to ppplbot`);
            }
            catch (error) {
                (0, utils_1.parseError)(error, `sendToChannel category ${category}`, false);
            }
        }
        const escapedMessage = escapeMarkdownV2(decodedMessage);
        const encodedMessage = encodeURIComponent(escapedMessage).replace(/%5Cn/g, '%0A');
        const url = `${(0, utils_1.ppplbot)(chatId, token)}&parse_mode=MarkdownV2&text=${encodedMessage}`;
        return (await (0, utils_1.fetchWithTimeout)(url, {}, 0))?.data;
    }
    async findAllMasked(query) {
        return await this.clientService.findAllMasked();
    }
    async portalData(query) {
        const client = (await this.clientService.findAllMasked())[0];
        const upis = await this.upiIdService.findOne();
        return { client, upis };
    }
    async joinchannelForClients() {
        console.log('Joining Channel Started');
        await (0, Helpers_1.sleep)(2000);
        const clients = await this.clientService.findAll();
        await Promise.all(clients.map(async (document) => {
            try {
                const resp = await (0, utils_1.fetchWithTimeout)(`${document.repl}/channelinfo`, { timeout: 200000 }, 1);
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Channel SendTrue :: ${document.clientId}: ${resp.data.canSendTrueCount}`);
                if (resp?.data?.canSendTrueCount &&
                    resp?.data?.canSendTrueCount < 350) {
                    const result = await this.activeChannelsService.getActiveChannels(150, 0, resp.data?.ids);
                    await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Started Joining Channels for ${document.clientId}: ${result.length}`);
                    this.joinChannelMap.set(document.repl, result);
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
            }
        }));
        this.joinChannelQueue();
        console.log('Joining Channel Triggered Succesfully for ', clients.length);
        return 'Initiated Joining channels';
    }
    async joinChannelQueue() {
        if (this.joinChannelIntervalId)
            return;
        this.joinChannelIntervalId = setInterval(async () => {
            if (this.joinChannelQueueRunning)
                return;
            this.joinChannelQueueRunning = true;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length > 0) {
                    console.log('In JOIN CHANNEL interval: ', new Date().toISOString());
                    const promises = keys.map(async (url) => {
                        const channels = this.joinChannelMap.get(url);
                        if (channels && channels.length > 0) {
                            const channel = channels.shift();
                            console.log(url, ' Pending Channels :', channels.length);
                            this.joinChannelMap.set(url, channels);
                            try {
                                await (0, utils_1.fetchWithTimeout)(`${url}/joinchannel?username=${channel.username}`);
                                console.log(url, ' Trying to join :', channel.username);
                            }
                            catch (error) {
                                (0, utils_1.parseError)(error, 'Outer Err: ');
                            }
                        }
                        else {
                            this.joinChannelMap.delete(url);
                        }
                    });
                    await Promise.all(promises);
                }
                else {
                    this.clearJoinChannelInterval();
                }
            }
            finally {
                this.joinChannelQueueRunning = false;
            }
        }, 3 * 60 * 1000);
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            console.log('Cleared joinChannel Set Interval');
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
    }
    async refreshmap() {
        await this.clientService.refreshMap();
    }
    async blockUserAll(chatId) {
        let profileData = '';
        const userDatas = await this.userDataService.search({ chatId });
        for (const userData of userDatas) {
            const profileRegex = new RegExp(userData.profile, 'i');
            const profiles = await this.clientService.executeQuery({
                clientId: { $regex: profileRegex },
            });
            for (const profile of profiles) {
                const url = `${profile.repl}/blockuser/${chatId}`;
                console.log('Executing: ', url);
                const result = await (0, utils_1.fetchWithTimeout)(url);
                console.log(result.data);
            }
            profileData = profileData + ' | ' + userData.profile;
        }
        return profileData;
    }
    async unblockUserAll(chatId) {
        let profileData = '';
        const userDatas = await this.userDataService.search({ chatId });
        for (const userData of userDatas) {
            const profileRegex = new RegExp(userData.profile, 'i');
            const profiles = await this.clientService.executeQuery({
                clientId: { $regex: profileRegex },
            });
            for (const profile of profiles) {
                const url = `${profile.repl}/unblockuser/${chatId}`;
                console.log('Executing: ', url);
                const result = await (0, utils_1.fetchWithTimeout)(url);
                console.log(result.data);
            }
            profileData = profileData + ' | ' + userData.profile;
        }
        return profileData;
    }
    async getRequestCall(username, chatId, type = '1') {
        const user = (await this.clientService.search({ username: username.toLowerCase() }))[0];
        console.log(`Call Request Recived: ${username} | ${chatId}`);
        if (user) {
            return await this.eventManagerService.schedulePaidEvents(chatId, user.clientId, type);
        }
        return { message: 'No Such User Found' };
    }
    async getUserData(profile, clientId, chatId) {
        if (!profile) {
            profile = clientId?.replace(/\d/g, '');
        }
        return await this.userDataService.findOne(profile, chatId);
    }
    async updateUserData(profile, clientId, body) {
        if (!profile) {
            profile = clientId?.replace(/\d/g, '');
        }
        const chatId = body.chatId;
        return await this.userDataService.update(profile, chatId, body);
    }
    async updateUserConfig(chatId, profile, data) {
        this.userDataService.update(profile, chatId, data);
    }
    async getUserConfig(filter) {
        void filter;
        return undefined;
    }
    async getallupiIds() {
        return await this.upiIdService.findOne();
    }
    async getUserInfo(filter) {
        const client = (await this.clientService.executeQuery(filter))[0];
        const result = { ...(client._doc ? client._doc : client) };
        delete result['session'];
        delete result['mobile'];
        delete result['deployKey'];
        delete result['promoteMobile'];
        return result;
    }
    extractNumberFromString(inputString) {
        const regexPattern = /\d+/;
        const matchResult = inputString?.match(regexPattern);
        if (matchResult && matchResult.length > 0) {
            return parseInt(matchResult[0], 10);
        }
        return null;
    }
    async createInitializedObject() {
        const clients = await this.clientService.findAll();
        const initializedObject = {};
        for (const user of clients) {
            if (this.extractNumberFromString(user.clientId))
                initializedObject[user.clientId.toUpperCase()] = {
                    profile: user.clientId.toUpperCase(),
                    totalCount: 0,
                    totalPaid: 0,
                    totalOldPaid: 0,
                    oldPaidDemo: 0,
                    totalpendingDemos: 0,
                    oldPendingDemos: 0,
                    totalNew: 0,
                    totalNewPaid: 0,
                    newPaidDemo: 0,
                    newPendingDemos: 0,
                    names: '',
                    fullShowPPl: 0,
                    fullShowNames: '',
                };
        }
        return initializedObject;
    }
    async getData() {
        const profileData = await this.createInitializedObject();
        const stats = await this.statService.findAll();
        for (const stat of stats) {
            const { count, newUser, payAmount, demoGivenToday, demoGiven, client, name, secondShow, } = stat;
            if (client && profileData[client.toUpperCase()]) {
                const userData = profileData[client.toUpperCase()];
                userData.totalCount += count;
                userData.totalPaid += payAmount > 0 ? 1 : 0;
                userData.totalOldPaid += payAmount > 0 && !newUser ? 1 : 0;
                userData.oldPaidDemo += demoGivenToday && !newUser ? 1 : 0;
                userData.totalpendingDemos += payAmount > 25 && !demoGiven ? 1 : 0;
                userData.oldPendingDemos +=
                    payAmount > 25 && !demoGiven && !newUser ? 1 : 0;
                if (payAmount > 25 && !demoGiven) {
                    userData.names = userData.names + ` ${name} |`;
                }
                if (demoGiven &&
                    ((payAmount > 90 && !secondShow) || (payAmount > 150 && secondShow))) {
                    userData.fullShowPPl++;
                    userData.fullShowNames = userData.fullShowNames + ` ${name} |`;
                }
                if (newUser) {
                    userData.totalNew += 1;
                    userData.totalNewPaid += payAmount > 0 ? 1 : 0;
                    userData.newPaidDemo += demoGivenToday ? 1 : 0;
                    userData.newPendingDemos += payAmount > 25 && !demoGiven ? 1 : 0;
                }
            }
        }
        const profileDataArray = Object.entries(profileData);
        profileDataArray.sort((a, b) => b[1].totalpendingDemos - a[1].totalpendingDemos);
        let reply = '';
        for (const [profile, userData] of profileDataArray) {
            reply += this.renderDashboardRow(profile, userData.totalpendingDemos, userData.names);
        }
        profileDataArray.sort((a, b) => b[1].fullShowPPl - a[1].fullShowPPl);
        let reply2 = '';
        for (const [profile, userData] of profileDataArray) {
            reply2 += this.renderDashboardRow(profile, userData.fullShowPPl, userData.fullShowNames);
        }
        const reply3 = await this.getPromotionStats();
        return `<main class="dashboard">
        <header class="dashboard-header">
          <h1>Status</h1>
        </header>
        <nav class="dashboard-tabs" aria-label="Dashboard sections">
          <button class="dashboard-tab is-active" type="button" data-dashboard-tab="pending">Pending</button>
          <button class="dashboard-tab" type="button" data-dashboard-tab="full-show">Full show</button>
          <button class="dashboard-tab" type="button" data-dashboard-tab="promotion">Promotion</button>
        </nav>
        <div class="dashboard-grid">
          <section class="dashboard-card dashboard-card-pending is-active" data-dashboard-panel="pending">
            <h2>Pending demos</h2>
            <div class="metric-list">${reply}</div>
          </section>
          <section class="dashboard-card dashboard-card-full-show" data-dashboard-panel="full-show">
            <h2>Full-show users</h2>
            <div class="metric-list">${reply2}</div>
          </section>
        </div>
        <section class="dashboard-card dashboard-card-wide dashboard-card-promotion" data-dashboard-panel="promotion">
          <h2>Promotion stats</h2>
          <div class="metric-list">${reply3}</div>
        </section>
        <dialog class="metric-dialog" id="metric-dialog" aria-labelledby="metric-dialog-title">
          <div class="metric-dialog-header">
            <strong id="metric-dialog-title"></strong>
            <button class="metric-dialog-close" type="button" aria-label="Close details">×</button>
          </div>
          <p id="metric-dialog-detail"></p>
        </dialog>
      </main>`;
    }
    async getPromotionStats() {
        let resp = '';
        const result = await this.promoteStatService.findAll();
        for (const data of result) {
            const age = this.formatDashboardAge(data.lastUpdatedTimeStamp, data.totalCount > 0);
            resp += this.renderDashboardRow(data.client, data.totalCount, age.text, age.tone);
        }
        return resp;
    }
    renderDashboardRow(label, count, details, detailTone = '') {
        const safeDetails = this.escapeDashboardHtml(details).trim();
        const safeLabel = this.escapeDashboardHtml(String(label).toUpperCase());
        const safeCount = this.escapeDashboardHtml(count);
        return `<button class="metric-row" type="button" data-dashboard-label="${safeLabel}" data-dashboard-count="${safeCount}" data-dashboard-detail="${safeDetails}">
      <span class="metric-label">${this.escapeDashboardHtml(String(label).toUpperCase())}</span>
      <strong class="metric-value">${safeCount}</strong>
      ${safeDetails ? `<span class="metric-detail ${detailTone}">${safeDetails}</span>` : ''}
    </button>`;
    }
    formatDashboardAge(timestamp, hasActivity) {
        if (!hasActivity || !Number.isFinite(Number(timestamp))) {
            return { text: 'Not active', tone: 'age-inactive' };
        }
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 1000));
        if (elapsedSeconds < 60) {
            return { text: `${elapsedSeconds} sec ago`, tone: 'age-fresh' };
        }
        const minutes = Math.floor(elapsedSeconds / 60);
        if (minutes < 60) {
            return { text: `${minutes} min ago`, tone: minutes <= 15 ? 'age-fresh' : 'age-aging' };
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (hours < 24) {
            return {
                text: `${hours} hr${remainingMinutes ? ` ${remainingMinutes} min` : ''} ago`,
                tone: 'age-stale',
            };
        }
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return {
            text: `${days} day${days === 1 ? '' : 's'}${remainingHours ? ` ${remainingHours} hr` : ''} ago`,
            tone: 'age-stale',
        };
    }
    escapeDashboardHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
        })[character] || character);
    }
    async checkAndRefresh() {
        if (Date.now() > this.refresTime) {
            this.refresTime = Date.now() + 5 * 60 * 1000;
            const clients = await this.clientService.findAll();
            for (const value of clients) {
                await (0, utils_1.fetchWithTimeout)(`${value.repl}/markasread`);
                await (0, Helpers_1.sleep)(3000);
            }
        }
    }
    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
        }
        for (const job of this.scheduledJobs)
            job.cancel();
    }
};
exports.AppService = AppService;
AppService.CHANNEL_CATEGORY_MAP = {
    '-1002529408777': components_1.ChannelCategory.VC_NOTIFICATIONS,
    '-1002472867139': components_1.ChannelCategory.VC_WARNINGS,
};
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [components_1.UsersService,
        components_1.TelegramService,
        components_1.UserDataService,
        components_1.ClientService,
        components_1.ActiveChannelsService,
        components_1.UpiIdService,
        components_1.Stat1Service,
        components_1.Stat2Service,
        components_1.PromoteStatService,
        components_1.ChannelsService,
        components_1.TimestampService,
        components_1.BotsService,
        components_1.EventManagerService,
        runtime_config_service_1.RuntimeConfigService,
        components_1.BufferClientService,
        account_maintenance_service_1.AccountMaintenanceService])
], AppService);
function getReadableTimeDifference(ms1, ms2) {
    const diff = Math.abs(ms1 - ms2);
    const seconds = Math.floor(diff / 1000);
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    let result = [];
    if (days > 0)
        result.push(`${days}d`);
    if (hours > 0)
        result.push(`${hours}h`);
    if (minutes > 0)
        result.push(`${minutes}m`);
    if (secs > 0 || result.length === 0)
        result.push(`${secs}s`);
    return result.join(' ');
}
//# sourceMappingURL=app.service.js.map