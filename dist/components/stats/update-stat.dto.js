"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateStatDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_stat_dto_1 = require("./create-stat.dto");
class UpdateStatDto extends (0, swagger_1.PartialType)(create_stat_dto_1.CreateStatDto) {
}
exports.UpdateStatDto = UpdateStatDto;
//# sourceMappingURL=update-stat.dto.js.map