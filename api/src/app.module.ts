import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AnalysisModule } from "./analysis/analysis.module";
import { AuthModule } from "./auth/auth.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { OriginGuard } from "./security/origin.guard";
import { DevAccountGuard } from "./seed/dev-account.guard";

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, AuthModule, AnalysisModule],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }, DevAccountGuard],
})
export class AppModule {}
