import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { type AuthenticatedRequest, SessionGuard } from "../auth/session.guard";
import { MessageDto, SwitchDto } from "./analysis.dto";
import { LlmClient } from "./llm/llm-client";
import {
  AnalysisOrchestrator,
  type AnalysisState,
  type TurnResult,
} from "./orchestrator/orchestrator";

/**
 * The signed-in user's analysis session (TASK-003 AC-12, AC-13). Every route acts only on the
 * analysis session of the caller's own login session; POSTs also pass the global Origin guard.
 */
@Controller("analysis")
@UseGuards(SessionGuard)
export class AnalysisController {
  constructor(
    private readonly orchestrator: AnalysisOrchestrator,
    private readonly llm: LlmClient,
  ) {}

  @Get("state")
  async state(
    @Req() request: AuthenticatedRequest,
  ): Promise<AnalysisState & { demoExamples: string[] | null }> {
    const state = await this.orchestrator.getState(request.auth.sessionId, request.auth.user.id);
    return { ...state, demoExamples: this.llm.demoExamples };
  }

  @Post("messages")
  @HttpCode(200)
  message(@Req() request: AuthenticatedRequest, @Body() body: MessageDto): Promise<TurnResult> {
    return this.orchestrator.handleMessage(request.auth.sessionId, request.auth.user.id, body.text);
  }

  @Post("switch")
  @HttpCode(200)
  choose(@Req() request: AuthenticatedRequest, @Body() body: SwitchDto): Promise<TurnResult> {
    return this.orchestrator.handleSwitch(
      request.auth.sessionId,
      request.auth.user.id,
      body.choice,
    );
  }
}
