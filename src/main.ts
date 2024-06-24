import { NestFactory } from '@nestjs/core';
import mongoose from 'mongoose'
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
// import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('NestJS and Express API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // fs.writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));
  SwaggerModule.setup('api', app, document);
  mongoose.set('debug', true)
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
  }));
  await app.init();
  await app.listen(3000);
}
bootstrap();
