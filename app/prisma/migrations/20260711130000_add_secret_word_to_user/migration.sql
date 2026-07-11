-- パスワードリセット時の本人確認に使う「秘密の言葉」関連カラムを追加
ALTER TABLE `users`
  ADD COLUMN `secret_word_hash` VARCHAR(191) NULL,
  ADD COLUMN `secret_word_fail_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `secret_word_locked_until` DATETIME(3) NULL;
