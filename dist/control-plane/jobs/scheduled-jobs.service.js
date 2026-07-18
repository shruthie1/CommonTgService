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
var ScheduledJobsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledJobsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = __importDefault(require("mongoose"));
const schedule = __importStar(require("node-schedule-tz"));
const components_1 = require("../../components");
const utils_1 = require("../../utils");
const app_service_1 = require("../../app.service");
const runtime_config_service_1 = require("../config/runtime-config.service");
const account_maintenance_service_1 = require("../maintenance/account-maintenance.service");
const IST = 'Asia/Kolkata';
let ScheduledJobsService = ScheduledJobsService_1 = class ScheduledJobsService {
    constructor(config, appService, maintenance, clientService, activeChannelsService, userDataService, stat1Service, stat2Service) {
        this.config = config;
        this.appService = appService;
        this.maintenance = maintenance;
        this.clientService = clientService;
        this.activeChannelsService = activeChannelsService;
        this.userDataService = userDataService;
        this.stat1Service = stat1Service;
        this.stat2Service = stat2Service;
        this.logger = new common_1.Logger(ScheduledJobsService_1.name);
        this.jobs = [];
        this.startupTimers = [];
        this.owner = `${process.env.HOSTNAME || 'control-plane'}:${process.pid}`;
    }
    onModuleInit() {
        this.registerCmsJobs();
        this.registerMaintenanceJobs();
    }
    onModuleDestroy() {
        for (const job of this.jobs)
            job.cancel();
        for (const timer of this.startupTimers)
            clearTimeout(timer);
    }
    register(name, cron, task) {
        const job = schedule.scheduleJob(name, cron, IST, async () => {
            try {
                this.logger.log(`Starting scheduled job: ${name}`);
                await task();
                this.logger.log(`Completed scheduled job: ${name}`);
            }
            catch (error) {
                this.logger.error(`Scheduled job failed: ${name}`, error instanceof Error ? error.stack : String(error));
            }
        });
        if (!job)
            throw new Error(`Unable to register scheduled job ${name}`);
        this.jobs.push(job);
    }
    registerCmsJobs() {
        if (!this.config.enabled('CMS_SCHEDULER'))
            return;
        this.register('cms-buffer-check', '25 2 * * *', () => this.appService.checkBufferClients());
        this.register('cms-buffer-join', '0 */3 * * *', () => this.appService.joinBufferClients());
        this.register('cms-buffer-info-refresh', '25 0 * * *', async () => {
            if (new Date().getUTCDate() % 5 === 0)
                await this.appService.updateBufferClientInfo();
        });
        if (!this.enabled('LOCAL_SERVER')) {
            this.afterStartup(60_000, () => this.appService.joinBufferClients());
        }
    }
    registerMaintenanceJobs() {
        if (!this.config.enabled('UMS_TEST_SCHEDULER'))
            return;
        this.register('maintenance-refresh-map-and-stat1', '0 * * * *', async () => {
            await this.clientService.refreshMap();
            await this.stat1Service.deleteAll();
        });
        this.register('maintenance-process-users', '0 */3 * * *', async () => {
            await this.maintenance.processEligibleUsers(400, 0);
        });
        this.register('maintenance-promote-client-check', '35 16 * * *', () => this.maintenance.checkPromoteClients());
        this.register('maintenance-active-channel-word-restrictions', '25 0 * * *', async () => {
            if (new Date().getUTCDate() % 9 !== 0)
                return;
            await new Promise((resolve) => setTimeout(resolve, 30_000));
            await this.activeChannelsService.resetWordRestrictions();
        });
        this.register('maintenance-daily-promote-stats-reset', '25 0 * * *', () => this.runDailyPromoteReset());
        this.register('maintenance-daily-promote-stats-reset-recovery', '30,45 0 * * *', () => this.runDailyPromoteReset());
        if (this.isDailyResetRecoveryWindow()) {
            this.afterStartup(15_000, () => this.runDailyPromoteReset());
        }
        this.afterStartup(120_000, () => this.maintenance.processEligibleUsers(400, 0));
    }
    afterStartup(delayMs, task) {
        const timer = setTimeout(() => {
            task().catch((error) => this.logger.error('Startup task failed', error instanceof Error ? error.stack : String(error)));
        }, delayMs);
        this.startupTimers.push(timer);
    }
    enabled(name) {
        return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
    }
    istDateKey() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: IST,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
            .format(new Date())
            .replace(/\//g, '-');
    }
    isDailyResetRecoveryWindow() {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: IST,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date());
        const value = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
        const minutes = value('hour') * 60 + value('minute');
        return minutes >= 25 && minutes < 60;
    }
    async runDailyPromoteReset() {
        const db = mongoose_1.default.connection.db;
        if (!db)
            throw new Error('Mongo connection is unavailable for the daily promoteStats reset');
        const jobId = `daily-promote-stats-reset:${this.istDateKey()}`;
        if (!(await this.claimJob(db.collection('controlPlaneJobRuns'), jobId))) {
            this.logger.warn(`Daily promoteStats reset already claimed or completed: ${jobId}`);
            return;
        }
        let notification = '';
        try {
            const stats = await db
                .collection('promoteStats')
                .find({}, { projection: { client: 1, totalCount: 1, lastUpdatedTimeStamp: 1 } })
                .toArray();
            notification = stats
                .map((stat) => `${String(stat.client || 'unknown').toUpperCase()}: ${stat.totalCount || 0}`)
                .join('\n');
            const result = await this.resetPromoteStatsWithRetries(db.collection('promoteStats'));
            await db.collection('controlPlaneJobRuns').updateOne({ _id: jobId }, {
                $set: {
                    completedAt: new Date(),
                    resetMatchedCount: result.matchedCount,
                    resetModifiedCount: result.modifiedCount,
                },
                $unset: { leaseOwner: '', leaseExpiresAt: '' },
            });
        }
        catch (error) {
            await db.collection('controlPlaneJobRuns').updateOne({ _id: jobId }, {
                $set: {
                    failedAt: new Date(),
                    error: error instanceof Error ? error.message : String(error),
                    leaseExpiresAt: new Date(0),
                },
                $unset: { leaseOwner: '' },
            });
            throw error;
        }
        try {
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(notification)}`);
        }
        catch (error) {
            this.logger.error('Daily promoteStats reset completed, but its notification failed', error instanceof Error ? error.stack : String(error));
        }
    }
    async resetPromoteStatsWithRetries(promoteStats) {
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await this.userDataService.resetPaidUsers();
                await this.stat1Service.deleteAll();
                await this.stat2Service.deleteAll();
                const now = Date.now();
                return await promoteStats.updateMany({}, {
                    $set: {
                        totalCount: 0,
                        uniqueChannels: 0,
                        releaseDay: now,
                        lastUpdatedTimeStamp: now,
                        data: {},
                    },
                });
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`Daily promoteStats reset attempt ${attempt}/3 failed`);
                if (attempt < 3)
                    await new Promise((resolve) => setTimeout(resolve, 30_000));
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    async claimJob(collection, jobId) {
        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
        const claimed = await collection.updateOne({
            _id: jobId,
            completedAt: { $exists: false },
            $or: [
                { leaseExpiresAt: { $lt: now } },
                { leaseExpiresAt: { $exists: false } },
            ],
        }, { $set: { leaseOwner: this.owner, leaseExpiresAt, startedAt: now } });
        if (claimed.modifiedCount === 1)
            return true;
        try {
            await collection.insertOne({
                _id: jobId,
                leaseOwner: this.owner,
                leaseExpiresAt,
                startedAt: now,
            });
            return true;
        }
        catch (error) {
            if (error.code === 11000)
                return false;
            throw error;
        }
    }
};
exports.ScheduledJobsService = ScheduledJobsService;
exports.ScheduledJobsService = ScheduledJobsService = ScheduledJobsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_config_service_1.RuntimeConfigService,
        app_service_1.AppService,
        account_maintenance_service_1.AccountMaintenanceService,
        components_1.ClientService,
        components_1.ActiveChannelsService,
        components_1.UserDataService,
        components_1.Stat1Service,
        components_1.Stat2Service])
], ScheduledJobsService);
//# sourceMappingURL=scheduled-jobs.service.js.map