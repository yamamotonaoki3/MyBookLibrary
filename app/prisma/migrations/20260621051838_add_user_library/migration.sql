-- CreateTable
CREATE TABLE `user_libraries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `systemid` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `pref` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_libraries_user_id_systemid_key`(`user_id`, `systemid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_libraries` ADD CONSTRAINT `user_libraries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
