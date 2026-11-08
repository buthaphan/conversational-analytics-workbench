-- CreateTable
CREATE TABLE "analysis_sessions" (
    "id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_result_set_id" UUID,
    "view_settings" JSONB NOT NULL DEFAULT '{}',
    "pending_action" JSONB,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "analysis_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_messages" (
    "id" BIGSERIAL NOT NULL,
    "analysis_session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sets" (
    "id" UUID NOT NULL,
    "analysis_session_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_rows" (
    "result_set_id" UUID NOT NULL,
    "row_index" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "result_rows_pkey" PRIMARY KEY ("result_set_id","row_index")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_sessions_auth_session_id_key" ON "analysis_sessions"("auth_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_sessions_active_result_set_id_key" ON "analysis_sessions"("active_result_set_id");

-- CreateIndex
CREATE INDEX "analysis_sessions_user_id_idx" ON "analysis_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_messages_analysis_session_id_seq_key" ON "analysis_messages"("analysis_session_id", "seq");

-- CreateIndex
CREATE INDEX "result_sets_analysis_session_id_idx" ON "result_sets"("analysis_session_id");

-- AddForeignKey
ALTER TABLE "analysis_sessions" ADD CONSTRAINT "analysis_sessions_auth_session_id_fkey" FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_sessions" ADD CONSTRAINT "analysis_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_sessions" ADD CONSTRAINT "analysis_sessions_active_result_set_id_fkey" FOREIGN KEY ("active_result_set_id") REFERENCES "result_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_messages" ADD CONSTRAINT "analysis_messages_analysis_session_id_fkey" FOREIGN KEY ("analysis_session_id") REFERENCES "analysis_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sets" ADD CONSTRAINT "result_sets_analysis_session_id_fkey" FOREIGN KEY ("analysis_session_id") REFERENCES "analysis_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_result_set_id_fkey" FOREIGN KEY ("result_set_id") REFERENCES "result_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
