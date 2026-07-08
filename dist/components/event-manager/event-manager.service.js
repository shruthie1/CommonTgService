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
            `<b>call me here</b> 👉 ${zoom}`,
            `come na, call me 🥺 ${zoom}`,
            `tap & call me 💕 ${zoom}`,
            `waiting for u 🥹 ${zoom}`,
            `call me on this baby 😚 ${zoom}`,
            `<b>open this</b> 👉 ${zoom}`,
            `i'm right here 💋 ${zoom}`,
            `just call me na 🙈 ${zoom}`,
        ];
        let callMeIdx = 0;
        const callMe = () => callMeVariants[callMeIdx++ % callMeVariants.length];
        if (type === '1') {
            events = [
                call(1.5),
                msg(2.2, "wait wait i'm calling you again 🥺"),
                call(2.5),
                msg(3.2, "ughh is your network okay? the call keeps dropping 😩 it's not connecting"),
                call(3.5),
                msg(4.2, "must be some network issue baby 😔 don't worry okay, i'm not cheating you, i'll keep trying.. just give me a sec 🙏"),
                msg(4.7, "and don't talk when we connect okk, i'm in the bathroom 🙈 keep yourself on mute, i'll show you everything on the call 😉"),
                msg(5, `okay try calling ME here instead babe 👉 ${zoom}\ncall me now na 🥰`),
                msg(6, `come on, call me on this one, it actually works 😘 ${zoom}`),
                msg(7, `call me here baby, i'm waiting 💋 ${zoom}`),
                msg(8, `only call me on this link okay? 🙈 ${zoom}`),
                msg(11, `babe you there?? just open this and call me 👉 ${zoom}`),
                msg(13, "same problem, normal call still won't connect 😭 please believe me na, i'm not going anywhere.. i'll give you the full show today pakka 💕 just come to the link, okay?"),
                call(15), msg(15.5, callMe()),
                call(20), msg(20.5, callMe()),
                call(30), msg(30.5, callMe()),
                call(45), msg(45.5, callMe()),
            ];
        }
        else if (type === '2') {
            events = [
                msg(1, "wait let me try you again 🥺"),
                call(1.5),
                msg(2, `okay this normal call really isn't working 😩 just call me here instead babe 👉 ${zoom}\ncall me now na 😚`),
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