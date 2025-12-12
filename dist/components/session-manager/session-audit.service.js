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
exports.SessionAuditService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const sessions_schema_1 = require("./schemas/sessions.schema");
const telegram_logger_1 = require("../Telegram/utils/telegram-logger");
let SessionAuditService = class SessionAuditService {
    constructor(sessionAuditModel) {
        this.sessionAuditModel = sessionAuditModel;
        this.logger = new telegram_logger_1.TelegramLogger('SessionAuditService');
    }
    async createAuditRecord(createDto) {
        try {
            this.logger.info(createDto.mobile, 'Creating session audit record');
            const sessionAudit = new this.sessionAuditModel({
                ...createDto,
                status: sessions_schema_1.SessionStatus.CREATED,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                usageCount: 0,
                isActive: true
            });
            const savedRecord = await sessionAudit.save();
            this.logger.info(createDto.mobile, `Session audit record created with ID: ${savedRecord.id}`);
            return savedRecord;
        }
        catch (error) {
            this.logger.error(createDto.mobile, 'Failed to create session audit record', error);
            throw error;
        }
    }
    async updateAuditRecord(mobile, sessionString, updateDto) {
        try {
            this.logger.info(mobile, 'Updating session audit record');
            const updateData = {
                ...updateDto,
                lastUsedAt: new Date()
            };
            const query = { mobile, isActive: true };
            if (sessionString) {
                query.sessionString = sessionString;
            }
            const updatedRecord = await this.sessionAuditModel.findOneAndUpdate(query, { $set: updateData }, { new: true, sort: { createdAt: -1 } });
            if (updatedRecord) {
                this.logger.info(mobile, `Session audit record updated: ${updatedRecord.id}`);
            }
            else {
                this.logger.info(mobile, 'No active session audit record found to update');
            }
            return updatedRecord;
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to update session audit record', error);
            throw error;
        }
    }
    async markSessionUsed(mobile, sessionString) {
        try {
            if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
                this.logger.warn('system', 'Invalid mobile number provided to markSessionUsed');
                return null;
            }
            const query = { mobile, isActive: true };
            if (sessionString && typeof sessionString === 'string' && sessionString.trim().length > 0) {
                query.sessionString = sessionString;
            }
            const updatedRecord = await this.sessionAuditModel.findOneAndUpdate(query, {
                $inc: { usageCount: 1 },
                $set: { lastUsedAt: new Date() }
            }, { new: true, sort: { createdAt: -1 } });
            if (updatedRecord) {
                this.logger.info(mobile, `Session usage recorded: count ${updatedRecord.usageCount}`);
            }
            else {
                this.logger.warn(mobile, 'No active session found to mark as used');
            }
            return updatedRecord;
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to mark session as used', error);
            throw error;
        }
    }
    async markSessionFailed(mobile, sessionString, errorMessage) {
        try {
            return await this.updateAuditRecord(mobile, sessionString, {
                status: sessions_schema_1.SessionStatus.FAILED,
                errorMessage,
                lastError: errorMessage,
                isActive: false
            });
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to mark session as failed', error);
            throw error;
        }
    }
    async revokeSession(mobile, sessionString, reason = 'manual_revocation') {
        try {
            return await this.updateAuditRecord(mobile, sessionString, {
                status: sessions_schema_1.SessionStatus.REVOKED,
                revocationReason: reason,
                revokedAt: new Date(),
                isActive: false
            });
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to revoke session', error);
            throw error;
        }
    }
    async getSessionsFormobile(mobile, activeOnly = false) {
        try {
            if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
                this.logger.warn('system', 'Invalid mobile number provided to getSessionsFormobile');
                return [];
            }
            const query = { mobile };
            if (activeOnly) {
                query.isActive = true;
                query.status = { $in: [sessions_schema_1.SessionStatus.ACTIVE, sessions_schema_1.SessionStatus.CREATED] };
            }
            const sessions = await this.sessionAuditModel
                .find(query)
                .sort({ createdAt: -1 })
                .limit(100)
                .exec();
            this.logger.info(mobile, `Retrieved ${sessions.length} session records (activeOnly: ${activeOnly})`);
            return sessions;
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to get sessions for phone number', error);
            throw error;
        }
    }
    async getLatestActiveSession(mobile) {
        try {
            const session = await this.sessionAuditModel
                .findOne({ mobile, isActive: true })
                .sort({ createdAt: -1 })
                .exec();
            if (session) {
                this.logger.info(mobile, `Latest active session found: ${session.id}`);
            }
            return session;
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to get latest active session', error);
            throw error;
        }
    }
    async querySessionAudits(queryDto) {
        try {
            const { mobile, status, creationMethod, isActive, limit = 20, offset = 0, startDate, endDate } = queryDto;
            const query = {};
            if (mobile)
                query.mobile = mobile;
            if (status)
                query.status = status;
            if (creationMethod)
                query.creationMethod = creationMethod;
            if (isActive !== undefined)
                query.isActive = isActive;
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate)
                    query.createdAt.$gte = startDate;
                if (endDate)
                    query.createdAt.$lte = endDate;
            }
            const [sessions, total] = await Promise.all([
                this.sessionAuditModel
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)
                    .exec(),
                this.sessionAuditModel.countDocuments(query)
            ]);
            this.logger.info('system', `Session audit query returned ${sessions.length} of ${total} records`);
            return {
                sessions,
                total,
                page: Math.floor(offset / limit) + 1,
                limit
            };
        }
        catch (error) {
            this.logger.error('system', 'Failed to query session audits', error);
            throw error;
        }
    }
    async getSessionStats(mobile, days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const query = { createdAt: { $gte: startDate } };
            if (mobile) {
                query.mobile = mobile;
            }
            const stats = await this.sessionAuditModel.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalSessions: { $sum: 1 },
                        activeSessions: {
                            $sum: { $cond: [{ $eq: ['$status', sessions_schema_1.SessionStatus.ACTIVE] }, 1, 0] }
                        },
                        expiredSessions: {
                            $sum: { $cond: [{ $eq: ['$status', sessions_schema_1.SessionStatus.EXPIRED] }, 1, 0] }
                        },
                        revokedSessions: {
                            $sum: { $cond: [{ $eq: ['$status', sessions_schema_1.SessionStatus.REVOKED] }, 1, 0] }
                        },
                        failedSessions: {
                            $sum: { $cond: [{ $eq: ['$status', sessions_schema_1.SessionStatus.FAILED] }, 1, 0] }
                        }
                    }
                }
            ]);
            const methodBreakdown = await this.sessionAuditModel.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: '$creationMethod',
                        count: { $sum: 1 }
                    }
                }
            ]);
            const baseStats = stats[0] || {
                totalSessions: 0,
                activeSessions: 0,
                expiredSessions: 0,
                revokedSessions: 0,
                failedSessions: 0
            };
            const creationMethodBreakdown = {};
            methodBreakdown.forEach(item => {
                creationMethodBreakdown[item._id] = item.count;
            });
            const result = {
                ...baseStats,
                creationMethodBreakdown,
                dateRange: {
                    start: startDate,
                    end: new Date()
                }
            };
            this.logger.info(mobile || 'system', `Session stats retrieved: ${result.totalSessions} total sessions`);
            return result;
        }
        catch (error) {
            this.logger.error(mobile || 'system', 'Failed to get session stats', error);
            throw error;
        }
    }
    async cleanupOldSessions(days = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const result = await this.sessionAuditModel.deleteMany({
                createdAt: { $lt: cutoffDate },
                isActive: false
            });
            this.logger.info('system', `Cleaned up ${result.deletedCount} old session records`);
            return { deletedCount: result.deletedCount };
        }
        catch (error) {
            this.logger.error('system', 'Failed to cleanup old sessions', error);
            throw error;
        }
    }
    async findRecentSessions(mobile, days = 30) {
        try {
            if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
                this.logger.warn('system', 'Invalid mobile number provided to findRecentSessions');
                return [];
            }
            if (days <= 0 || days > 365) {
                this.logger.warn(mobile, `Invalid days parameter: ${days}, using default 10 days`);
                days = 30;
            }
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            cutoffDate.setHours(0, 0, 0, 0);
            const recentSessions = await this.sessionAuditModel
                .find({
                mobile,
                isActive: true,
                status: { $in: [sessions_schema_1.SessionStatus.ACTIVE, sessions_schema_1.SessionStatus.CREATED] },
                $or: [
                    { lastUsedAt: { $gte: cutoffDate } },
                    {
                        lastUsedAt: { $exists: false },
                        createdAt: { $gte: cutoffDate }
                    }
                ]
            })
                .sort({ lastUsedAt: -1, createdAt: -1 })
                .limit(50)
                .exec();
            this.logger.info(mobile, `Found ${recentSessions.length} recent sessions from last ${days} days`);
            return recentSessions;
        }
        catch (error) {
            this.logger.error(mobile, `Failed to find valid session from last ${days} days`, error);
            throw error;
        }
    }
    async markExpiredSessions(inactiveDays = 7) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
            const result = await this.sessionAuditModel.updateMany({
                lastUsedAt: { $lt: cutoffDate },
                status: { $in: [sessions_schema_1.SessionStatus.CREATED, sessions_schema_1.SessionStatus.ACTIVE] },
                isActive: true
            }, {
                $set: {
                    status: sessions_schema_1.SessionStatus.EXPIRED,
                    isActive: false,
                    revokedAt: new Date(),
                    revocationReason: 'auto_expired_due_to_inactivity'
                }
            });
            this.logger.info('system', `Marked ${result.modifiedCount} sessions as expired`);
            return { modifiedCount: result.modifiedCount };
        }
        catch (error) {
            this.logger.error('system', 'Failed to mark expired sessions', error);
            throw error;
        }
    }
};
exports.SessionAuditService = SessionAuditService;
exports.SessionAuditService = SessionAuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(sessions_schema_1.SessionAudit.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], SessionAuditService);
//# sourceMappingURL=session-audit.service.js.map