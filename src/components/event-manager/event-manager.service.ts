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
    const MIN = 60 * 1000;
    const SCALE = 0.7; // uniform tightening — keep in sync with @tg/events buildPaidEventLadder
    const at = (mins: number) => now + Math.round(mins * SCALE * MIN);
    const call = (mins: number): CreateEventDto => ({ type: 'call', chatId, time: at(mins), payload: {}, clientId });
    const msg = (mins: number, message: string): CreateEventDto => ({ type: 'message', chatId, time: at(mins), payload: { message }, clientId });
    const link = `https://ZomCall.netlify.app/${clientId}/${chatId}`;
    const callMeVariants = [
      `<b>call me here</b> 👇
${link}`,
      `come na, call me 🥺
${link}`,
      `${link}
<b>tap & call me</b> 💕`,
      `waiting for u 🥹
${link}`,
      `call me on this baby 😚
${link}`,
      `<b>open this</b> 👇 call me
${link}`,
      `${link}
i'm right here 💋`,
      `just call me na 🙈
${link}`,
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
        msg(5, `okay try calling ME here instead babe 👇\n${link}\ncall me now na 🥰`),
        msg(6, `come on, call me on this one, it actually works 😘\n${link}`),
        msg(7, `${link}\n\ncall me here baby, i'm waiting 💋`),
        msg(8, `only call me on this link okay? 🙈\n${link}`),
        msg(11, `babe you there?? just open this and call me 👇\n${link}`),
        msg(13, "same problem, normal call still won't connect 😭 please believe me na, i'm not going anywhere.. i'll give you the full show today pakka 💕 just come to the link, okay?"),
        call(15), msg(15.5, callMe()),
        call(20), msg(20.5, callMe()),
        call(30), msg(30.5, callMe()),
        call(45), msg(45.5, callMe()),
      ];
    } else if (type === '2') {
      events = [
        msg(1, "wait let me try you again 🥺"),
        call(1.5),
        msg(2, `okay this normal call really isn't working 😩 just call me here instead babe 👇\n${link}\ncall me now na 😚`),
        call(4), msg(4.5, callMe()),
        call(6.5), msg(7, callMe()),
        call(9), msg(9.5, callMe()),
        call(12), msg(12.5, callMe()),
        call(15), msg(15.5, callMe()),
        call(20), msg(20.5, callMe()),
        call(30), msg(30.5, callMe()),
        call(45), msg(45.5, callMe()),
      ];
    } else {
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
}
