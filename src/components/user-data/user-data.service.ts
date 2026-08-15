import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, UpdateQuery } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { parseError } from '../../utils/parseError';
import { getBotsServiceInstance, Logger } from '../../utils';
import { ChannelCategory } from '../bots';

@Injectable()
export class UserDataService {
    private callCounts: Map<string, number> = new Map();
    // Bound the in-process call counter so it can't grow unbounded (one entry per
    // distinct chatId ever fetched). Map preserves insertion order, so we evict
    // the oldest entries once we exceed the cap.
    private static readonly MAX_CALL_COUNTS = 5000;
    private logger = new Logger(UserDataService.name)
    constructor(
        @InjectModel(UserData.name) private readonly userDataModel: Model<UserDataDocument>,
    ) { }

    private recordCall(chatId: string): number {
        const currentCount = (this.callCounts.get(chatId) || 0) + 1;
        // Re-insert at the end (most-recently-used) to keep eviction order meaningful.
        this.callCounts.delete(chatId);
        this.callCounts.set(chatId, currentCount);
        if (this.callCounts.size > UserDataService.MAX_CALL_COUNTS) {
            const oldest = this.callCounts.keys().next().value;
            if (oldest !== undefined) this.callCounts.delete(oldest);
        }
        return currentCount;
    }

    async create(createUserDataDto: CreateUserDataDto): Promise<UserDataDocument> {
        try {
            return await this.userDataModel.create(createUserDataDto);
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async findAll(limit: number = 99): Promise<UserDataDocument[]> {
        return this.userDataModel.find().limit(limit).lean().exec();
    }

    /**
     * Resolve a clientId (e.g. "shruthi2") to its persona/dbcoll (e.g. "shruthi").
     *
     * Read through the existing mongoose connection rather than injecting ClientService — this
     * module is imported widely and a service-level dependency here has previously produced a DI
     * cycle at boot. Cached because clients change rarely and this sits on a hot read path.
     */
    private clientIdToProfile = new Map<string, string>();
    private clientMapLoadedAt = 0;
    private async resolveProfileForClientId(candidate: string): Promise<string | null> {
        const key = candidate.trim();
        if (!key) return null;
        const FIVE_MIN = 5 * 60 * 1000;
        if (Date.now() - this.clientMapLoadedAt > FIVE_MIN) {
            try {
                const rows = await this.userDataModel.db
                    .collection('clients')
                    .find({}, { projection: { clientId: 1, dbcoll: 1, _id: 0 } })
                    .toArray();
                this.clientIdToProfile = new Map(
                    rows
                        .filter((r: any) => typeof r?.clientId === 'string' && typeof r?.dbcoll === 'string')
                        .map((r: any) => [r.clientId, r.dbcoll]),
                );
                this.clientMapLoadedAt = Date.now();
            } catch (error) {
                // Best-effort: a lookup failure must not break the legacy profile path below.
                this.logger.warn(`clientId->profile map refresh failed: ${parseError(error).message}`);
            }
        }
        return this.clientIdToProfile.get(key) ?? null;
    }

    /**
     * Fetch a user row by chatId, accepting EITHER a clientId or a persona/profile in the first
     * param — deliberately widening, so every existing caller keeps working unchanged.
     *
     * Background: `userData` is keyed (chatId, profile) where profile = dbcoll = PERSONA, but each
     * persona is served by TWO independent Telegram accounts (shruthi1 @ShruGow1364 and shruthi2
     * @ShruGow2646 — 20 clients, 20 distinct mobiles/usernames). Callers such as vcui hold a real
     * clientId and today strip its digits (`.replace(/\d/g,'')`) purely to make this lookup resolve.
     * Accepting the clientId directly removes the need for that workaround; once callers are
     * updated, a client-owned row is preferred and the persona row remains the fallback.
     */
    async findOne(identifier: string, chatId: string): Promise<(UserData & { _id: import('mongoose').Types.ObjectId; count?: number })> {
        const resolvedProfile = await this.resolveProfileForClientId(identifier);

        // A clientId was supplied: prefer a row this client owns, else fall back to the persona row
        // (which is what every pre-split row is). A profile was supplied: behave exactly as before.
        const user = resolvedProfile
            ? (await this.userDataModel.findOne({ clientId: identifier, chatId }).lean().exec()
                ?? await this.userDataModel.findOne({ profile: resolvedProfile, chatId }).lean().exec())
            : await this.userDataModel.findOne({ profile: identifier, chatId }).lean().exec();

        if (!user) {
            throw new NotFoundException(`UserData with profile "${identifier}" and chatId "${chatId}" not found`);
        }

        const currentCount = this.recordCall(chatId);

        return { ...user, count: currentCount };
    }

    clearCount(chatId?: string): string {
        if (chatId) {
            this.callCounts.delete(chatId);
            return `Count cleared for chatId: ${chatId}`;
        }
        this.callCounts.clear();
        return 'All counts cleared.';
    }

    async update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserDataDocument> {
        const sanitizedDto = { ...updateUserDataDto } as Record<string, unknown>;
        delete (sanitizedDto as any)._id;
        delete (sanitizedDto as any).profile;
        delete (sanitizedDto as any).chatId;
        
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $set: sanitizedDto }, { new: true, upsert: false })
            .lean()
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }

        return updatedUser;
    }

    async updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto) {
        const sanitizedDto = { ...updateUserDataDto } as Record<string, unknown>;
        delete (sanitizedDto as any)._id;

        return this.userDataModel
            .updateMany({ chatId }, { $set: sanitizedDto })
            .exec();
    }

    async remove(profile: string, chatId: string): Promise<UserDataDocument> {
        const botsService = getBotsServiceInstance();
        if (botsService) {
            botsService.sendMessageByCategory(
                ChannelCategory.PROM_LOGS2,
                `Deleting UserData: ${profile} (chat ${chatId})`,
            );
        }
        const deletedUser = await this.userDataModel.findOneAndDelete({ profile, chatId }).lean().exec();
        if (!deletedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<UserDataDocument[]> {
        const searchFilter = { ...filter };
        if (searchFilter.firstName) {
            searchFilter.firstName = { $regex: new RegExp(String(searchFilter.firstName), 'i') };
        }
        return this.userDataModel.find(searchFilter).lean().exec();
    }

    async executeQuery(
        query: QueryFilter<UserDataDocument>,
        sort?: Record<string, 1 | -1>,
        limit?: number,
        skip?: number,
    ): Promise<UserDataDocument[]> {
        const startTime = Date.now();
        if (!query) {
            throw new BadRequestException('Query is invalid.');
        }

        try {
            let q = this.userDataModel.find(query);

            if (sort) q = q.sort(sort);
            if (limit) q = q.limit(limit);
            if (skip) q = q.skip(skip);

            const result = await q.lean().exec();
            this.logger.log(`Query Execution Duration: ${Date.now() - startTime}Ms`)
            return result
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async resetPaidUsers() {
        try {
            return await this.userDataModel.updateMany(
                { payAmount: { $gt: 10 }, totalCount: { $gt: 30 } },
                {
                    $set: {
                        totalCount: 10,
                        limitTime: Date.now(),
                        paidReply: true,
                    },
                },
            ).exec();
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async incrementTotalCount(profile: string, chatId: string, amount: number = 1): Promise<UserDataDocument> {
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $inc: { totalCount: amount } }, { new: true })
            .lean()
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }

    async incrementPayAmount(profile: string, chatId: string, amount: number): Promise<UserDataDocument> {
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $inc: { payAmount: amount } }, { new: true })
            .lean()
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }

    async updateLastActive(profile: string, chatId: string): Promise<UserDataDocument> {
        return this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $set: { lastActiveTime: new Date() } }, { new: true })
            .lean()
            .exec();
    }

    async findInactiveSince(date: Date): Promise<UserDataDocument[]> {
        return this.userDataModel.find({ lastActiveTime: { $lt: date } }).lean().exec();
    }

    async findByPaymentRange(minAmount: number, maxAmount: number): Promise<UserDataDocument[]> {
        return this.userDataModel.find({ payAmount: { $gte: minAmount, $lte: maxAmount } }).lean().exec();
    }

    async bulkUpdateUsers(filter: any, update: UpdateQuery<UserDataDocument>) {
        try {
            return await this.userDataModel.updateMany(filter, update, { upsert: false }).exec();
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async findActiveUsers(threshold: number = 30): Promise<UserDataDocument[]> {
        return this.userDataModel.find({ totalCount: { $gt: threshold } }).sort({ totalCount: -1 }).lean().exec();
    }

    async removeRedundantData(): Promise<{ deletedCount: number }> {
        // 30 days in milliseconds
        const twoMonths = Date.now() - 60 * 24 * 60 * 60 * 1000;

        try {
            const result = await this.userDataModel
                .deleteMany({ lastMsgTimeStamp: { $lt: twoMonths }, payAmount: 0, canReply: 1 })
                .exec();

            return { deletedCount: result.deletedCount ?? 0 };
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async resetUserCounts(profile: string, chatId: string): Promise<UserDataDocument> {
        return this.userDataModel
            .findOneAndUpdate(
                { profile, chatId },
                {
                    $set: {
                        totalCount: 0,
                        limitTime: new Date(),
                        paidReply: false,
                    },
                },
                { new: true },
            )
            .lean()
            .exec();
    }
}
