"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProxyIpDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_proxy_ip_dto_1 = require("./create-proxy-ip.dto");
class UpdateProxyIpDto extends (0, swagger_1.PartialType)(create_proxy_ip_dto_1.CreateProxyIpDto) {
}
exports.UpdateProxyIpDto = UpdateProxyIpDto;
//# sourceMappingURL=update-proxy-ip.dto.js.map