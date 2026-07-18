import { Document } from 'mongoose';
export type StatDocument = Stat & Document;
export declare class Stat {
    chatId: string;
    count: number;
    payAmount: number;
    demoGiven: boolean;
    demoGivenToday: boolean;
    newUser: boolean;
    paidReply: boolean;
    name: string;
    secondShow: boolean;
    didPay: boolean | null;
    client: string;
    profile: string;
}
export declare const StatSchema: import("mongoose").Schema<Stat, import("mongoose").Model<Stat, any, any, any, (Document<unknown, any, Stat, any, import("mongoose").DefaultSchemaOptions> & Stat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Stat, any, import("mongoose").DefaultSchemaOptions> & Stat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, Stat>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Stat, Document<unknown, {}, Stat, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    chatId?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    count?: import("mongoose").SchemaDefinitionProperty<number, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    payAmount?: import("mongoose").SchemaDefinitionProperty<number, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    demoGiven?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    demoGivenToday?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    newUser?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    paidReply?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    name?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    secondShow?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    didPay?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    client?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, Stat>;
