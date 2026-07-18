"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FileModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileModule = void 0;
const common_1 = require("@nestjs/common");
const file_controller_1 = require("./file.controller");
const file_service_1 = require("./file.service");
const platform_express_1 = require("@nestjs/platform-express");
const file_config_1 = require("./config/file.config");
const file_module_interface_1 = require("./file.module.interface");
let FileModule = FileModule_1 = class FileModule {
    static register() {
        return {
            module: FileModule_1,
            imports: [
                platform_express_1.MulterModule.register({
                    dest: file_config_1.FILE_CONFIG.STORAGE_PATH,
                }),
            ],
            controllers: [file_controller_1.FileController],
            providers: [file_service_1.FileService],
            exports: [file_service_1.FileService],
        };
    }
    static forRoot(options = {}) {
        const providers = [
            {
                provide: file_module_interface_1.FILE_MODULE_OPTIONS,
                useValue: {
                    storagePath: options.storagePath || file_config_1.FILE_CONFIG.STORAGE_PATH,
                    maxFileSize: options.maxFileSize || file_config_1.FILE_CONFIG.MAX_FILE_SIZE,
                    allowedFileTypes: options.allowedFileTypes || file_config_1.FILE_CONFIG.ALLOWED_FILE_TYPES,
                },
            },
            file_service_1.FileService,
        ];
        return {
            module: FileModule_1,
            imports: [
                platform_express_1.MulterModule.register({
                    dest: options.storagePath || file_config_1.FILE_CONFIG.STORAGE_PATH,
                }),
            ],
            controllers: [file_controller_1.FileController],
            providers: providers,
            exports: [file_service_1.FileService],
        };
    }
    static forRootGlobal(options = {}) {
        const module = this.forRoot(options);
        return {
            ...module,
            global: true,
        };
    }
};
exports.FileModule = FileModule;
exports.FileModule = FileModule = FileModule_1 = __decorate([
    (0, common_1.Module)({})
], FileModule);
//# sourceMappingURL=file.module.js.map