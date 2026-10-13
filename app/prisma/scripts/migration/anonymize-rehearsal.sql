-- リハーサル用: ローカルの MySQL に復元した本番相当のデータを、個人が特定できない架空の値に置き換える（#690）。
--
-- 実行先は、リハーサル専用のローカル MySQL（Docker）だけ。本番・開発用の DB には実行しない。
-- 手順は docs/d1-rehearsal-runbook.md。実行は、メールの重複・JSON の null の事前確認（--dry-run）のあと。
--   （このスクリプトは Json 列の値を置き換えるため、実データの JSON の null を検出できなくなる）
--
-- 置き換えるもの: 氏名、メールアドレス、パスワードのハッシュ、合言葉のハッシュ、OAuth・セッションのトークン、
--   レビュー本文、通知本文、問い合わせ、監査ログ（メール・IP・詳細）、取り込みジョブのエラー本文。
-- 置き換えないもの: ID、関連、日時、役割、状態、本・著者・賞などの公開情報（件数・採番・列ごとの照合の対象にするため）。
--
-- メールは、大文字を含む値にする（移行時の小文字化 normalizeEmail が働くことを、照合で確認するため）。

START TRANSACTION;

SET @dummy_hash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

-- UNIQUE 列は、最終の値が実データの値と衝突しないよう、いったん一意な仮の値にしてから置き換える
UPDATE users SET email = CONCAT('tmp-', UUID(), '@example.com');
UPDATE accounts SET provider_account_id = CONCAT('tmp-', UUID());
UPDATE sessions SET session_token = CONCAT('tmp-', UUID());

UPDATE users SET
  name = CONCAT('testuser_', id),
  email = CONCAT('Rehearsal-User-', id, '@Example.com'),
  image = NULL,
  password = IF(password IS NULL, NULL, @dummy_hash),
  secret_word_hash = IF(secret_word_hash IS NULL, NULL, @dummy_hash);

UPDATE accounts SET
  provider_account_id = CONCAT('rehearsal-', id),
  refresh_token = IF(refresh_token IS NULL, NULL, 'rehearsal-token'),
  access_token = IF(access_token IS NULL, NULL, 'rehearsal-token'),
  id_token = IF(id_token IS NULL, NULL, 'rehearsal-token'),
  session_state = NULL;

UPDATE sessions SET session_token = CONCAT('rehearsal-session-', id);

-- 例外の本文は、接続情報や入力値を含み得る
UPDATE book_enrichment_items SET error_message = IF(error_message IS NULL, NULL, '[REHEARSAL] 匿名化したエラー');

-- identifier はメールアドレスのことがある。token は一意なので、重複しない値にする
UPDATE verification_tokens SET identifier = 'rehearsal@example.com', token = UUID();

UPDATE reviews SET body = CONCAT('[REHEARSAL] 匿名化した感想 ', id);

UPDATE notifications SET content = CONCAT('[REHEARSAL] 匿名化した通知 ', id);

UPDATE contact_inquiries SET
  name = CONCAT('testuser_inquiry_', id),
  email = CONCAT('rehearsal-inquiry-', id, '@example.com'),
  subject = CONCAT('[REHEARSAL] 件名 ', id),
  body = CONCAT('[REHEARSAL] 匿名化した問い合わせ ', id);

UPDATE audit_logs SET
  actor_email = IF(actor_email IS NULL, NULL, CONCAT('rehearsal-actor-', id, '@example.com')),
  ip_address = IF(ip_address IS NULL, NULL, '192.0.2.1'),
  detail = IF(detail IS NULL, NULL, JSON_OBJECT('anonymized', TRUE));

-- 確認: 0 以外の行があれば、置き換え漏れ（件数だけを出す。値は出さない）
SELECT
  (SELECT COUNT(*) FROM users WHERE LOWER(email) NOT LIKE 'rehearsal-user-%@example.com') AS users_email_left,
  (SELECT COUNT(*) FROM users WHERE name NOT LIKE 'testuser\_%') AS users_name_left,
  (SELECT COUNT(*) FROM users WHERE password IS NOT NULL AND BINARY password <> BINARY @dummy_hash) AS users_password_left,
  (SELECT COUNT(*) FROM reviews WHERE body NOT LIKE '[REHEARSAL]%') AS reviews_left,
  (SELECT COUNT(*) FROM notifications WHERE content NOT LIKE '[REHEARSAL]%') AS notifications_left,
  (SELECT COUNT(*) FROM contact_inquiries WHERE email NOT LIKE 'rehearsal-inquiry-%@example.com') AS inquiries_left,
  (SELECT COUNT(*) FROM audit_logs WHERE actor_email IS NOT NULL AND actor_email NOT LIKE 'rehearsal-actor-%@example.com') AS audit_email_left,
  (SELECT COUNT(*) FROM accounts WHERE provider_account_id NOT LIKE 'rehearsal-%') AS accounts_left,
  (SELECT COUNT(*) FROM sessions WHERE session_token NOT LIKE 'rehearsal-session-%') AS sessions_left,
  (SELECT COUNT(*) FROM book_enrichment_items WHERE error_message IS NOT NULL AND error_message NOT LIKE '[REHEARSAL]%') AS enrichment_error_left;

COMMIT;
