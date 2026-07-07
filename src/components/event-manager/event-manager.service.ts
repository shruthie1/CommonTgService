import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { Logger } from '../../utils';

@Injectable()
export class EventManagerService {
  private readonly logger = new Logger(EventManagerService.name);

  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
  ) {}

  async create(dto: CreateEventDto) {
    try {
      if (dto.clientId && dto.chatId && dto.type) {
        const result = await this.eventModel.create(dto);
        this.logger.log(` ${dto.clientId.toUpperCase()}: Event '${dto.type}' scheduled for ${dto.time}`);
        return result;
      } else {
        this.logger.warn('Bad event format');
      }
    } catch (error) {
      this.logger.error('Error creating event', error);
    }
  }

  async createMultiple(events: CreateEventDto[]) {
    try {
      const validEvents = events.filter(e => e.clientId && e.chatId && e.type);
      if (validEvents.length > 0) {
        const result = await this.eventModel.insertMany(validEvents);
        validEvents.forEach(e => {
          this.logger.log(` ${e.clientId.toUpperCase()}: Event '${e.type}' scheduled for ${e.time}`);
        });
        return result;
      } else {
        this.logger.warn('No valid events to insert.');
      }
    } catch (error) {
      this.logger.error('Error inserting events', error);
    }
  }

  async deleteMultiple(chatId: string): Promise<number> {
    try {
      const result = await this.eventModel.deleteMany({ chatId });
      return result.deletedCount;
    } catch (error) {
      this.logger.error('Error deleting events', error);
      return 0;
    }
  }

  async getEvents(filter: object): Promise<any[]> {
    try {
      return await this.eventModel.find(filter).lean();
    } catch (error) {
      this.logger.error('Error fetching events', error);
      return [];
    }
  }

  async getEventById(id: string) {
    try {
      return await this.eventModel.findById(id).lean();
    } catch (error) {
      this.logger.error(`Error fetching event by id: ${id}`, error);
      return null;
    }
  }

  async schedulePaidEvents(chatId: string, clientId: string, type: string = '1') {
    this.logger.log(`received req for ${chatId} ${clientId} ${type}`);
    const existingEvents = await this.getEvents({ chatId, clientId });
    if (existingEvents.length > 0) {
      return { message: `Events already exists for ${clientId} | Chatid: ${chatId}` };
    }

    const now = Date.now();
    let events: CreateEventDto[] = [];

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
    } else if (type === '2') {
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
    } else {
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
}
