"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerMiddleware = void 0;
const common_1 = require("@nestjs/common");
const chalk = require("chalk");
let LoggerMiddleware = class LoggerMiddleware {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    use(req, res, next) {
        const { method, originalUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const ip = req.ip;
        const excludedEndpoints = ['/sendtochannel'];
        if (!excludedEndpoints.includes(originalUrl)) {
            res.on('finish', () => {
                const { statusCode } = res;
                const contentLength = res.get('content-length');
                let color;
                if (statusCode >= 500) {
                    color = chalk.red;
                }
                else if (statusCode >= 400) {
                    color = chalk.yellow;
                }
                else if (statusCode >= 300) {
                    color = chalk.cyan;
                }
                else {
                    color = chalk.green;
                }
                this.logger.log(color(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`));
            });
        }
        else {
            this.logger.log(`Url Length : ${originalUrl.length}`);
        }
        next();
    }
};
exports.LoggerMiddleware = LoggerMiddleware;
exports.LoggerMiddleware = LoggerMiddleware = __decorate([
    (0, common_1.Injectable)()
], LoggerMiddleware);
//# sourceMappingURL=logger.middleware.js.map