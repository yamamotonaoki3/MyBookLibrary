-- AlterTable
ALTER TABLE `users` ADD COLUMN `email_verified` DATETIME(3) NULL,
    ADD COLUMN `image` VARCHAR(191) NULL;
