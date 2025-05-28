"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetClientOptionsDto = exports.ConnectionStatusDto = exports.ConnectionStatsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ConnectionStatsDto {
}
exports.ConnectionStatsDto = ConnectionStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of connections' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connected clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "connected", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connecting clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "connecting", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of disconnecting clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "disconnecting", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of clients in error state' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "error", void 0);
class ConnectionStatusDto {
}
exports.ConnectionStatusDto = ConnectionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Connection state of the client', enum: ['connecting', 'connected', 'disconnecting', 'disconnected', 'error'] }),
    __metadata("design:type", String)
], ConnectionStatusDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether auto disconnect is enabled' }),
    __metadata("design:type", Boolean)
], ConnectionStatusDto.prototype, "autoDisconnect", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'When the connection was last used', type: 'number' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connection attempts', type: 'number' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "connectionAttempts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last error message if any', required: false }),
    __metadata("design:type", String)
], ConnectionStatusDto.prototype, "lastError", void 0);
class GetClientOptionsDto {
}
exports.GetClientOptionsDto = GetClientOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to auto disconnect the client after period of inactivity', required: false, default: true }),
    __metadata("design:type", Boolean)
], GetClientOptionsDto.prototype, "autoDisconnect", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to use event handler', required: false, default: true }),
    __metadata("design:type", Boolean)
], GetClientOptionsDto.prototype, "handler", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Connection timeout in milliseconds', required: false, default: 30000 }),
    __metadata("design:type", Number)
], GetClientOptionsDto.prototype, "timeout", void 0);
//# sourceMappingURL=connection-management.dto.js.map