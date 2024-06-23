import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';

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

    async findOne(chatId: string): Promise<UserData> {
        const user = await this.userDataModel.findOne({chatId}).exec();
        if (!user) {
            throw new NotFoundException(`UserData with ID "${chatId}" not found`);
        }
        return user;
    }

    async update(chatId: string, updateUserDataDto: Partial<UserData>): Promise<UserData> {
        delete updateUserDataDto['_id']
        const updatedUser = await this.userDataModel.findOneAndUpdate({chatId}, { $set: updateUserDataDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new NotFoundException(`UserData with ID "${chatId}" not found`);
        }
        return updatedUser;
    }

    async remove(chatId: string): Promise<UserData> {
        const deletedUser = await this.userDataModel.findOneAndDelete({chatId}).exec();
        if (!deletedUser) {
            throw new NotFoundException(`UserData with ID "${chatId}" not found`);
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

  async executeQuery(query: any): Promise<any> {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      return await this.userDataModel.find(query).exec();
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
