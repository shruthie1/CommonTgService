"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const utils_1 = require("../utils");
let ExceptionsFilter = class ExceptionsFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const errorDetails = (0, utils_1.parseError)(exception, 'Exception', false);
        let status = errorDetails.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = errorDetails.message || 'Internal server error';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const errorResponse = exception.getResponse();
            message =
                typeof errorResponse === 'string'
                    ? errorResponse
                    : errorResponse.message || errorResponse;
        }
        response.status(status).json({
            statusCode: status,
            message,
            error: errorDetails.error
        });
    }
};
exports.ExceptionsFilter = ExceptionsFilter;
exports.ExceptionsFilter = ExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], ExceptionsFilter);
//# sourceMappingURL=Exception-filter.js.map