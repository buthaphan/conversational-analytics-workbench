-- TASK-005 AC-6: a time series' retrieval parameters and its retrieval date (today cut-off, S7).
ALTER TABLE "result_sets" ADD COLUMN "parameters" JSONB,
ADD COLUMN "as_of" DATE;
