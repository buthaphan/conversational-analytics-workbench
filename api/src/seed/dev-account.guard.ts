import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { PrismaClient } from "../generated/prisma/client";
import { DEV_ACCOUNT_EMAIL } from "./dev-seed";

/** In production, refuses to start while the development account exists (AC-12). */
@Injectable()
export class DevAccountGuard implements OnApplicationBootstrap {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.nodeEnv !== "production") return;
    const found = await this.prisma.user.count({ where: { email: DEV_ACCOUNT_EMAIL } });
    if (found > 0) {
      throw new Error(
        `Refusing to start in production: the development account ${DEV_ACCOUNT_EMAIL} exists. Delete it first.`,
      );
    }
  }
}
