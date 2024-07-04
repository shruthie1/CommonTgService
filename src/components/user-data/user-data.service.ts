import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { parseError } from '../../utils';

@Injectable()
export class UserDataService {
    constructor(@InjectModel(UserData.name) private userDataModel: Model<UserDataDocument>) { }

    async create(createUserDataDto: CreateUserDataDto): Promise<UserData> {
        const createdUser = new this.userDataModel(createUserDataDto);
        return createdUser.save();
    }

    async findAll(): Promise<UserData[]> {
        return this.userDataModel.find().exec();
    }

    async findOne(profile: string, chatId: string): Promise<UserData> {
        const user = await this.userDataModel.findOne({ profile, chatId }).exec();
        if (!user) {
            console.warn(`UserData with ID "${profile} - ${chatId}" not found`);
        }
        return user;
    }

    async update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData> {
        delete updateUserDataDto['_id']
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
