-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(191) NOT NULL,
    `actor_user_id` INTEGER NULL,
    `actor_email` VARCHAR(191) NULL,
    `target_type` VARCHAR(191) NULL,
    `target_id` INTEGER NULL,
    `detail` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_event_type_created_at_idx`(`event_type`, `created_at`),
    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
