import { Module } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AnalysisController } from "./analysis.controller";
import { ModelContextBuilder } from "./context/model-context";
import { DataSource } from "./data/data-source";
import { FixtureDataSource } from "./data/fixture-data-source";
import { ResultEngine } from "./engine/result-engine";
import { DemoLlmClient } from "./llm/demo-llm-client";
import { LlmClient, UnconfiguredLlmClient } from "./llm/llm-client";
import { AnalysisOrchestrator } from "./orchestrator/orchestrator";
import { AnalysisCleanup } from "./storage/analysis-cleanup";

/**
 * Conversational analytics (TASK-003). Production code depends only on the DataSource and LlmClient
 * interfaces; this module chooses the adapters. TASK-004 adds the BigQuery and Claude adapters.
 */
@Module({
  imports: [SessionsModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisCleanup,
    SessionGuard,
    ResultEngine,
    ModelContextBuilder,
    AnalysisOrchestrator,
    { provide: DataSource, useFactory: () => new FixtureDataSource() },
    {
      provide: LlmClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.analysisModel === "demo" ? new DemoLlmClient() : new UnconfiguredLlmClient(),
    },
  ],
})
export class AnalysisModule {}
