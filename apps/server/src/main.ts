import 'reflect-metadata';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ParseController } from './parse/parse.controller';
import { DeepSeekParser } from './parse/deepseek-parser';

config();
config({ path: resolve(process.cwd(), '../../.env') });

@Module({ controllers: [ParseController], providers: [DeepSeekParser] })
class AppModule {}

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: process.env.NODE_ENV === 'test' ? false : undefined });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const host = process.env.PARSE_HOST ?? '127.0.0.1';
  const port = Number(process.env.PARSE_PORT ?? 3777);
  await app.listen(port, host);
}

if (process.env.NODE_ENV !== 'test') void bootstrap();
