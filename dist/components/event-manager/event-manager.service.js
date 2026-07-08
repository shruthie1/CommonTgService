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
var EventManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventManagerService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const event_schema_1 = require("./schemas/event.schema");
const utils_1 = require("../../utils");
let EventManagerService = EventManagerService_1 = class EventManagerService {
    constructor(eventModel) {
        this.eventModel = eventModel;
        this.logger = new utils_1.Logger(EventManagerService_1.name);
    }
    async create(dto) {
        try {
            if (dto.clientId && dto.chatId && dto.type) {
                const result = await this.eventModel.create(dto);
                this.logger.log(` ${dto.clientId.toUpperCase()}: Event '${dto.type}' scheduled for ${dto.time}`);
                return result;
            }
            else {
                this.logger.warn('Bad event format');
            }
        }
        catch (error) {
            this.logger.error('Error creating event', error);
        }
    }
    async createMultiple(events) {
        try {
            const validEvents = events.filter(e => e.clientId && e.chatId && e.type);
            if (validEvents.length > 0) {
                const result = await this.eventModel.insertMany(validEvents);
                validEvents.forEach(e => {
                    this.logger.log(` ${e.clientId.toUpperCase()}: Event '${e.type}' scheduled for ${e.time}`);
                });
                return result;
            }
            else {
                this.logger.warn('No valid events to insert.');
            }
        }
        catch (error) {
            this.logger.error('Error inserting events', error);
        }
    }
    async deleteMultiple(chatId) {
        try {
            const result = await this.eventModel.deleteMany({ chatId });
            return result.deletedCount;
        }
        catch (error) {
            this.logger.error('Error deleting events', error);
            return 0;
        }
    }
    async getEvents(filter) {
        try {
            return await this.eventModel.find(filter).lean();
        }
        catch (error) {
            this.logger.error('Error fetching events', error);
            return [];
        }
    }
    async getEventById(id) {
        try {
            return await this.eventModel.findById(id).lean();
        }
        catch (error) {
            this.logger.error(`Error fetching event by id: ${id}`, error);
            return null;
        }
    }
    async schedulePaidEvents(chatId, clientId, type = '1') {
        this.logger.log(`received req for ${chatId} ${clientId} ${type}`);
        const existingEvents = await this.getEvents({ chatId, clientId });
        if (existingEvents.length > 0) {
            return { message: `Events already exists for ${clientId} | Chatid: ${chatId}` };
        }
        const now = Date.now();
        let events = [];
        const MIN = 60 * 1000;
        const SCALE = 0.7;
        const at = (mins) => now + Math.round(mins * SCALE * MIN);
        const call = (mins) => ({ type: 'call', chatId, time: at(mins), payload: {}, clientId });
        const msg = (mins, message) => ({ type: 'message', chatId, time: at(mins), payload: { message }, clientId });
        const link = `https://ZomCall.netlify.app/${clientId}/${chatId}`;
        const zoom = `<a href="${link}">Zoom Link</a>`;
        const callMeVariants = [
            `<b>Call me here</b>

${zoom}`,
            `Call me on zoom

${zoom}`,
            `Click link to Call me 💕

${zoom}`,
            `Waiting for u 🥹

${zoom}`,
            `Call me on this link baby 😚

${zoom}`,
            `<b>open this link!</b>

${zoom}`,
            `I'm Calling here 💋

${zoom}`,
            `Just Call me na 🙈 

${zoom}`,
        ];
        let callMeIdx = 0;
        const callMe = () => callMeVariants[callMeIdx++ % callMeVariants.length];
        if (type === '1') {
            events = [
                call(1.5),
                msg(2.2, "wait wait 🥺\n<b>i'm calling you again</b>"),
                call(2.5),
                msg(3.2, "ughh is your network okay?? 😩\nthe call keeps <b>dropping</b>\nit's not connecting 😔"),
                call(3.5),
                msg(4.2, "must be some <b>network issue</b> baby 😔\ndon't worry okay, i'm <b>not cheating</b> you 🙏\ni'll keep trying.. just give me a sec"),
                msg(4.7, "and <b>don't talk</b> when we connect okk 🙈\ni'm in the bathroom, keep yourself on <b>mute</b>\ni'll show you everything on the call 😉"),
                msg(5, `okay try calling ME here instead babe 🥰\n\n${zoom}\n\n<b>call me now na</b>`),
                msg(6, `come on, call me on this one 😘\nit <b>actually works</b>\n\n${zoom}`),
                msg(7, `call me here baby 💋\ni'm <b>waiting</b>\n\n${zoom}`),
                msg(8, `only call me on <b>this link</b> okay? 🙈\n\n${zoom}`),
                msg(11, `babe you there?? 🥹\njust open this and <b>call me</b>\n\n${zoom}`),
                msg(13, "same problem 😭\nnormal call still <b>won't connect</b>\nplease believe me na, i'm <b>not going anywhere</b>\ni'll give you the <b>full show</b> today pakka 💕\njust come to the link okay?"),
                call(15), msg(15.5, callMe()),
                call(20), msg(20.5, callMe()),
                call(30), msg(30.5, callMe()),
                call(45), msg(45.5, callMe()),
            ];
        }
        else if (type === '2') {
            events = [
                msg(1, "wait 🥺\n<b>let me try you again</b>"),
                call(1.5),
                msg(2, `okay this normal call really <b>isn't working</b> 😩\njust call me here instead babe 😚\n\n${zoom}\n\n<b>call me now na</b>`),
                call(4), msg(4.5, callMe()),
                call(6.5), msg(7, callMe()),
                call(9), msg(9.5, callMe()),
                call(12), msg(12.5, callMe()),
                call(15), msg(15.5, callMe()),
                call(20), msg(20.5, callMe()),
                call(30), msg(30.5, callMe()),
                call(45), msg(45.5, callMe()),
            ];
        }
        else {
            events = [
                msg(1, callMe()),
                call(4), msg(4.5, callMe()),
                call(6.5), msg(7, callMe()),
                call(9), msg(9.5, callMe()),
                call(12), msg(12.5, callMe()),
                call(15), msg(15.5, callMe()),
                call(20), msg(20.5, callMe()),
                call(30), msg(30.5, callMe()),
                call(45), msg(45.5, callMe()),
            ];
        }
        await this.createMultiple(events);
        return { message: `scheduled events for ${clientId} | Chatid: ${chatId}` };
    }
};
exports.EventManagerService = EventManagerService;
exports.EventManagerService = EventManagerService = EventManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(event_schema_1.Event.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], EventManagerService);
//# sourceMappingURL=event-manager.service.js.map