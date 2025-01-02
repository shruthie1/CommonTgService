import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { parseError } from '../../utils';

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

        // Return user with appended call count
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
}
