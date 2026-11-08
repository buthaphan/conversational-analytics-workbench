-- TASK-004 AC-1: marker for the turn in progress (two-phase turn).
ALTER TABLE "analysis_sessions" ADD COLUMN "turn_id" UUID,
ADD COLUMN "turn_started_at" TIMESTAMPTZ(3);
