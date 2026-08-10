/**
 * 全 project 共通。src/lib/logger.ts（pino）の出力を抑制する。
 *
 * 認証失敗・監査ログ等、異常系テストのたびに大量のログが標準出力に
 * 流れてテスト結果が読みにくくなるため、テスト実行中は silent にする。
 * `LOG_LEVEL` はモジュール読み込み時に評価されるため、logger を import
 * するどのテストより先に実行される setupFiles で設定する必要がある。
 */
process.env.LOG_LEVEL = "silent";
