# Vercel HobbyのPreview環境構築（Issue #477）

親Issue #473（AWS→Vercel Hobby + Aiven MySQL Free移行）のうち、#479（Aiven検証DB構築）は完了済み、#478（移行・照合ツール作成）も実装完了・マージ済み。ユーザーの意向により、本番データ移行（#480リハーサル・#475本番切替）より先に、Aiven検証DB（#479で構築済み）とVercel Hobby環境の組み合わせで実際にアプリが動作することを確認する方針とした。

Vercelは元々の設計だったが、開発途中でAWS EC2+CloudFrontに切り替わった経緯があり、GitHub連携済みの4つのVercelプロジェクト（my-book-library-8jvw, m6iv, qxyi, ybqx）が当時の名残として存在し、いずれもデプロイ失敗している（Root Directory未設定が主因と推測）。このうち1つは新刊通知Cronボット用と判明しているが、詳細は本Issue完了後にユーザーがVercelダッシュボードで確認する。

**本ドキュメントのスコープ**: Vercelダッシュボード・Google Cloud Console側の手動設定（プロジェクト作成、環境変数登録、OAuth callback登録、Fluid Compute有効化）はユーザーが実施する。本ドキュメントはその手順書と、リポジトリ側で完了させた準備内容をまとめたものである。

## `vercel.json`の配置

Vercelプロジェクトのroot directoryを`app`に設定する場合、Vercelは`app/vercel.json`のみを読み込む仕様のため、従来リポジトリルートにあった`vercel.json`を`app/vercel.json`へ移動した。内容（Cron設定）は変更していない。

```json
{
  "crons": [
    {
      "path": "/api/cron/check-new-books",
      "schedule": "0 0 * * *"
    }
  ]
}
```

## クリーンビルド時のPrisma Client生成

`app/prisma/schema.prisma`の`generator client`は`output = "../src/generated/prisma"`というカスタム出力先を指定しているため、`npm install`直後に`prisma generate`が実行されないとビルドが失敗する。`app/package.json`に以下を追加した。

```json
"postinstall": "prisma generate"
```

Vercelは`npm install`→`postinstall`→ビルドコマンド（`next build --webpack`、変更なし）の順で実行するため、この対応でクリーンビルド時にPrisma Clientが確実に生成される。ローカルで`src/generated/prisma`を削除した状態から`npm install`を実行し、`postinstall`によって正しく再生成されることを確認済み。

## Preview buildでmigrationを自動実行しない方針

コードを確認した結果、`postinstall`にも`build`スクリプトにも`prisma migrate deploy`は含まれていない。**コード変更は不要**。

**Vercelダッシュボード側の注意点**: プロジェクト設定の「Build Command」をデフォルトから上書きする場合、`prisma migrate deploy`を含めないこと。migrationの適用は、これまで通り`prisma/scripts/migration/`配下のツール（Issue #478）または手動で行う方針とする。

## 環境変数一覧

Development / Preview / Productionそれぞれの環境変数をVercelダッシュボードの環境変数機能で分離して登録する。**実際の値はここに記載しない**（secrets-handling方針）。値の登録はVercelダッシュボードでのみ行う。

| 変数名 | 用途 | Development | Preview | Production |
|---|---|---|---|---|
| `DATABASE_URL` | DB接続文字列 | ローカルMySQL（`docker-compose.yml`） | **Aiven検証DB**（#479で構築済み） | 本番DB（移行完了後に設定） |
| `AUTH_SECRET` | Auth.js署名鍵 | 開発用の値 | Preview専用の値（本番と共用しない） | 本番専用の値 |
| `AUTH_GOOGLE_ID` | Google OAuthクライアントID | 開発用クライアント | Preview専用クライアント（下記「Google OAuth callback URL登録」参照） | 本番用クライアント |
| `AUTH_GOOGLE_SECRET` | Google OAuthクライアントシークレット | 同上 | 同上 | 同上 |
| `RAKUTEN_APP_ID` | 楽天ブックスAPI | 開発用 | 開発と共用可 | 本番用（レート制限を考慮） |
| `RAKUTEN_ACCESS_KEY` | 楽天ブックスAPI | 同上 | 同上 | 同上 |
| `RAKUTEN_API_BASE`（任意） | テスト時のスタブ差し替え用 | 未設定 | 未設定 | 未設定 |
| `CALIL_API_KEY` | カーリルAPI（図書館蔵書検索） | 開発用 | 開発と共用可 | 本番用 |
| `CALIL_API_BASE`（任意） | 同上 | 未設定 | 未設定 | 未設定 |
| `CRON_SECRET` | Cronエンドポイント認証（16文字以上必須） | 任意のダミー値 | Preview専用の値 | 本番専用の値 |

**AivenのCA証明書（TLS検証用）について**: `#479`の接続文字列（`sslaccept=strict&sslcert=../certs/aiven-ca.pem`）は、Prisma実行時に`app/certs/aiven-ca.pem`というファイルの存在を前提とする。このファイルは元々`.gitignore`の`*.pem`ルールで除外されていたが、**秘密鍵ではなく公開のCA証明書（サーバー検証専用、機密情報ではない）であるため、Vercel等のGitベースのデプロイ先へ確実に配置できるよう、今回のPRで`app/.gitignore`に例外を追加してリポジトリへコミットした**（`app/certs/aiven-ca.pem`）。これにより、環境変数として`DATABASE_URL`を登録するだけで、証明書ファイル自体は通常のソースコードと同様にデプロイに同梱される。証明書ファイルを個別にVercelへアップロードする作業は不要。

## Vercel CronのUTC/JST・Hobbyプランの制約

現在の`schedule: "0 0 * * *"`はUTC 0:00（= JST 9:00）を指定している。

Vercel公式ドキュメントで確認した Hobbyプランの制約は以下の通り（推測ではなく公式記載に基づく）。

- **実行頻度**: Hobbyプランは1日1回までのcronしか設定できない（それより高頻度な指定はデプロイ時にエラーになる）。
- **実行時刻の幅**: 指定した時刻ちょうどには実行されない。例えば`0 1 * * *`（毎日1:00）と指定した場合、実際には1:00〜1:59の間のどこかで実行される（負荷分散のため）。したがって、今回の`0 0 * * *`は「UTC 0:00〜0:59（JST 9:00〜9:59）の間のどこか」で実行される前提で運用する。
- **実行時間制限**: cronから呼び出される関数（`check-new-books`）の実行時間上限は、**Fluid Computeを有効化しているかどうかで変わる**。Fluid Computeを無効のまま（従来のデフォルト）だとHobbyプランは10秒でタイムアウトするが、本ドキュメントの手動作業チェックリストではFluid Computeの有効化を前提としており、その場合は関数ごとのFluid Compute実行時間上限（`maxDuration`設定、または該当プランの既定値）が適用される。**したがって「10秒」を絶対の上限として扱わず、Fluid Compute有効化後の実際の上限をVercelの公式ドキュメント・ダッシュボードで確認したうえで判断すること。**
- **配信の信頼性**: ベストエフォートであり、まれにネットワークエラー等で実行されないことがある。

**既存の`check-new-books`ルートに関する注意点**: 現在の実装（`app/src/app/api/cron/check-new-books/route.ts`）は、`notify: true`のお気に入り著者登録を1件ずつループし、それぞれ楽天ブックスAPIへ逐次アクセスする設計になっている（並列化すると楽天APIの429エラーになるため意図的に逐次）。**お気に入り著者の登録件数が増えると、実行時間上限を超える可能性がある。** 現在の運用規模（小規模・家族/知人向け）では問題にならない可能性が高いが、Preview環境で実際に動作確認する際に実行時間を計測し、必要であれば処理件数の分割や`maxDuration`の明示設定を別Issueとして検討することを推奨する。

## `next/image`のremotePatterns方針

**方針: 現状の最適化設定を維持する（変更しない）。**

調査結果:
- 書影URLは楽天ブックスAPIのレスポンスの`largeImageUrl`をそのまま使用しており（`app/src/lib/rakuten.ts`）、コード側でホスト名を固定していない。
- カーリルAPI（`app/src/lib/calil.ts`）は図書館の予約URL（`reserveurl`）のみを扱い、画像URLは一切扱っていない。

結論として、画像URLの発生源は楽天ブックスAPI側のホスト名に依存しており、コード側で特定ホストへ絞り込むと、楽天側のホスト名変更時に書影が表示されなくなるリスクがある。現在の`app/next.config.ts`の`images.remotePatterns`（`hostname: "**"`で全ホスト許可）はこのリスクを回避する設計として妥当と判断し、変更しない。

Vercel Hobbyプランの画像最適化には無料枠（目安: 月あたり1,000種類のソース画像）があるが、本アプリは家族・知人向けの小規模非商用運用であり、書籍点数も現時点で374件程度（Issue #482調査時点）のため、無料枠を超える可能性は低いと判断し、最適化を維持する方針とした。無料枠を超えた場合、Hobbyプランには従量課金の仕組みが無いため、それ以降の新しい画像の最適化が失敗する（追加課金は発生しない）。実際に上限へ近づいた場合はVercelダッシュボードの使用量画面で確認し、必要であれば`unoptimized`への切り替えを再検討する。

## Fluid Compute関連のPrisma Client実装確認

`app/src/lib/prisma.ts`は、`globalThis`にPrismaClientインスタンスをキャッシュし、`NODE_ENV !== "production"`の場合のみ再利用する典型的なシングルトンパターンで実装されている。これはPrisma公式のVercelデプロイガイドが推奨する実装パターンに沿っており、**コード変更は不要**と結論づける。

Fluid Compute自体はVercelプロジェクト設定側で有効化する機能であり、有効化後に実行環境（インスタンス）が再利用されることで、既存のグローバルキャッシュパターンがより効果的に機能し、DB接続数を抑えられる。実際に接続数が1に保たれるかどうかは、Fluid Compute有効化後にAivenダッシュボードの接続数メトリクスで実測する必要がある（本ドキュメントの「後日ユーザーが実施する手動作業チェックリスト」に記載）。

## Google OAuth callback URL登録手順

Preview環境・本番環境それぞれで、Google Cloud ConsoleのOAuthクライアント設定に以下の形式のリダイレクトURIを登録する必要がある。

```
https://<Preview用固定ドメイン>/api/auth/callback/google
https://<本番ドメイン>/api/auth/callback/google
```

**手順:**
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、対象プロジェクトを開く。
2. 「APIとサービス」→「認証情報」→ 該当のOAuth 2.0クライアントIDを開く。
3. 「承認済みのリダイレクトURI」に上記2つのURLを追加する。
4. 保存する（反映まで数分〜数時間かかる場合がある）。

**注意**: Preview環境で固定ドメインを使うには、VercelのPreview Deployment用の固定URL機能（プロジェクト設定のDomainsで、対象ブランチに紐づく固定ドメインを割り当てる）を別途設定する必要がある。デプロイのたびにURLが変わるプレビューURLをそのままOAuth callbackに登録することはできない。

## 今回のリポジトリ変更まとめ

- `vercel.json`（リポジトリルート）を削除し、`app/vercel.json`として同内容を新規作成
- `app/package.json`に`"postinstall": "prisma generate"`を追加
- 本ドキュメント（`docs/vercel-preview-setup-477.md`）を新規作成
- コード変更なし（確認のみ）: `app/src/lib/prisma.ts`（Fluid Compute対応済みと結論）、`app/next.config.ts`（remotePatterns現状維持と結論）

## 後日ユーザーが実施する手動作業チェックリスト

- [ ] Vercelダッシュボードで使用するプロジェクトを選定する（既存4つ: my-book-library-8jvw, m6iv, qxyi, ybqxのうちどれを使うか、または新規作成するか。新刊通知Cronボット用のプロジェクトは別途確認予定のため触れない）
- [ ] 選定したプロジェクトのRoot Directoryを`app`に設定する
- [ ] Development / Preview / Productionそれぞれの環境変数を、上記「環境変数一覧」の表に従って登録する（PreviewのDATABASE_URLはAiven検証DBを使用）
- [ ] Google Cloud ConsoleでPreview用・本番用のOAuth callback URLを登録する（上記手順参照）
- [ ] VercelプロジェクトのPreview Deployment用固定ドメインを設定する（OAuth callback登録の前提）
- [ ] Fluid Computeを有効化する
- [ ] デプロイ後、Aivenダッシュボードの接続数メトリクスでPrisma Clientの接続数が1に保たれることを実測で確認する
- [ ] **Vercelのcron（`vercel.json`のschedule）はProductionデプロイに対してのみ発火し、Previewデプロイでは実行されない。** そのため以下2項目は、Preview URLではなく本番用（またはcron検証専用の）Productionデプロイで確認すること。
  - [ ] Vercel Cronが実際に1日1回実行されることと、実行時刻のずれ幅（UTC 0:00〜0:59の範囲内か）を実測で記録する
  - [ ] `check-new-books`の実行時間が、Fluid Compute有効化後の実行時間上限内に収まっているか確認する（Vercelダッシュボードの Function Logs で確認可能）
- [ ] Previewデプロイが成功し、パスワード認証・Googleログイン・主要画面・APIが動作することを確認する（Issue #477の受け入れ基準）
- [ ] PreviewからAWS本番DBへ接続しないこと（DATABASE_URLがAiven検証DBを指していること）を確認する（Issue #477の受け入れ基準）
