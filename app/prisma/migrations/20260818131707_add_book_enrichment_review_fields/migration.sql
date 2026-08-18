-- AlterTable
ALTER TABLE `book_enrichment_items` ADD COLUMN `result_detail` JSON NULL;

-- AlterTable
ALTER TABLE `book_enrichment_jobs` ADD COLUMN `review_count` INTEGER NOT NULL DEFAULT 0;
