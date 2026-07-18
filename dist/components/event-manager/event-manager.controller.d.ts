import { EventManagerService } from './event-manager.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ScheduleEventsDto } from './dto/schedule-events.dto';
export declare class EventManagerController {
    private readonly eventManagerService;
    constructor(eventManagerService: EventManagerService);
    getAllEvents(filter: object): Promise<{
        data: any[];
    }>;
    getEventById(id: string): Promise<{
        data: import(".").Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
            _id: import("mongoose").Types.ObjectId;
        }> & {
            __v: number;
        };
    }>;
    createEvent(dto: CreateEventDto): Promise<{
        data: import("mongoose").Document<unknown, {}, import(".").EventDocument, {}, import("mongoose").DefaultSchemaOptions> & import(".").Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
            _id: import("mongoose").Types.ObjectId;
        }> & {
            __v: number;
        } & {
            id: string;
        };
    }>;
    schedulePaidEvents(dto: ScheduleEventsDto): Promise<{
        data: {
            message: string;
        };
    }>;
    createMultiple(events: CreateEventDto[]): Promise<{
        data: import("mongoose").MergeType<import("mongoose").Document<unknown, {}, import(".").EventDocument, {}, import("mongoose").DefaultSchemaOptions> & import(".").Event & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
            _id: import("mongoose").Types.ObjectId;
        }> & {
            __v: number;
        } & {
            id: string;
        }, Omit<CreateEventDto, "_id">>[];
    }>;
    deleteMultiple(chatId: string): Promise<{
        status: string;
        entriesDeleted: number;
    }>;
}
