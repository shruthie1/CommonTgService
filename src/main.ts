import { setProcessListeners } from './processListeners';
setProcessListeners();
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import mongoose from 'mongoose'
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import { Logger } from './utils';
import { ExceptionsFilter } from './interceptors/Exception-filter';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';

async function bootstrap() {
  try {
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


    await app.init();
    await app.listen(process.env.PORT || 9002);
    console.log(`Application is running on: http://localhost:${process.env.PORT || 9002}`);
  } catch (error) {
    console.error('Error during application bootstrap:', error);
    process.exit(1);
  }
}
bootstrap();
