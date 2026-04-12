import mongoose, { Document } from 'mongoose';
export type UserDocument = User & Document;
export declare class User {
    mobile: string;
    session: string;
    tgId: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    gender: string | null;
    twoFA: boolean;
    expired: boolean;
    password: string;
    starred: boolean;
    demoGiven: boolean;
    channels: number;
    personalChats: number;
    totalChats: number;
    contacts: number;
    msgs: number;
    photoCount: number;
    videoCount: number;
    movieCount: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    lastActive: string;
    calls: {
        totalCalls: number;
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
    };
    relationships: {
        score: number;
        bestScore: number;
        computedAt: Date | null;
        top: Array<{
            chatId: string;
            name: string;
            username: string | null;
            phone: string | null;
            messages: number;
            mediaCount: number;
            voiceCount: number;
            intimateMessageCount: number;
            negativeKeywordCount: number;
            calls: {
                total: number;
                incoming: number;
                videoCalls: number;
                avgDuration: number;
                totalDuration: number;
                meaningfulCalls: number;
            };
            commonChats: number;
            isMutualContact: boolean;
            lastMessageDate: string | null;
            score: number;
        }>;
    };
}
export declare const UserSchema: mongoose.Schema<User, mongoose.Model<User, any, any, any, (mongoose.Document<unknown, any, User, any, mongoose.DefaultSchemaOptions> & User & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, User, any, mongoose.DefaultSchemaOptions> & User & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}), any, User>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, User, mongoose.Document<unknown, {}, User, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    mobile?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    session?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    tgId?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    firstName?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastName?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    gender?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    twoFA?: mongoose.SchemaDefinitionProperty<boolean, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    expired?: mongoose.SchemaDefinitionProperty<boolean, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    password?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    starred?: mongoose.SchemaDefinitionProperty<boolean, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    demoGiven?: mongoose.SchemaDefinitionProperty<boolean, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    channels?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    personalChats?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    totalChats?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    contacts?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    msgs?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    photoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    videoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    movieCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    ownPhotoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    otherPhotoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    ownVideoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    otherVideoCount?: mongoose.SchemaDefinitionProperty<number, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastActive?: mongoose.SchemaDefinitionProperty<string, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    calls?: mongoose.SchemaDefinitionProperty<{
        totalCalls: number;
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
    }, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    relationships?: mongoose.SchemaDefinitionProperty<{
        score: number;
        bestScore: number;
        computedAt: Date | null;
        top: Array<{
            chatId: string;
            name: string;
            username: string | null;
            phone: string | null;
            messages: number;
            mediaCount: number;
            voiceCount: number;
            intimateMessageCount: number;
            negativeKeywordCount: number;
            calls: {
                total: number;
                incoming: number;
                videoCalls: number;
                avgDuration: number;
                totalDuration: number;
                meaningfulCalls: number;
            };
            commonChats: number;
            isMutualContact: boolean;
            lastMessageDate: string | null;
            score: number;
        }>;
    }, User, mongoose.Document<unknown, {}, User, {
        id: string;
    }, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<User & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, User>;
