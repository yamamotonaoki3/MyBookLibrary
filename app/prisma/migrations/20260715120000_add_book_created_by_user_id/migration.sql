-- 手動登録本の登録者を記録するカラムを追加
ALTER TABLE `books` ADD COLUMN `created_by_user_id` INTEGER NULL;

-- FK: ユーザー削除時は NULL にする（本自体は残す）
ALTER TABLE `books` ADD CONSTRAINT `books_created_by_user_id_fkey`
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
