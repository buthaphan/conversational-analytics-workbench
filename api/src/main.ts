import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { APP_OPTIONS, configureApp } from "./app";
import { AppModule } from "./app.module";
import { loadConfig } from "./config/config";

async function bootstrap(): Promise<void> {
  // Validates configuration first, so unsafe settings stop the API before it listens.
  const { port, host } = loadConfig(process.env);
  const app = configureApp(
    await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS),
  );
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
