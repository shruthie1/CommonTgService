/* eslint-disable @typescript-eslint/no-empty-object-type */
import { NestFactory } from '@nestjs/core';
import mongoose from 'mongoose'
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  SwaggerModule.setup('api', app, document);
  mongoose.set('debug', true)
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
  await app.listen(process.env.PORT || 9000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
