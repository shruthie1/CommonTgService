import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import mongoose from 'mongoose'
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import { Logger } from './utils';
import { ExceptionsFilter } from './interceptors/Exception-filter';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: Logger
  });
  const config = new DocumentBuilder()
    .setTitle('NestJS and Express API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'x-api-key', // Security name must match everywhere
    )
    .build();

  interface CustomRequest extends Request { }
  interface CustomResponse extends Response { }
  interface CustomNextFunction extends NextFunction { }

  app.use((req: CustomRequest, res: CustomResponse, next: CustomNextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    next();
  });

  app.enableCors({
    allowedHeaders: "*",
    origin: "*"
  });
  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  document.components ??= {};
  document.components.securitySchemes ??= {};
  document.security = [{ 'x-api-key': [] }]; // Global security requirement
  fs.writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));
  SwaggerModule.setup('apim', app, document,
    {
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
    }
  );
  mongoose.set('debug', true)
  app.useGlobalFilters(new ExceptionsFilter());
  app.useGlobalInterceptors(new TimeoutInterceptor(60000));
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    // whitelist: true,
    // forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true
    },
    // validationError: {
    //   target: false,
    //   value: undefined
    // }
  }));
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (reason, promise) => {
    console.log('Uncaught Exception at:');
    console.error(promise, reason);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received`);
    console.log("CTS exit Request")
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
