-- DropForeignKey
ALTER TABLE `likes` DROP FOREIGN KEY `likes_review_id_fkey`;

-- DropIndex
DROP INDEX `likes_review_id_fkey` ON `likes`;

-- AddForeignKey
ALTER TABLE `likes` ADD CONSTRAINT `likes_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
