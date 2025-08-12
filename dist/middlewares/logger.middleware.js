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
const parseError_1 = require("../utils/parseError");
const TelegramBots_config_1 = require("../utils/TelegramBots.config");
let LoggerMiddleware = class LoggerMiddleware {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    use(req, res, next) {
        const { method, originalUrl, baseUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const ip = req.ip;
        const excludedEndpoints = [
            '/sendtochannel',
            '/favicon.',
            '/tgsignup',
            '/timestamps',
        ];
        const isExcluded = (url) => excludedEndpoints.some((endpoint) => url.startsWith(endpoint));
        if (!isExcluded(originalUrl) && originalUrl !== '/') {
            res.on('finish', () => {
                const { statusCode } = res;
                const contentLength = res.get('content-length');
                if (statusCode >= 500) {
                    TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.HTTP_FAILURES, `Threw Status ${statusCode} for ${originalUrl}`);
                    this.logger.error(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else if (statusCode >= 400) {
                    TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.HTTP_FAILURES, `Threw Status ${statusCode} for ${originalUrl}`);
                    this.logger.warn(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else if (statusCode >= 300) {
                    this.logger.verbose(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else {
                    this.logger.log(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
            });
            res.on('error', (error) => {
                const errorDetails = (0, parseError_1.parseError)(error, process.env.clientId);
                TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.HTTP_FAILURES, `Error at req for ${originalUrl}\nMessage: ${errorDetails.message}`);
            });
        }
        else {
            if (originalUrl.includes('Video')) {
                this.logger.log(`Excluded endpoint hit: ${originalUrl} (length: ${originalUrl.length})`);
            }
        }
        next();
    }
};
exports.LoggerMiddleware = LoggerMiddleware;
exports.LoggerMiddleware = LoggerMiddleware = __decorate([
    (0, common_1.Injectable)()
], LoggerMiddleware);
//# sourceMappingURL=logger.middleware.js.map