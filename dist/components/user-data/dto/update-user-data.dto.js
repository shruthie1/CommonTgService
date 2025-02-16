"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserDataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_user_data_dto_1 = require("./create-user-data.dto");
class UpdateUserDataDto extends (0, swagger_1.PartialType)(create_user_data_dto_1.CreateUserDataDto) {
}
exports.UpdateUserDataDto = UpdateUserDataDto;
//# sourceMappingURL=update-user-data.dto.js.map