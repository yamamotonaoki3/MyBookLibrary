-- ステージング専用の架空データ（generate-seed.mjs が作った行）を削除する。条件は id >= 100000 のみ。
-- 適用: npx wrangler d1 execute mybooklibrary-staging-db --remote --env staging --file prisma/scripts/staging-volume/cleanup.sql
-- 本番 D1 には適用しないこと。子 → 親の順に消す。
DELETE FROM book_enrichment_items WHERE id >= 100000;
DELETE FROM book_enrichment_jobs WHERE id >= 100000;
DELETE FROM reading_statuses WHERE id >= 100000;
DELETE FROM award_entries WHERE id >= 100000;
DELETE FROM book_isbns WHERE id >= 100000;
DELETE FROM books WHERE id >= 100000;
DELETE FROM awards WHERE id >= 100000;
DELETE FROM authors WHERE id >= 100000;
