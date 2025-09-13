"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const mongoose_1 = __importDefault(require("mongoose"));
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
const Exception_filter_1 = require("./interceptors/Exception-filter");
const timeout_interceptor_1 = require("./interceptors/timeout.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: utils_1.Logger
    });
    const config = new swagger_1.DocumentBuilder()
        .setTitle('NestJS and Express API')
        .setDescription('API documentation')
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
        .build();
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
        next();
    });
    app.enableCors({
        allowedHeaders: "*",
        origin: "*"
    });
    const document = swagger_1.SwaggerModule.createDocument(app, config, {
        deepScanRoutes: true,
    });
    document.components ??= {};
    document.components.securitySchemes ??= {};
    document.security = [{ 'x-api-key': [] }];
    fs.writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));
    swagger_1.SwaggerModule.setup('apim', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
            authAction: {
                'x-api-key': {
                    name: 'x-api-key',
                    schema: { type: 'apiKey', in: 'header', name: 'x-api-key' },
                    value: process.env.API_KEY || 'santoor',
                },
            },
        },
    });
    mongoose_1.default.set('debug', true);
    app.useGlobalFilters(new Exception_filter_1.ExceptionsFilter());
    app.useGlobalInterceptors(new timeout_interceptor_1.TimeoutInterceptor(60000));
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        transformOptions: {
            enableImplicitConversion: true
        },
    }));
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (reason, promise) => {
        console.log('Uncaught Exception at:');
        console.error(promise, reason);
    });
    let isShuttingDown = false;
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        console.log(`${signal} received`);
        console.log("CTS exit Request");
        await app.close();
        process.exit(0);
    };
    process.on('exit', async () => {
        console.log('Application closed');
    });
    process.on('SIGINT', async () => {
        console.log('SIGINT received');
        await shutdown('SIGINT');
    });
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received');
        await shutdown('SIGTERM');
    });
    process.on('SIGQUIT', async () => {
        console.log('SIGQUIT received');
        await shutdown('SIGQUIT');
    });
    await app.init();
    await app.listen(process.env.PORT || 9002);
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
//# sourceMappingURL=main.js.map