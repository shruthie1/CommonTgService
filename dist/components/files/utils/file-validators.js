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
exports.FileSizeValidator = exports.CustomFileValidator = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
let CustomFileValidator = class CustomFileValidator extends common_2.FileValidator {
    constructor(options) {
        super(options);
    }
    isValid(file) {
        if (!file) {
            return false;
        }
        return this.validationOptions.fileTypes.includes(file.mimetype);
    }
    buildErrorMessage() {
        return `File type must be one of: ${this.validationOptions.fileTypes.join(', ')}`;
    }
};
exports.CustomFileValidator = CustomFileValidator;
exports.CustomFileValidator = CustomFileValidator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], CustomFileValidator);
let FileSizeValidator = class FileSizeValidator extends common_2.FileValidator {
    constructor(options) {
        super(options);
    }
    isValid(file) {
        if (!file) {
            return false;
        }
        return file.size <= this.validationOptions.maxSize;
    }
    buildErrorMessage() {
        return `File size must not exceed ${this.validationOptions.maxSize / (1024 * 1024)}MB`;
    }
};
exports.FileSizeValidator = FileSizeValidator;
exports.FileSizeValidator = FileSizeValidator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], FileSizeValidator);
//# sourceMappingURL=file-validators.js.map