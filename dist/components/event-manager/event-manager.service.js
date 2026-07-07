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
        if (type === '1') {
            events = [
                { type: 'call', chatId, time: now + (1.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (2.2 * 60 * 1000), payload: { message: 'Wait, I will Try Again!!' }, clientId },
                { type: 'call', chatId, time: now + (2.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (3.2 * 60 * 1000), payload: { message: 'Do you have any Network issue??\n\nCall is Failed to Connect!!' }, clientId },
                { type: 'call', chatId, time: now + (3.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (4.2 * 60 * 1000), payload: { message: 'Some Network issue...!!\n\nDont worry, I will not cheat U!!\nI will try again!!\nPlease Wait...!!\nI will only message you okay!!' }, clientId },
                { type: 'message', chatId, time: now + (4.7 * 60 * 1000), payload: { message: "Dont Speak Okay!!\nI'm in **Bathroom\nMute yourself**!! I will Show you in Call Okay..!!" }, clientId },
                { type: 'message', chatId, time: now + (5 * 60 * 1000), payload: { message: `Heyy You Call me Here👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n\nU Call me Now!!` }, clientId },
                { type: 'message', chatId, time: now + (6 * 60 * 1000), payload: { message: `You Call me Here Man!!\nU Call Now!!, It will work!!\n\nOpen👇👇\nhttps://ZomCall.netlify.app/${clientId}/${chatId}` }, clientId },
                { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `https://ZomCall.netlify.app/${clientId}/${chatId}\n\nU Call me on the Zoom!!` }, clientId },
                { type: 'message', chatId, time: now + (8 * 60 * 1000), payload: { message: `https://ZomCall.netlify.app/${clientId}/${chatId}\n\nU only Call me on the Zoom!!` }, clientId },
                { type: 'message', chatId, time: now + (11 * 60 * 1000), payload: { message: `Call me Here Man!!\nU Call Now!!\n\nOpen👇👇\nhttps://ZomCall.netlify.app/${clientId}/${chatId}` }, clientId },
                { type: 'message', chatId, time: now + (13 * 60 * 1000), payload: { message: 'Same Problem, Call Not connecting now...!!\n\nPlease Understand and Beleive me Baby!!\n\nI will give u service today pakka ok!!\n\nPlease Wait Sometime...!!\nI will only message you okay!!' }, clientId },
                { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
            ];
        }
        else if (type === '2') {
            events = [
                { type: 'message', chatId, time: now + (1 * 60 * 1000), payload: { message: 'Wait, I will Try Again!!' }, clientId },
                { type: 'call', chatId, time: now + (1.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (2 * 60 * 1000), payload: { message: `Seems its not working at all,\n\nYou Call me Here Only👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n\nU Call me Now!!\n` }, clientId },
                { type: 'call', chatId, time: now + (4 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (4.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (6.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (9 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (9.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (12 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (12.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
            ];
        }
        else {
            events = [
                { type: 'message', chatId, time: now + (1 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (4 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (4.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (6.5 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (9 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (9.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (12 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (12.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
                { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, clientId },
                { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${clientId}/${chatId}\n` }, clientId },
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