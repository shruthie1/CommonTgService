import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, UpdateQuery } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { parseError } from '../../utils/parseError';
import { getBotsServiceInstance, Logger } from '../../utils';
import { ChannelCategory } from '../bots';

@Injectable()
export class UserDataService {
    private callCounts: Map<string, number> = new Map();
    private logger = new Logger(UserDataService.name)
    constructor(
        @InjectModel(UserData.name) private readonly userDataModel: Model<UserDataDocument>,
    ) { }

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

    async findOne(profile: string, chatId: string): Promise<UserDataDocument & { count?: number }> {
        const user = await this.userDataModel.findOne({ profile, chatId }).lean().exec();

        if (!user) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }

        const currentCount = (this.callCounts.get(chatId) || 0) + 1;
        this.callCounts.set(chatId, currentCount);

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
        delete (updateUserDataDto as any)._id;

        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $set: updateUserDataDto }, { new: true, upsert: true })
            .lean()
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }

        return updatedUser;
    }

    async updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto) {
        delete (updateUserDataDto as any)._id;

        return this.userDataModel
            .updateMany({ chatId }, { $set: updateUserDataDto }, { new: true, upsert: true })
            .exec();
    }

    async remove(profile: string, chatId: string): Promise<UserDataDocument> {
        const botsService = getBotsServiceInstance();
        if (botsService) {
            botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Deleting UserData with profile ${profile} and chatId ${chatId}`);
        }
        const deletedUser = await this.userDataModel.findOneAndDelete({ profile, chatId }).lean().exec();
        if (!deletedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<UserDataDocument[]> {
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        return this.userDataModel.find(filter).lean().exec();
    }

    async executeQuery(
        query: FilterQuery<UserDataDocument>,
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
            return await this.userDataModel.updateMany(filter, update, { new: true }).exec();
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
