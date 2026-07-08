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
    } else if (type === '2') {
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
