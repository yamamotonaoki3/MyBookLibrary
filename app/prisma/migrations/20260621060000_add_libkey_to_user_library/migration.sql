-- libkey カラムを追加
ALTER TABLE `user_libraries` ADD COLUMN `libkey` VARCHAR(191) NOT NULL DEFAULT '';

-- 新しい unique 制約を先に追加（外部キーのインデックスとしても機能する）
ALTER TABLE `user_libraries` ADD UNIQUE INDEX `user_libraries_user_id_systemid_libkey_key`(`user_id`, `systemid`, `libkey`);

-- 旧 unique 制約を削除（新インデックスが user_id をカバーするため安全）
DROP INDEX `user_libraries_user_id_systemid_key` ON `user_libraries`;
