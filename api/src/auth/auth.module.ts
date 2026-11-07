import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { RateLimiter } from "./rate-limiter";
import { SessionGuard } from "./session.guard";

@Module({
  imports: [SessionsModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, RateLimiter, SessionGuard],
})
export class AuthModule {}
