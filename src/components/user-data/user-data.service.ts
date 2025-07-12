import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { parseError } from '../../utils/parseError';

@Injectable()
export class UserDataService {
    private callCounts: Map<string, number> = new Map();
    constructor(@InjectModel(UserData.name) private userDataModel: Model<UserDataDocument>) {}

    async create(createUserDataDto: CreateUserDataDto): Promise<UserData> {
        const createdUser = new this.userDataModel(createUserDataDto);
        return createdUser.save();
    }

    async findAll(): Promise<UserData[]> {
        return await this.userDataModel.find().exec();
    }

    async findOne(profile: string, chatId: string): Promise<UserData & { count?: number }> {
        const user = (await this.userDataModel.findOne({ profile, chatId }).exec())?.toJSON();
        if (!user) {
            console.warn(`UserData with ID "${profile} - ${chatId}" not found`);
        }
        const currentCount = this.callCounts.get(chatId) || 0;
        this.callCounts.set(chatId, currentCount + 1);
        if (user) {
            return { ...user, count: this.callCounts.get(chatId) };
        } else {
            return undefined
        }
    }

    clearCount(chatId?: string): string {
        if (chatId) {
            this.callCounts.delete(chatId);
            return `Count cleared for chatId: ${chatId}`;
        } else {
            this.callCounts.clear();
            return 'All counts cleared.';
        }
    }

    async update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData> {
        delete updateUserDataDto['_id']
        console.log(updateUserDataDto)
        const updatedUser = await this.userDataModel.findOneAndUpdate({ profile, chatId }, { $set: updateUserDataDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return updatedUser;
    }

    async updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<any> {
        delete updateUserDataDto['_id']
        const updatedUser = await this.userDataModel.updateMany({ chatId }, { $set: updateUserDataDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return updatedUser;
    }

    async remove(profile: string, chatId: string): Promise<UserData> {
        const deletedUser = await this.userDataModel.findOneAndDelete({ profile, chatId }).exec();
        if (!deletedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<UserData[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.userDataModel.find(filter).exec();
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<UserData[]> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            const queryExec = this.userDataModel.find(query);

            if (sort) {
                queryExec.sort(sort);
            }

            if (limit) {
                queryExec.limit(limit);
            }

            if (skip) {
                queryExec.skip(skip);
            }

            return await queryExec.exec();
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    async resetPaidUsers() {
        try {
            const entry = await this.userDataModel.updateMany({ $and: [{ payAmount: { $gt: 10 }, totalCount: { $gt: 30 } }] }, {
                $set: {
                    totalCount: 10,
                    limitTime: Date.now(),
                    paidReply: true
                }
            });
        } catch (error) {
            parseError(error)
        }
    }

    async incrementTotalCount(profile: string, chatId: string, amount: number = 1): Promise<UserData> {
        const updatedUser = await this.userDataModel.findOneAndUpdate(
            { profile, chatId },
            { $inc: { totalCount: amount } },
            { new: true }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }

    async incrementPayAmount(profile: string, chatId: string, amount: number): Promise<UserData> {
        const updatedUser = await this.userDataModel.findOneAndUpdate(
            { profile, chatId },
            { $inc: { payAmount: amount } },
            { new: true }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }

    async updateLastActive(profile: string, chatId: string): Promise<UserData> {
        return await this.userDataModel.findOneAndUpdate(
            { profile, chatId },
            { $set: { lastActiveTime: new Date() } },
            { new: true }
        ).exec();
    }

    async findInactiveSince(date: Date): Promise<UserData[]> {
        return await this.userDataModel.find({
            lastActiveTime: { $lt: date }
        }).exec();
    }

    async findByPaymentRange(minAmount: number, maxAmount: number): Promise<UserData[]> {
        return await this.userDataModel.find({
            payAmount: {
                $gte: minAmount,
                $lte: maxAmount
            }
        }).exec();
    }

    async bulkUpdateUsers(filter: any, update: any): Promise<any> {
        try {
            const result = await this.userDataModel.updateMany(
                filter,
                update,
                { new: true }
            ).exec();
            return result;
        } catch (error) {
            throw new InternalServerErrorException(parseError(error));
        }
    }

    async findActiveUsers(threshold: number = 30): Promise<UserData[]> {
        return await this.userDataModel.find({
            totalCount: { $gt: threshold }
        }).sort({ totalCount: -1 }).exec();
    }

    async resetUserCounts(profile: string, chatId: string): Promise<UserData> {
        return await this.userDataModel.findOneAndUpdate(
            { profile, chatId },
            {
                $set: {
                    totalCount: 0,
                    limitTime: new Date(),
                    paidReply: false
                }
            },
            { new: true }
        ).exec();
    }
}
