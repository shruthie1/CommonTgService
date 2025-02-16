"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateChannelDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_channel_dto_1 = require("./create-channel.dto");
class UpdateChannelDto extends (0, swagger_1.PartialType)(create_channel_dto_1.CreateChannelDto) {
}
exports.UpdateChannelDto = UpdateChannelDto;
//# sourceMappingURL=update-channel.dto.js.map