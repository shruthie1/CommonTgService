"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardMediaToBot = exports.forwardMediaToChannel = exports.updateChatSettings = exports.sendMediaBatch = exports.getFilteredMedia = exports.getAllMediaMetaData = exports.getMediaMetadata = exports.getContactStatistics = exports.manageBlockList = exports.importContacts = exports.exportContacts = exports.sendContactsFile = exports.addContactsFromContacts = exports.addContactFromContacts = exports.getChannelInfo = exports.updateGroupInfo = exports.promoteUserToAdmin = exports.removeMembersFromGroup = exports.addMembersToGroup = exports.createGroupOrChannel = exports.createGroupWithOptions = exports.leaveChannelsFromGroup = exports.addContactsToGroup = exports.addContactToGroup = exports.getGroupMembers = exports.joinChannel = exports.archiveChat = exports.createGroup = void 0;
__exportStar(require("./core-operations"), exports);
var group_management_1 = require("./group-management");
Object.defineProperty(exports, "createGroup", { enumerable: true, get: function () { return group_management_1.createGroup; } });
Object.defineProperty(exports, "archiveChat", { enumerable: true, get: function () { return group_management_1.archiveChat; } });
Object.defineProperty(exports, "joinChannel", { enumerable: true, get: function () { return group_management_1.joinChannel; } });
Object.defineProperty(exports, "getGroupMembers", { enumerable: true, get: function () { return group_management_1.getGroupMembers; } });
Object.defineProperty(exports, "addContactToGroup", { enumerable: true, get: function () { return group_management_1.addContact; } });
Object.defineProperty(exports, "addContactsToGroup", { enumerable: true, get: function () { return group_management_1.addContacts; } });
Object.defineProperty(exports, "leaveChannelsFromGroup", { enumerable: true, get: function () { return group_management_1.leaveChannels; } });
Object.defineProperty(exports, "createGroupWithOptions", { enumerable: true, get: function () { return group_management_1.createGroupWithOptions; } });
Object.defineProperty(exports, "createGroupOrChannel", { enumerable: true, get: function () { return group_management_1.createGroupOrChannel; } });
Object.defineProperty(exports, "addMembersToGroup", { enumerable: true, get: function () { return group_management_1.addMembersToGroup; } });
Object.defineProperty(exports, "removeMembersFromGroup", { enumerable: true, get: function () { return group_management_1.removeMembersFromGroup; } });
Object.defineProperty(exports, "promoteUserToAdmin", { enumerable: true, get: function () { return group_management_1.promoteUserToAdmin; } });
Object.defineProperty(exports, "updateGroupInfo", { enumerable: true, get: function () { return group_management_1.updateGroupInfo; } });
Object.defineProperty(exports, "getChannelInfo", { enumerable: true, get: function () { return group_management_1.getChannelInfo; } });
__exportStar(require("./message-management"), exports);
var contact_management_1 = require("./contact-management");
Object.defineProperty(exports, "addContactFromContacts", { enumerable: true, get: function () { return contact_management_1.addContact; } });
Object.defineProperty(exports, "addContactsFromContacts", { enumerable: true, get: function () { return contact_management_1.addContacts; } });
Object.defineProperty(exports, "sendContactsFile", { enumerable: true, get: function () { return contact_management_1.sendContactsFile; } });
Object.defineProperty(exports, "exportContacts", { enumerable: true, get: function () { return contact_management_1.exportContacts; } });
Object.defineProperty(exports, "importContacts", { enumerable: true, get: function () { return contact_management_1.importContacts; } });
Object.defineProperty(exports, "manageBlockList", { enumerable: true, get: function () { return contact_management_1.manageBlockList; } });
Object.defineProperty(exports, "getContactStatistics", { enumerable: true, get: function () { return contact_management_1.getContactStatistics; } });
__exportStar(require("./privacy-session"), exports);
__exportStar(require("./statistics"), exports);
__exportStar(require("./bot-management"), exports);
var media_management_1 = require("./media-management");
Object.defineProperty(exports, "getMediaMetadata", { enumerable: true, get: function () { return media_management_1.getMediaMetadata; } });
Object.defineProperty(exports, "getAllMediaMetaData", { enumerable: true, get: function () { return media_management_1.getAllMediaMetaData; } });
Object.defineProperty(exports, "getFilteredMedia", { enumerable: true, get: function () { return media_management_1.getFilteredMedia; } });
Object.defineProperty(exports, "sendMediaBatch", { enumerable: true, get: function () { return media_management_1.sendMediaBatch; } });
Object.defineProperty(exports, "updateChatSettings", { enumerable: true, get: function () { return media_management_1.updateChatSettings; } });
Object.defineProperty(exports, "forwardMediaToChannel", { enumerable: true, get: function () { return media_management_1.forwardMediaToChannel; } });
Object.defineProperty(exports, "forwardMediaToBot", { enumerable: true, get: function () { return media_management_1.forwardMediaToBot; } });
__exportStar(require("./chat-folders"), exports);
//# sourceMappingURL=index.js.map