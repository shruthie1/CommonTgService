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
exports.UploadByUrlDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UploadByUrlDto {
}
exports.UploadByUrlDto = UploadByUrlDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: "videos" }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UploadByUrlDto.prototype, "folder", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: {
            intro: 'https://cdn.example.com/video1.mp4',
            welcome: 'https://cdn.example.com/welcome',
        },
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UploadByUrlDto.prototype, "files", void 0);
//# sourceMappingURL=upload-by-url.dto.js.map