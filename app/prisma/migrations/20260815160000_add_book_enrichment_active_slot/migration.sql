-- AlterTable
ALTER TABLE `book_enrichment_jobs` ADD COLUMN `active_slot` VARCHAR(191) NULL;

-- Existing running jobs, if any, claim the singleton slot before the constraint is added.
UPDATE `book_enrichment_jobs`
SET `active_slot` = 'book-enrichment'
WHERE `status` = 'running';

-- CreateIndex
CREATE UNIQUE INDEX `book_enrichment_jobs_active_slot_key` ON `book_enrichment_jobs`(`active_slot`);
