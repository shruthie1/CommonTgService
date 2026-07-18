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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const daily_analytics_schema_1 = require("./schemas/daily-analytics.schema");
let DailyAnalyticsService = class DailyAnalyticsService {
    constructor(promoteModel, reactionModel, userModel) {
        this.promoteModel = promoteModel;
        this.reactionModel = reactionModel;
        this.userModel = userModel;
    }
    modelFor(metric) {
        if (metric === 'reaction')
            return this.reactionModel;
        if (metric === 'user')
            return this.userModel;
        return this.promoteModel;
    }
    numericFields(metric) {
        if (metric === 'reaction')
            return ['success', 'failed', 'restricted', 'floods'];
        if (metric === 'user')
            return ['newUsers', 'active', 'paid', 'revenue'];
        return ['sent', 'success', 'failed', 'banned'];
    }
    lastNDates(days) {
        const out = [];
        const n = Math.min(Math.max(Math.floor(days) || 1, 1), 60);
        for (let i = n - 1; i >= 0; i -= 1) {
            const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000);
            out.push(ist.toISOString().slice(0, 10));
        }
        return out;
    }
    async rows(metric, days = 14, clientId, namespace, mobile) {
        const dates = this.lastNDates(days);
        const filter = { date: { $in: dates } };
        if (clientId)
            filter.clientId = clientId;
        if (namespace)
            filter.namespace = namespace;
        if (mobile)
            filter.mobile = mobile;
        return this.modelFor(metric)
            .find(filter, { _id: 0, expireAt: 0, createdAt: 0 })
            .sort({ date: 1, clientId: 1 })
            .lean()
            .exec();
    }
    async dailyTotals(metric, days = 14) {
        const dates = this.lastNDates(days);
        const fields = this.numericFields(metric);
        const group = { _id: '$date' };
        for (const f of fields)
            group[f] = { $sum: `$${f}` };
        const agg = await this.modelFor(metric)
            .aggregate([{ $match: { date: { $in: dates } } }, { $group: group }, { $sort: { _id: 1 } }])
            .exec();
        const byDate = new Map(agg.map((d) => [d._id, d]));
        return dates.map((date) => {
            const row = byDate.get(date) || {};
            const out = { date };
            for (const f of fields)
                out[f] = row[f] || 0;
            return out;
        });
    }
    async byClient(metric, days = 14, namespace) {
        const dates = this.lastNDates(days);
        const fields = this.numericFields(metric);
        const match = { date: { $in: dates } };
        if (namespace)
            match.namespace = namespace;
        const group = { _id: '$clientId' };
        for (const f of fields)
            group[f] = { $sum: `$${f}` };
        const agg = await this.modelFor(metric)
            .aggregate([{ $match: match }, { $group: group }, { $sort: { _id: 1 } }])
            .exec();
        return agg.map((d) => {
            const out = { clientId: d._id };
            for (const f of fields)
                out[f] = d[f] || 0;
            return out;
        });
    }
    async byMobile(metric, days = 14, clientId, namespace) {
        const dates = this.lastNDates(days);
        const fields = this.numericFields(metric);
        const match = { date: { $in: dates } };
        if (clientId)
            match.clientId = clientId;
        if (namespace)
            match.namespace = namespace;
        const group = { _id: { clientId: '$clientId', mobile: '$mobile' } };
        for (const f of fields)
            group[f] = { $sum: `$${f}` };
        const agg = await this.modelFor(metric)
            .aggregate([
            { $match: match },
            { $group: group },
            { $sort: { '_id.clientId': 1, '_id.mobile': 1 } },
        ])
            .exec();
        return agg.map((d) => {
            const out = { clientId: d._id.clientId, mobile: d._id.mobile };
            for (const f of fields)
                out[f] = d[f] || 0;
            return out;
        });
    }
    async overview(days = 14) {
        const [promote, reaction, user] = await Promise.all([
            this.dailyTotals('promote', days),
            this.dailyTotals('reaction', days),
            this.dailyTotals('user', days),
        ]);
        return { days, promote, reaction, user };
    }
};
exports.DailyAnalyticsService = DailyAnalyticsService;
exports.DailyAnalyticsService = DailyAnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(daily_analytics_schema_1.PromoteStatDaily.name)),
    __param(1, (0, mongoose_1.InjectModel)(daily_analytics_schema_1.ReactionStatDaily.name)),
    __param(2, (0, mongoose_1.InjectModel)(daily_analytics_schema_1.UserStatDaily.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], DailyAnalyticsService);
//# sourceMappingURL=daily-analytics.service.js.map