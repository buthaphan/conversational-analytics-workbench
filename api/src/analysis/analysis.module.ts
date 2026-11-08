import { Module } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AnalysisController } from "./analysis.controller";
import { ModelContextBuilder } from "./context/model-context";
import { BigQueryDataSource, createBigQueryRunner } from "./data/bigquery-data-source";
import { DataSource } from "./data/data-source";
import { FixtureDataSource } from "./data/fixture-data-source";
import { ResultEngine } from "./engine/result-engine";
import { ClaudeLlmClient, createAnthropicMessages } from "./llm/claude-llm-client";
import { DemoLlmClient } from "./llm/demo-llm-client";
import { LlmClient, UnconfiguredLlmClient } from "./llm/llm-client";
import { AnalysisOrchestrator } from "./orchestrator/orchestrator";
import { AnalysisCleanup } from "./storage/analysis-cleanup";

/**
 * Conversational analytics (TASK-003, TASK-004). Production code depends only on the DataSource and
 * LlmClient interfaces; this module chooses the adapters from the configuration (TASK-004 AC-4).
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
    {
      provide: DataSource,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.dataSource.kind === "bigquery"
          ? new BigQueryDataSource(createBigQueryRunner(config.dataSource.projectId))
          : new FixtureDataSource(),
    },
    {
      provide: LlmClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.analysisModel === "claude" && config.anthropic)
          return new ClaudeLlmClient(
            createAnthropicMessages(config.anthropic.apiKey),
            config.anthropic.model,
          );
        return config.analysisModel === "demo" ? new DemoLlmClient() : new UnconfiguredLlmClient();
      },
    },
  ],
})
export class AnalysisModule {}
