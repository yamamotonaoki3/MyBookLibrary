-- テスト用のダミーdumpファイル（実データ不使用、架空データのみ）
-- mysqldump --single-transaction --skip-extended-insert --default-character-set=utf8mb4 相当の出力形式を模している。

-- Table structure for table `users`
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `users`
INSERT INTO `users` (`id`, `name`, `email`) VALUES (1, 'テストユーザー1', 'testuser_001@example.com');
INSERT INTO `users` (`id`, `name`, `email`) VALUES (2, 'テストユーザー2', 'testuser_002@example.com');
INSERT INTO `users` (`id`, `name`, `email`) VALUES (3, 'テストユーザー3', 'testuser_003@example.com');

-- Table structure for table `books`
DROP TABLE IF EXISTS `books`;
CREATE TABLE `books` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(191) NOT NULL,
  `isbn` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `books_isbn_key` (`isbn`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `books`
INSERT INTO `books` (`id`, `title`, `isbn`) VALUES (1, 'テスト書籍1', NULL);
INSERT INTO `books` (`id`, `title`, `isbn`) VALUES (2, 'テスト書籍2', '9780000000002');

-- Table structure for table `accounts`（AUTO_INCREMENT列を持たない: PKはcuid文字列）
DROP TABLE IF EXISTS `accounts`;
CREATE TABLE `accounts` (
  `id` varchar(191) NOT NULL,
  `user_id` int NOT NULL,
  `provider` varchar(191) NOT NULL,
  `provider_account_id` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accounts_provider_provider_account_id_key` (`provider`,`provider_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accountsテーブルはデータ0件（INSERT文なし）

-- Table structure for table `_prisma_migrations`
DROP TABLE IF EXISTS `_prisma_migrations`;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `migration_name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `_prisma_migrations`
INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`) VALUES ('m1', 'c1', '20260602144024_init');
INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`) VALUES ('m2', 'c2', '20260607084326_add_report');
INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`) VALUES ('m3', 'c3', '20260609153743_add_auth_fields');
