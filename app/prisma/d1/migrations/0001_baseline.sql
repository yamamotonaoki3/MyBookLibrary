-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "email_verified" DATETIME,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "login_fail_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "secret_word_hash" TEXT,
    "secret_word_fail_count" INTEGER NOT NULL DEFAULT 0,
    "secret_word_locked_until" DATETIME,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_libraries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "systemid" TEXT NOT NULL,
    "libkey" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "pref" TEXT NOT NULL,
    "city" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_libraries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "authors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "books" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "author_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT,
    "published_at" DATETIME NOT NULL,
    "published_at_unknown" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rakuten',
    "created_by_user_id" INTEGER,
    CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "books_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "book_isbns" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "book_id" INTEGER NOT NULL,
    "isbn" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'rakuten',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "book_isbns_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "awards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "award_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "book_id" INTEGER NOT NULL,
    "award_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "award_entries_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "award_entries_award_id_fkey" FOREIGN KEY ("award_id") REFERENCES "awards" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "favorite_authors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "favorite_authors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "favorite_authors_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reading_statuses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "reading_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reading_statuses_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "is_spoiler" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "likes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "review_id" INTEGER NOT NULL,
    CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "likes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "review_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actor_id" INTEGER,
    "book_isbn" TEXT,
    "book_title" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "follows" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "follower_id" INTEGER NOT NULL,
    "following_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_type" TEXT NOT NULL,
    "actor_user_id" INTEGER,
    "actor_email" TEXT,
    "target_type" TEXT,
    "target_id" INTEGER,
    "detail" JSONB,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "book_enrichment_jobs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "active_slot" TEXT,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "done_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "started_by_user_id" INTEGER,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "last_tick_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "book_enrichment_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "result_detail" JSONB,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "book_enrichment_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "book_enrichment_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "book_enrichment_items_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_libraries_user_id_systemid_libkey_key" ON "user_libraries"("user_id", "systemid", "libkey");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "book_isbns_isbn_key" ON "book_isbns"("isbn");

-- CreateIndex
CREATE INDEX "book_isbns_book_id_idx" ON "book_isbns"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "awards_name_key" ON "awards"("name");

-- CreateIndex
CREATE UNIQUE INDEX "award_entries_book_id_award_id_year_key" ON "award_entries"("book_id", "award_id", "year");

-- CreateIndex
CREATE INDEX "favorite_authors_author_id_idx" ON "favorite_authors"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_authors_user_id_author_id_key" ON "favorite_authors"("user_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_statuses_user_id_book_id_key" ON "reading_statuses"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_review_id_key" ON "likes"("user_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_user_id_review_id_key" ON "reports"("user_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_type_book_isbn_key" ON "notifications"("user_id", "type", "book_isbn");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_created_at_idx" ON "audit_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "book_enrichment_jobs_active_slot_key" ON "book_enrichment_jobs"("active_slot");

-- CreateIndex
CREATE INDEX "book_enrichment_jobs_status_idx" ON "book_enrichment_jobs"("status");

-- CreateIndex
CREATE INDEX "book_enrichment_items_job_id_status_idx" ON "book_enrichment_items"("job_id", "status");

