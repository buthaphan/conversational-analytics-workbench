import { Module } from "@nestjs/common";
import { Clock, SystemClock } from "../time/clock";
import { SessionCleanupRegistry } from "./session-cleanup";
import { SessionStore } from "./session.store";
import { SessionSweeper } from "./session.sweeper";

@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    SessionCleanupRegistry,
    SessionStore,
    SessionSweeper,
  ],
  exports: [Clock, SessionCleanupRegistry, SessionStore],
})
export class SessionsModule {}
