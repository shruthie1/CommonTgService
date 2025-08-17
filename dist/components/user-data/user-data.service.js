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
exports.UserDataService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_data_schema_1 = require("./schemas/user-data.schema");
const parseError_1 = require("../../utils/parseError");
let UserDataService = class UserDataService {
    constructor(userDataModel) {
        this.userDataModel = userDataModel;
        this.callCounts = new Map();
    }
    async create(createUserDataDto) {
        try {
            return await this.userDataModel.create(createUserDataDto);
        }
        catch (error) {
            throw new common_1.InternalServerErrorException((0, parseError_1.parseError)(error));
        }
    }
    async findAll(limit = 99) {
        return this.userDataModel.find().limit(limit).lean().exec();
    }
    async findOne(profile, chatId) {
        const user = await this.userDataModel.findOne({ profile, chatId }).lean().exec();
        if (!user) {
            throw new common_1.NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        const currentCount = (this.callCounts.get(chatId) || 0) + 1;
        this.callCounts.set(chatId, currentCount);
        return { ...user, count: currentCount };
    }
    clearCount(chatId) {
        if (chatId) {
            this.callCounts.delete(chatId);
            return `Count cleared for chatId: ${chatId}`;
        }
        this.callCounts.clear();
        return 'All counts cleared.';
    }
    async update(profile, chatId, updateUserDataDto) {
        delete updateUserDataDto._id;
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $set: updateUserDataDto }, { new: true, upsert: true })
            .lean()
            .exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }
    async updateAll(chatId, updateUserDataDto) {
        delete updateUserDataDto._id;
        return this.userDataModel
            .updateMany({ chatId }, { $set: updateUserDataDto }, { new: true, upsert: true })
            .exec();
    }
    async remove(profile, chatId) {
        const deletedUser = await this.userDataModel.findOneAndDelete({ profile, chatId }).lean().exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        return this.userDataModel.find(filter).lean().exec();
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query) {
            throw new common_1.BadRequestException('Query is invalid.');
        }
        try {
            let q = this.userDataModel.find(query);
            if (sort)
                q = q.sort(sort);
            if (limit)
                q = q.limit(limit);
            if (skip)
                q = q.skip(skip);
            return await q.lean().exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException((0, parseError_1.parseError)(error));
        }
    }
    async resetPaidUsers() {
        try {
            return await this.userDataModel.updateMany({ payAmount: { $gt: 10 }, totalCount: { $gt: 30 } }, {
                $set: {
                    totalCount: 10,
                    limitTime: Date.now(),
                    paidReply: true,
                },
            }).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException((0, parseError_1.parseError)(error));
        }
    }
    async incrementTotalCount(profile, chatId, amount = 1) {
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $inc: { totalCount: amount } }, { new: true })
            .lean()
            .exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }
    async incrementPayAmount(profile, chatId, amount) {
        const updatedUser = await this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $inc: { payAmount: amount } }, { new: true })
            .lean()
            .exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`UserData with profile "${profile}" and chatId "${chatId}" not found`);
        }
        return updatedUser;
    }
    async updateLastActive(profile, chatId) {
        return this.userDataModel
            .findOneAndUpdate({ profile, chatId }, { $set: { lastActiveTime: new Date() } }, { new: true })
            .lean()
            .exec();
    }
    async findInactiveSince(date) {
        return this.userDataModel.find({ lastActiveTime: { $lt: date } }).lean().exec();
    }
    async findByPaymentRange(minAmount, maxAmount) {
        return this.userDataModel.find({ payAmount: { $gte: minAmount, $lte: maxAmount } }).lean().exec();
    }
    async bulkUpdateUsers(filter, update) {
        try {
            return await this.userDataModel.updateMany(filter, update, { new: true }).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException((0, parseError_1.parseError)(error));
        }
    }
    async findActiveUsers(threshold = 30) {
        return this.userDataModel.find({ totalCount: { $gt: threshold } }).sort({ totalCount: -1 }).lean().exec();
    }
    async removeOlderThanOneMonth() {
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        try {
            const result = await this.userDataModel
                .deleteMany({ lastMsgTimeStamp: { $lt: oneMonthAgo } })
                .exec();
            return { deletedCount: result.deletedCount ?? 0 };
        }
        catch (error) {
            throw new common_1.InternalServerErrorException((0, parseError_1.parseError)(error));
        }
    }
    async resetUserCounts(profile, chatId) {
        return this.userDataModel
            .findOneAndUpdate({ profile, chatId }, {
            $set: {
                totalCount: 0,
                limitTime: new Date(),
                paidReply: false,
            },
        }, { new: true })
            .lean()
            .exec();
    }
};
exports.UserDataService = UserDataService;
exports.UserDataService = UserDataService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_data_schema_1.UserData.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UserDataService);
//# sourceMappingURL=user-data.service.js.map