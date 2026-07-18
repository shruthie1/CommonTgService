import mongoose, { Document } from 'mongoose';
export type TransactionDocument = Transaction & Document;
export declare class Transaction {
    clientId: string;
    amount: number;
    status: string;
    timestamp: number;
    type: string;
    metadata: any;
    paymentId?: string;
    orderId?: string;
    signature?: string;
    currency?: string;
}
export declare const TransactionSchema: mongoose.Schema<Transaction, mongoose.Model<Transaction, any, any, any, (mongoose.Document<unknown, any, Transaction, any, mongoose.DefaultSchemaOptions> & Transaction & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, Transaction, any, mongoose.DefaultSchemaOptions> & Transaction & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}), any, Transaction>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Transaction, mongoose.Document<unknown, {}, Transaction, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    clientId?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    amount?: mongoose.SchemaDefinitionProperty<number, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    status?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    timestamp?: mongoose.SchemaDefinitionProperty<number, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    type?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    metadata?: mongoose.SchemaDefinitionProperty<any, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    paymentId?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    orderId?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    signature?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    currency?: mongoose.SchemaDefinitionProperty<string, Transaction, mongoose.Document<unknown, {}, Transaction, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Transaction & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, Transaction>;
