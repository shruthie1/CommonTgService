import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionAudit, SessionAuditDocument, SessionStatus, SessionCreationMethod } from './schemas/sessions.schema';
import { CreateSessionAuditDto, UpdateSessionAuditDto, SessionAuditQueryDto, SessionAuditStatsDto } from './dto/session-audit.dto';
import { TelegramLogger } from '../Telegram/utils/telegram-logger';

@Injectable()
export class SessionAuditService {
    private readonly logger: TelegramLogger;

    constructor(
        @InjectModel(SessionAudit.name) private sessionAuditModel: Model<SessionAuditDocument>,
    ) {
        this.logger = TelegramLogger.getInstance();
    }

    /**
     * Create a new session audit record
     */
    async createAuditRecord(createDto: CreateSessionAuditDto): Promise<SessionAudit> {
        try {
            this.logger.logOperation(createDto.mobile, 'Creating session audit record');

            const sessionAudit = new this.sessionAuditModel({
                ...createDto,
                status: SessionStatus.CREATED,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                usageCount: 0,
                isActive: true
            });

            const savedRecord = await sessionAudit.save();
            this.logger.logOperation(createDto.mobile, `Session audit record created with ID: ${savedRecord.id}`);

            return savedRecord;
        } catch (error) {
            this.logger.logError(createDto.mobile, 'Failed to create session audit record', error);
            throw error;
        }
    }

    /**
     * Update an existing session audit record
     */
    async updateAuditRecord(
        mobile: string,
        sessionString: string | undefined,
        updateDto: UpdateSessionAuditDto
    ): Promise<SessionAudit | null> {
        try {
            this.logger.logOperation(mobile, 'Updating session audit record');

            // Auto-update lastUsedAt when updating session
            const updateData = {
                ...updateDto,
                lastUsedAt: new Date()
            };

            // Build query - if sessionString is provided, use it; otherwise find the latest record
            const query: any = { mobile, isActive: true };
            if (sessionString) {
                query.sessionString = sessionString;
            }

            const updatedRecord = await this.sessionAuditModel.findOneAndUpdate(
                query,
                { $set: updateData },
                { new: true, sort: { createdAt: -1 } } // Sort by creation time to get the latest if no sessionString
            );

            if (updatedRecord) {
                this.logger.logOperation(mobile, `Session audit record updated: ${updatedRecord.id}`);
            } else {
                this.logger.logOperation(mobile, 'No active session audit record found to update');
            }

            return updatedRecord;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to update session audit record', error);
            throw error;
        }
    }

    /**
     * Mark session as used (increment usage count and update lastUsedAt)
     */
    async markSessionUsed(mobile: string, sessionString?: string): Promise<SessionAudit | null> {
        try {
            const query: any = { mobile, isActive: true };
            if (sessionString) {
                query.sessionString = sessionString;
            }

            const updatedRecord = await this.sessionAuditModel.findOneAndUpdate(
                query,
                {
                    $inc: { usageCount: 1 },
                    $set: { lastUsedAt: new Date() }
                },
                { new: true, sort: { createdAt: -1 } } // Get the latest session if no sessionString provided
            );

            if (updatedRecord) {
                this.logger.logOperation(mobile, `Session usage recorded: count ${updatedRecord.usageCount}`);
            }

            return updatedRecord;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to mark session as used', error);
            throw error;
        }
    }

    /**
     * Mark session as failed with error
     */
    async markSessionFailed(
        mobile: string,
        sessionString: string | undefined,
        errorMessage: string
    ): Promise<SessionAudit | null> {
        try {
            return await this.updateAuditRecord(mobile, sessionString, {
                status: SessionStatus.FAILED,
                errorMessage,
                lastError: errorMessage,
                isActive: false
            });
        } catch (error) {
            this.logger.logError(mobile, 'Failed to mark session as failed', error);
            throw error;
        }
    }

    /**
     * Revoke/deactivate a session
     */
    async revokeSession(
        mobile: string,
        sessionString: string,
        reason: string = 'manual_revocation'
    ): Promise<SessionAudit | null> {
        try {
            return await this.updateAuditRecord(mobile, sessionString, {
                status: SessionStatus.REVOKED,
                revocationReason: reason,
                revokedAt: new Date(),
                isActive: false
            });
        } catch (error) {
            this.logger.logError(mobile, 'Failed to revoke session', error);
            throw error;
        }
    }

    /**
     * Get all sessions for a phone number
     */
    async getSessionsFormobile(mobile: string, activeOnly: boolean = false): Promise<SessionAudit[]> {
        try {
            const query: any = { mobile };
            if (activeOnly) {
                query.isActive = true;
            }

            const sessions = await this.sessionAuditModel
                .find(query)
                .sort({ createdAt: -1 })
                .exec();

            this.logger.logOperation(mobile, `Retrieved ${sessions.length} session records`);
            return sessions;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to get sessions for phone number', error);
            throw error;
        }
    }

    /**
     * Get the latest active session for a phone number
     */
    async getLatestActiveSession(mobile: string): Promise<SessionAudit | null> {
        try {
            const session = await this.sessionAuditModel
                .findOne({ mobile, isActive: true })
                .sort({ createdAt: -1 })
                .exec();

            if (session) {
                this.logger.logOperation(mobile, `Latest active session found: ${session.id}`);
            }

            return session;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to get latest active session', error);
            throw error;
        }
    }

    /**
     * Query sessions with filters
     */
    async querySessionAudits(queryDto: SessionAuditQueryDto): Promise<{
        sessions: SessionAudit[];
        total: number;
        page: number;
        limit: number;
    }> {
        try {
            const {
                mobile,
                status,
                creationMethod,
                isActive,
                limit = 20,
                offset = 0,
                startDate,
                endDate
            } = queryDto;

            // Build query
            const query: any = {};
            if (mobile) query.mobile = mobile;
            if (status) query.status = status;
            if (creationMethod) query.creationMethod = creationMethod;
            if (isActive !== undefined) query.isActive = isActive;

            // Date range filter
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = startDate;
                if (endDate) query.createdAt.$lte = endDate;
            }

            // Execute query with pagination
            const [sessions, total] = await Promise.all([
                this.sessionAuditModel
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)
                    .exec(),
                this.sessionAuditModel.countDocuments(query)
            ]);

            this.logger.logOperation('system', `Session audit query returned ${sessions.length} of ${total} records`);

            return {
                sessions,
                total,
                page: Math.floor(offset / limit) + 1,
                limit
            };
        } catch (error) {
            this.logger.logError('system', 'Failed to query session audits', error);
            throw error;
        }
    }

    /**
     * Get session audit statistics
     */
    async getSessionStats(mobile?: string, days: number = 30): Promise<SessionAuditStatsDto> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const query: any = { createdAt: { $gte: startDate } };
            if (mobile) {
                query.mobile = mobile;
            }

            // Aggregate statistics
            const stats = await this.sessionAuditModel.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalSessions: { $sum: 1 },
                        activeSessions: {
                            $sum: { $cond: [{ $eq: ['$status', SessionStatus.ACTIVE] }, 1, 0] }
                        },
                        expiredSessions: {
                            $sum: { $cond: [{ $eq: ['$status', SessionStatus.EXPIRED] }, 1, 0] }
                        },
                        revokedSessions: {
                            $sum: { $cond: [{ $eq: ['$status', SessionStatus.REVOKED] }, 1, 0] }
                        },
                        failedSessions: {
                            $sum: { $cond: [{ $eq: ['$status', SessionStatus.FAILED] }, 1, 0] }
                        }
                    }
                }
            ]);

            // Get creation method breakdown
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

            const creationMethodBreakdown: Record<string, number> = {};
            methodBreakdown.forEach(item => {
                creationMethodBreakdown[item._id] = item.count;
            });

            const result: SessionAuditStatsDto = {
                ...baseStats,
                creationMethodBreakdown,
                dateRange: {
                    start: startDate,
                    end: new Date()
                }
            };

            this.logger.logOperation(mobile || 'system', `Session stats retrieved: ${result.totalSessions} total sessions`);
            return result;
        } catch (error) {
            this.logger.logError(mobile || 'system', 'Failed to get session stats', error);
            throw error;
        }
    }

    /**
     * Clean up old session records (older than specified days)
     */
    async cleanupOldSessions(days: number = 90): Promise<{ deletedCount: number }> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const result = await this.sessionAuditModel.deleteMany({
                createdAt: { $lt: cutoffDate },
                isActive: false
            });

            this.logger.logOperation('system', `Cleaned up ${result.deletedCount} old session records`);
            return { deletedCount: result.deletedCount };
        } catch (error) {
            this.logger.logError('system', 'Failed to cleanup old sessions', error);
            throw error;
        }
    }

    async findRecentSessions(mobile: string): Promise<SessionAudit[]> {
        try {
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
            tenDaysAgo.setHours(0, 0, 0, 0);
            const recentSessions = await this.sessionAuditModel
                .find({
                    mobile,
                    isActive: true,
                    status: { $in: [SessionStatus.ACTIVE, SessionStatus.CREATED] },
                    $or: [
                        { lastUsedAt: { $gte: tenDaysAgo } },
                        {
                            lastUsedAt: { $exists: false },
                            createdAt: { $gte: tenDaysAgo }
                        }
                    ]
                })
                .sort({ lastUsedAt: -1, createdAt: -1 })
                .exec();
            return recentSessions;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to find valid session from last 10 days', error);
            throw error;
        }
    }

    /**
     * Mark expired sessions as expired (sessions not used in X days)
     */
    async markExpiredSessions(inactiveDays: number = 7): Promise<{ modifiedCount: number }> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

            const result = await this.sessionAuditModel.updateMany(
                {
                    lastUsedAt: { $lt: cutoffDate },
                    status: { $in: [SessionStatus.CREATED, SessionStatus.ACTIVE] },
                    isActive: true
                },
                {
                    $set: {
                        status: SessionStatus.EXPIRED,
                        isActive: false,
                        revokedAt: new Date(),
                        revocationReason: 'auto_expired_due_to_inactivity'
                    }
                }
            );

            this.logger.logOperation('system', `Marked ${result.modifiedCount} sessions as expired`);
            return { modifiedCount: result.modifiedCount };
        } catch (error) {
            this.logger.logError('system', 'Failed to mark expired sessions', error);
            throw error;
        }
    }
}
