import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ChannelDocument = Channel & Document;
export declare class Channel {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    title: string;
    username: string;
    private: boolean;
    forbidden: boolean;
}
export declare const ChannelSchema: mongoose.Schema<Channel, mongoose.Model<Channel, any, any, any, (Document<unknown, any, Channel, any, mongoose.DefaultSchemaOptions> & Channel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Channel, any, mongoose.DefaultSchemaOptions> & Channel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}), any, Channel>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Channel, Document<unknown, {}, Channel, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    channelId?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    broadcast?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    canSendMsgs?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    participantsCount?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    restricted?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    sendMessages?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    title?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    private?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    forbidden?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, Channel>;
