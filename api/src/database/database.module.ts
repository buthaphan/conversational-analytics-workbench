import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { PrismaClient } from "../generated/prisma/client";

/** Disconnects the database client when the application stops. */
@Injectable()
class PrismaShutdown implements OnApplicationShutdown {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) }),
    },
    PrismaShutdown,
  ],
  exports: [PrismaClient],
})
export class DatabaseModule {}
