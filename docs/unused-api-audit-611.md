# 未使用 API 監査記録（#611）

現行 AWS 本番で使用されていない Route Handler を、静的解析と読み取り専用の本番通信確認で判定するための記録。削除は Cloudflare 移行 Issue [#609](https://github.com/yamamotonaoki3/MyBookLibrary/issues/609) 完了後に行う。

## 判定方法

1. アプリ本体、`app/src/__tests__/`、`app/e2e/`、ドキュメントを候補 API の完全パスで検索する。
2. 動的 URL、Cron、外部起点は個別に確認し、文字列検索だけで未使用とは判定しない。
3. 一般ユーザーで AWS 本番へログインし、更新・登録・削除・管理者機能を使わずに対象画面を閲覧する。ブラウザの Network から `/api/*` の**パスだけ**を確認する。Cookie、認証情報、個人データ、レスポンス本文は記録しない。
4. 1 と 3 が一致した API だけを削除対象に確定する。片方でも根拠が不足する API は維持する。

> 読み取り専用の画面操作は「現在の通常 UI が呼ばない」ことを確認するものであり、過去の外部利用や未知のクライアントがないことを単独で証明するものではない。

## 静的解析結果（2026-09-23）

| 候補 API | 現行画面のデータ取得 | アプリ本体・テストの Route 呼び出し | 仕様・計画上の参照 | 仮判定 |
| --- | --- | --- | --- | --- |
| `GET /api/awards/[id]/books` | `app/src/app/awards/_components/BookList.tsx` が Prisma から受賞作と読書状態を取得 | なし | `requirements.md`、`features/awards.md`、`test-plan.md` | 本番確認待ち |
| `GET /api/awards/progress` | `app/src/app/page.tsx` が Prisma から読書進捗を計算 | なし | `requirements.md`、`api-spec.md`、`features/awards.md`、`test-plan.md` | 本番確認待ち |
| `GET /api/favorite-authors/[authorId]/books` | `app/src/app/favorite-authors/[authorId]/page.tsx` が `searchBooks` と Prisma を直接利用 | なし | `requirements.md`、`features/favorite-authors.md`、`test-plan.md` | 本番確認待ち |
| `GET /api/favorite-authors/recommendations` | `app/src/app/favorite-authors/page.tsx` が `getRecommendedAuthors` を直接利用 | なし | `requirements.md` | 本番確認待ち |
| `GET /api/follows/recommendations` | `app/src/app/settings/follows/page.tsx` が `getRecommendedUsers` を直接利用 | なし | `requirements.md`、`features/follow.md`、`test-plan.md` | 本番確認待ち |
| `GET /api/reviews/stats` | `app/src/app/page.tsx` が Prisma から受領いいね数を直接取得 | なし | `requirements.md`、`features/reviews.md`、`test-plan.md` | 本番確認待ち |

`app/src/app/api/**/route.ts` 自身を除外した完全パス検索では、`app/src/` に候補 API を呼ぶコードは見つからなかった。`app/src/__tests__/` と `app/e2e/` にも候補 API の完全パス参照はない。

### 現行 AWS のソース確認（2026-09-23）

AWS の EC2 は起動時に GitHub `main` の ZIP を取得してビルドする。稼働中インスタンスの起動時点での `main` はローカル HEAD の `f82e431b432f7f51c076870cc80452aac1cd57ae` であり、その後に `main` のコミットはない。

ただし、このデプロイ方式はコミット SHA を EC2 に保存しない。対象ファイルの読み取り専用ハッシュ照合では、候補に直接関係する Route Handler と一部画面は一致した一方、ダッシュボードとお気に入り著者一覧の内容ハッシュには差があった。改行コードだけでは説明できない差のため、**本番とローカルが完全に同一コミットであるとは断定しない**。

それでも本番の実ソースを検索した結果、候補 API の URL は対象画面から参照されず、次の直接取得が確認できた。

- ダッシュボード: `prisma.award.findMany` と `prisma.like.count`
- 受賞作品一覧: `prisma.awardEntry.findMany`
- お気に入り著者一覧: `getRecommendedAuthors`
- お気に入り著者詳細: `searchBooks` と `prisma.book.findMany`
- フォロー管理: `getRecommendedUsers`

これは「本番の現在の画面実装も候補 API を呼ばない」根拠になるが、ブラウザ通信確認および本番とローカルの完全一致確認を代替するものではない。

### 外部起点の確認

- 現行 AWS の定期実行は `/api/cron/check-new-books` であり、6候補とは別 Route である。
- 動的 Route の利用箇所は、候補以外の `/api/users/[id]/favorite-authors`、管理 API、レビューのいいね・通報などで確認する。今回の完全パス検索結果だけを理由に、それらを未使用と扱わない。
- 現時点で候補 6 API を外部公開 API として維持する契約・利用者はリポジトリ内に記録されていない。ただし、外部クライアントの存在は本番通信確認および運用上の確認が完了するまで否定しない。

## AWS 本番の読み取り専用通信確認

| 確認画面 | 操作範囲 | 候補 API のリクエスト | 実施状況 |
| --- | --- | --- | --- |
| ダッシュボード | 表示のみ | `/api/awards/progress`、`/api/reviews/stats` | 未実施 |
| 受賞作品一覧 | 賞・年度で絞り込み、表示のみ | `/api/awards/[id]/books`、`/api/awards/progress` | 未実施 |
| お気に入り著者一覧 | 表示のみ | `/api/favorite-authors/recommendations` | 未実施 |
| お気に入り著者詳細 | 既存著者を表示・検索のみ | `/api/favorite-authors/[authorId]/books` | 未実施 |
| フォロー管理 | 表示のみ | `/api/follows/recommendations` | 未実施 |
| マイレビュー | 表示のみ | `/api/reviews/stats` | 未実施 |

この作業環境では監査開始時点でブラウザ接続を取得できなかったため、通信確認はまだ実行していない。上表は実測値ではなく、確認対象の対応表である。実測後にパスのみを追記する。

## #609 完了後の削除手順

1. 本番通信確認と静的解析が一致した候補だけを削除対象として確定する。
2. 各 Route Handler を削除し、今回の候補だけを対象に `docs/requirements.md`、`docs/api-spec.md`、機能別定義書、`docs/test-plan.md` の参照を更新する。
3. 各画面が Server Component または既存共通関数から同じデータを取得し続けることを確認する。
4. 対象画面の E2E が表示と利用者操作を検証しているか確認し、不足があれば追加する。
5. 型チェック、lint、関連 Jest、対象 E2E、Cloudflare 対応ビルドを実行する。

## 削除確定の条件

- 本番の対象画面を読み取り専用で操作した通信記録に候補 API が現れない。
- 静的解析でアプリ本体、テスト、Cron・外部起点に利用がない。
- 外部利用または用途不明の根拠が出ていない。
- #609 が完了している。

上記のいずれかを満たさない API は削除せず、理由をこの文書と Issue に記録する。
