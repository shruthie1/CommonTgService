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
const runtime_config_service_1 = require("../config/runtime-config.service");
let AccountMaintenanceService = AccountMaintenanceService_1 = class AccountMaintenanceService {
    constructor(usersService, channelsService, activeChannelsService, promoteClientService, config) {
        this.usersService = usersService;
        this.channelsService = channelsService;
        this.activeChannelsService = activeChannelsService;
        this.promoteClientService = promoteClientService;
        this.config = config;
        this.logger = new common_1.Logger(AccountMaintenanceService_1.name);
        this.running = false;
        this.delayedJoinTimers = [];
    }
    async processEligibleUsers(limit = 300, skip = 0) {
        if (this.running) {
            this.logger.warn('Account maintenance skipped; previous run is still active');
            return { processed: 0, skipped: true };
        }
        this.running = true;
        try {
            const users = await this.findEligibleUsers(limit, skip);
            for (const user of users)
                await this.updateUser(user);
            this.schedulePromoteClientJoin();
            return { processed: users.length, skipped: false };
        }
        finally {
            this.running = false;
        }
    }
    async checkPromoteClients() {
        await this.promoteClientService.checkPromoteClients();
    }
    onModuleDestroy() {
        for (const timer of this.delayedJoinTimers)
            clearTimeout(timer);
    }
    schedulePromoteClientJoin() {
        if (!this.config.enabled('UMS_TEST_SCHEDULER'))
            return;
        const timer = setTimeout(() => {
            this.promoteClientService
                .joinchannelForPromoteClients()
                .catch((error) => this.logger.error('Delayed promote-client join failed', error instanceof Error ? error.stack : String(error)));
        }, 2 * 60 * 1000);
        this.delayedJoinTimers.push(timer);
    }
    async findEligibleUsers(limit, skip) {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 70);
        return this.usersService.executeQuery({
            expired: false,
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
        components_1.PromoteClientService,
        runtime_config_service_1.RuntimeConfigService])
], AccountMaintenanceService);
//# sourceMappingURL=account-maintenance.service.js.map