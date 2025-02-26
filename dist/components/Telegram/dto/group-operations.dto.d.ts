export declare enum AdminPermission {
    CHANGE_INFO = "changeInfo",
    POST_MESSAGES = "postMessages",
    EDIT_MESSAGES = "editMessages",
    DELETE_MESSAGES = "deleteMessages",
    BAN_USERS = "banUsers",
    INVITE_USERS = "inviteUsers",
    PIN_MESSAGES = "pinMessages",
    ADD_ADMINS = "addAdmins",
    ANONYMOUS = "anonymous",
    MANAGE_CALL = "manageCall"
}
export declare class AdminPermissionsDto {
    changeInfo?: boolean;
    postMessages?: boolean;
    editMessages?: boolean;
    deleteMessages?: boolean;
    banUsers?: boolean;
    inviteUsers?: boolean;
    pinMessages?: boolean;
    addAdmins?: boolean;
    anonymous?: boolean;
    manageCall?: boolean;
}
export declare class BaseGroupOperationDto {
    groupId: string;
}
export declare class GroupMemberOperationDto extends BaseGroupOperationDto {
    members: string[];
}
export declare class AdminOperationDto extends BaseGroupOperationDto {
    userId: string;
    isPromote: boolean;
    permissions?: AdminPermissionsDto;
    rank?: string;
}
export declare class GroupSettingsDto extends BaseGroupOperationDto {
    title: string;
    description?: string;
    address?: string;
    slowMode?: number;
    megagroup?: boolean;
    forImport?: boolean;
    memberRestrictions?: {
        sendMessages?: boolean;
        sendMedia?: boolean;
        sendStickers?: boolean;
        sendGifs?: boolean;
        sendGames?: boolean;
        sendInline?: boolean;
        embedLinks?: boolean;
    };
}
export declare class ChatCleanupDto extends BaseGroupOperationDto {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
}
