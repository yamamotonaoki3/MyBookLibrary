-- AddColumn
ALTER TABLE `reviews` ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 1;
