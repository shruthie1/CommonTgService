import { Document } from 'mongoose';
export type ActiveChannelDocument = ActiveChannel & Document;
export declare class ActiveChannel {
    channelId: string;
    title: string;
    participantsCount: number;
    username: string;
    restricted: boolean;
    broadcast: boolean;
    sendMessages: boolean;
    canSendMsgs: boolean;
    megagroup?: boolean;
    wordRestriction?: number;
    dMRestriction?: number;
    availableMsgs?: string[];
    banned?: boolean;
    forbidden?: boolean;
    reactRestricted?: boolean;
    private?: boolean;
    lastMessageTime?: number;
    messageIndex?: number;
    messageId?: number;
    tempBan?: boolean;
    deletedCount?: number;
    starred?: boolean;
    score?: number;
}
export declare const ActiveChannelSchema: import("mongoose").Schema<ActiveChannel, import("mongoose").Model<ActiveChannel, any, any, any, (Document<unknown, any, ActiveChannel, any, import("mongoose").DefaultSchemaOptions> & ActiveChannel & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, ActiveChannel, any, import("mongoose").DefaultSchemaOptions> & ActiveChannel & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, ActiveChannel>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, ActiveChannel, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    channelId?: import("mongoose").SchemaDefinitionProperty<string, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    title?: import("mongoose").SchemaDefinitionProperty<string, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    participantsCount?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: import("mongoose").SchemaDefinitionProperty<string, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    restricted?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    broadcast?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    sendMessages?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    canSendMsgs?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    megagroup?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    wordRestriction?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    dMRestriction?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    availableMsgs?: import("mongoose").SchemaDefinitionProperty<string[], ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    banned?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    forbidden?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    reactRestricted?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    private?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastMessageTime?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    messageIndex?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    messageId?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    tempBan?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    deletedCount?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    starred?: import("mongoose").SchemaDefinitionProperty<boolean, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    score?: import("mongoose").SchemaDefinitionProperty<number, ActiveChannel, Document<unknown, {}, ActiveChannel, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ActiveChannel & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, ActiveChannel>;
