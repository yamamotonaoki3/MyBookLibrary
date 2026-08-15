-- AlterTable
ALTER TABLE `books` ADD COLUMN `published_at_unknown` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `book_enrichment_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `total_count` INTEGER NOT NULL DEFAULT 0,
    `done_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `fail_count` INTEGER NOT NULL DEFAULT 0,
    `started_by_user_id` INTEGER NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `last_tick_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `book_enrichment_jobs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `book_enrichment_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_id` INTEGER NOT NULL,
    `book_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error_message` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `book_enrichment_items_job_id_status_idx`(`job_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `book_enrichment_items` ADD CONSTRAINT `book_enrichment_items_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `book_enrichment_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `book_enrichment_items` ADD CONSTRAINT `book_enrichment_items_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
