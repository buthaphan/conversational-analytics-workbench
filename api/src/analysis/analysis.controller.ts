import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { type AuthenticatedRequest, SessionGuard } from "../auth/session.guard";
import { MessageDto, SwitchDto } from "./analysis.dto";
import { ANSWERS } from "./answers/answers";
import { LlmClient } from "./llm/llm-client";
import {
  AnalysisOrchestrator,
  type AnalysisState,
  SessionEndedError,
  TurnInProgressError,
  type TurnResult,
  TurnSupersededError,
} from "./orchestrator/orchestrator";

/** 409 while another turn runs (TASK-004 AC-1); 401 when the session ended during the request. */
async function mapTurnErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TurnInProgressError)
      throw new ConflictException({ code: "turn_in_progress", message: ANSWERS.turnInProgress });
    if (error instanceof TurnSupersededError)
      throw new ConflictException({ code: "turn_superseded", message: ANSWERS.turnDropped });
    if (error instanceof SessionEndedError)
      throw new UnauthorizedException({ message: "Your session has ended. Sign in again." });
    throw error;
  }
}

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
    const state = await mapTurnErrors(() =>
      this.orchestrator.getState(request.auth.sessionId, request.auth.user.id),
    );
    return { ...state, demoExamples: this.llm.demoExamples };
  }

  @Post("messages")
  @HttpCode(200)
  message(@Req() request: AuthenticatedRequest, @Body() body: MessageDto): Promise<TurnResult> {
    return mapTurnErrors(() =>
      this.orchestrator.handleMessage(request.auth.sessionId, request.auth.user.id, body.text),
    );
  }

  @Post("switch")
  @HttpCode(200)
  choose(@Req() request: AuthenticatedRequest, @Body() body: SwitchDto): Promise<TurnResult> {
    return mapTurnErrors(() =>
      this.orchestrator.handleSwitch(request.auth.sessionId, request.auth.user.id, body.choice),
    );
  }
}
