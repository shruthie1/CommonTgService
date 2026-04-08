import { Injectable, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { ClientService } from '../clients/client.service';
import { fetchWithTimeout, sleep, Logger } from '../../utils';

@Injectable()
export class EventManagerService implements OnModuleInit, OnModuleDestroy {
  private intervalId?: NodeJS.Timeout;
  private isProcessing: boolean = false;
  private readonly logger = new Logger(EventManagerService.name);

  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @Inject(forwardRef(() => ClientService)) private readonly clientService: ClientService,
  ) {}

  onModuleInit() {
    this.startEventExecution();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async create(dto: CreateEventDto) {
    try {
      if (dto.profile && dto.chatId && dto.type) {
        const result = await this.eventModel.create(dto);
        this.logger.log(` ${dto.profile.toUpperCase()}: Event '${dto.type}' scheduled for ${dto.time}`);
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
      const validEvents = events.filter(e => e.profile && e.chatId && e.type);
      if (validEvents.length > 0) {
        const result = await this.eventModel.insertMany(validEvents);
        validEvents.forEach(e => {
          this.logger.log(` ${e.profile.toUpperCase()}: Event '${e.type}' scheduled for ${e.time}`);
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

  async schedulePaidEvents(chatId: string, profile: string, type: string = '1') {
    this.logger.log(`received req for ${chatId} ${profile} ${type}`);
    const existingEvents = await this.getEvents({ chatId, profile });
    if (existingEvents.length > 0) {
      return { message: `Events already exists for ${profile} | Chatid: ${chatId}` };
    }

    const now = Date.now();
    let events: CreateEventDto[] = [];

    if (type === '1') {
      events = [
        { type: 'call', chatId, time: now + (1.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (2.2 * 60 * 1000), payload: { message: 'Wait, I will Try Again!!' }, profile },
        { type: 'call', chatId, time: now + (2.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (3.2 * 60 * 1000), payload: { message: 'Do you have any Network issue??\n\nCall is Failed to Connect!!' }, profile },
        { type: 'call', chatId, time: now + (3.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (4.2 * 60 * 1000), payload: { message: 'Some Network issue...!!\n\nDont worry, I will not cheat U!!\nI will try again!!\nPlease Wait...!!\nI will only message you okay!!' }, profile },
        { type: 'message', chatId, time: now + (4.7 * 60 * 1000), payload: { message: "Dont Speak Okay!!\nI'm in **Bathroom\nMute yourself**!! I will Show you in Call Okay..!!" }, profile },
        { type: 'message', chatId, time: now + (5 * 60 * 1000), payload: { message: `Heyy You Call me Here👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n\nU Call me Now!!` }, profile },
        { type: 'message', chatId, time: now + (6 * 60 * 1000), payload: { message: `You Call me Here Man!!\nU Call Now!!, It will work!!\n\nOpen👇👇\nhttps://ZomCall.netlify.app/${profile}/${chatId}` }, profile },
        { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `https://ZomCall.netlify.app/${profile}/${chatId}\n\nU Call me on the Zoom!!` }, profile },
        { type: 'message', chatId, time: now + (8 * 60 * 1000), payload: { message: `https://ZomCall.netlify.app/${profile}/${chatId}\n\nU only Call me on the Zoom!!` }, profile },
        { type: 'message', chatId, time: now + (11 * 60 * 1000), payload: { message: `Call me Here Man!!\nU Call Now!!\n\nOpen👇👇\nhttps://ZomCall.netlify.app/${profile}/${chatId}` }, profile },
        { type: 'message', chatId, time: now + (13 * 60 * 1000), payload: { message: 'Same Problem, Call Not connecting now...!!\n\nPlease Understand and Beleive me Baby!!\n\nI will give u service today pakka ok!!\n\nPlease Wait Sometime...!!\nI will only message you okay!!' }, profile },
        { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
      ];
    } else if (type === '2') {
      events = [
        { type: 'message', chatId, time: now + (1 * 60 * 1000), payload: { message: 'Wait, I will Try Again!!' }, profile },
        { type: 'call', chatId, time: now + (1.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (2 * 60 * 1000), payload: { message: `Seems its not working at all,\n\nYou Call me Here Only👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n\nU Call me Now!!\n` }, profile },
        { type: 'call', chatId, time: now + (4 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (4.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (6.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (9 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (9.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (12 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (12.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
      ];
    } else {
      events = [
        { type: 'message', chatId, time: now + (1 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (4 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (4.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (6.5 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (7 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (9 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (9.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (12 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (12.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (15 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (15.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (20 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (20.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (30 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (30.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
        { type: 'call', chatId, time: now + (45 * 60 * 1000), payload: {}, profile },
        { type: 'message', chatId, time: now + (45.5 * 60 * 1000), payload: { message: `Call me👇👇!!\nhttps://ZomCall.netlify.app/${profile}/${chatId}\n` }, profile },
      ];
    }

    await this.createMultiple(events);
    return { message: `scheduled events for ${profile} | Chatid: ${chatId}` };
  }

  public startEventExecution() {
    this.logger.log('Started Event Execution');
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(async () => {
      if (this.isProcessing) {
        this.logger.log('Skipping tick: already processing events');
        return;
      }

      const currentTime = Date.now();
      this.logger.log(`Interval tick at ${currentTime} - checking for overdue events`);
      this.isProcessing = true;

      try {
        const events = await this.eventModel.find({ time: { $lte: currentTime } }).sort({ time: 1 }).lean();
        if (events.length > 0) {
          this.logger.log(`Found ${events.length} overdue events`);
        } else {
          this.logger.log('No overdue events found');
        }

        for (const event of events) {
          let success = false;
          try {
            this.logger.log(`Executing event '${event.type}' (ID: ${event._id}) for profile ${event.profile}`);
            const profile = await this.clientService.findOne(event.profile as string, false);
            let result: any = null;

            if (profile) {
              this.logger.log(`Profile found: ${profile.repl}`);
              if (event.type === 'call') {
                try {
                  const urlObj = new URL(`/requestCall/${event.chatId}`, profile.repl);
                  urlObj.searchParams.set('force', 'true');
                  urlObj.searchParams.set('key', String(Date.now()));
                  result = await fetchWithTimeout(urlObj.toString());
                } catch (err) {
                  this.logger.error(`Invalid profile.repl URL for call: ${profile.repl}`, err);
                }
              } else if (event.type === 'message') {
                try {
                  const urlObj = new URL(`/sendMessage/${event.chatId}`, profile.repl);
                  urlObj.searchParams.set('msg', event.payload?.message || '');
                  urlObj.searchParams.set('key', String(Date.now()));
                  result = await fetchWithTimeout(urlObj.toString());
                } catch (err) {
                  this.logger.error(`Invalid profile.repl URL for message: ${profile.repl}`, err);
                }
              }
            } else {
              this.logger.warn(`Profile does not exist for ${event.profile}`);
            }

            if (result) {
              await this.eventModel.deleteOne({ _id: event._id });
              this.logger.log(`Event '${event._id}' removed from the database`);
              success = true;
            }
          } catch (error) {
            this.logger.error(`Error executing event '${event._id}'`, error);
          }

          if (!success) {
            try {
              const newTime = Date.now() + 30000;
              await this.eventModel.updateOne({ _id: event._id }, { $set: { time: newTime } });
              this.logger.log(`Event '${event._id}' rescheduled for ${new Date(newTime).toISOString()}`);
            } catch (err) {
              this.logger.error(`Failed to reschedule event '${event._id}'`, err);
            }
          }

          await sleep(1000);
        }
      } catch (error) {
        this.logger.error('Error in event loop', error);
      } finally {
        this.isProcessing = false;
      }
    }, 20000);
  }
}
