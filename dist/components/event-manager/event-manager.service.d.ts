import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
export declare class EventManagerService {
    private readonly eventModel;
    private readonly logger;
    constructor(eventModel: Model<EventDocument>);
    create(dto: CreateEventDto): Promise<import("mongoose").Document<unknown, {}, EventDocument, {}, import("mongoose").DefaultSchemaOptions> & Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    createMultiple(events: CreateEventDto[]): Promise<(Omit<import("mongoose").Document<unknown, {}, EventDocument, {}, import("mongoose").DefaultSchemaOptions> & Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }, keyof CreateEventDto> & Omit<CreateEventDto, "_id">)[]>;
    deleteMultiple(chatId: string): Promise<number>;
    getEvents(filter: object): Promise<any[]>;
    getEventById(id: string): Promise<Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    schedulePaidEvents(chatId: string, clientId: string, type?: string): Promise<{
        message: string;
    }>;
}
