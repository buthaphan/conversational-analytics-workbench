-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_in_attempts" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "client_ip" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sign_in_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_user_id_key" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_ended_at_idx" ON "auth_sessions"("ended_at");

-- CreateIndex
CREATE INDEX "auth_sessions_last_activity_at_idx" ON "auth_sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "sign_in_attempts_email_attempted_at_idx" ON "sign_in_attempts"("email", "attempted_at");

-- CreateIndex
CREATE INDEX "sign_in_attempts_client_ip_attempted_at_idx" ON "sign_in_attempts"("client_ip", "attempted_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Added by hand (Prisma schemas cannot express CHECK constraints): emails are stored lowercase,
-- so the unique index on "email" makes addresses unique regardless of letter case.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
