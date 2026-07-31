import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`PrismaKit NestJS example listening on http://localhost:${port}`);
  console.log(`Try: curl http://localhost:${port}/users/demo-user`);
}

void bootstrap();
