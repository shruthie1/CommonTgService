import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { ClientService } from '../clients/client.service';
export declare class EventManagerService implements OnModuleInit, OnModuleDestroy {
    private readonly eventModel;
    private readonly clientService;
    private intervalId?;
    private isProcessing;
    private readonly logger;
    constructor(eventModel: Model<EventDocument>, clientService: ClientService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    create(dto: CreateEventDto): Promise<import("mongoose").Document<unknown, {}, EventDocument, {}, import("mongoose").DefaultSchemaOptions> & Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    createMultiple(events: CreateEventDto[]): Promise<import("mongoose").MergeType<import("mongoose").Document<unknown, {}, EventDocument, {}, import("mongoose").DefaultSchemaOptions> & Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }, Omit<CreateEventDto, "_id">>[]>;
    deleteMultiple(chatId: string): Promise<number>;
    getEvents(filter: object): Promise<any[]>;
    getEventById(id: string): Promise<Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    schedulePaidEvents(chatId: string, profile: string, type?: string): Promise<{
        message: string;
    }>;
    startEventExecution(): void;
}
