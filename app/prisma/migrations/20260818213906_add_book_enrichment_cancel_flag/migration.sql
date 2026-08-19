-- AlterTable
ALTER TABLE `book_enrichment_jobs` ADD COLUMN `cancel_requested` BOOLEAN NOT NULL DEFAULT false;
