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
exports.ConfigurationService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ConfigurationService = class ConfigurationService {
    constructor(configurationModel) {
        this.configurationModel = configurationModel;
        this.setEnv();
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async findOne() {
        const user = await this.configurationModel.findOne({}).exec();
        if (!user) {
            throw new common_1.NotFoundException(`configurationModel not found`);
        }
        return user;
    }
    async setEnv() {
        console.log("Setting Envs");
        const configuration = await this.configurationModel.findOne({}, { _id: 0 });
        const data = { ...configuration };
        for (const key in data) {
            console.log('setting', key);
            process.env[key] = data[key];
        }
        console.log("finished setting env");
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.configurationModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`configurationModel not found`);
        }
        return updatedUser;
    }
};
exports.ConfigurationService = ConfigurationService;
exports.ConfigurationService = ConfigurationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('configurationModule')),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ConfigurationService);
//# sourceMappingURL=init.service.js.map