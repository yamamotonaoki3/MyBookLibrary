# MyBookLibrary — Claude Code ワークフロールール

## 絶対に守るルール

1. **作業は必ずイシューから始める**
   - コード変更・機能追加・バグ修正・ドキュメント更新、いかなる作業も GitHub Issue を先に作成する。
   - Issue なしにブランチを切ってはいけない。

2. **main ブランチへの直接プッシュ禁止**
   - `git push origin main` は禁止。GitHub 側でも強制されている。
   - 必ず作業ブランチから PR を作成し、マージで取り込む。

3. **PR はレビュー・動作確認後にマージする**
   - 自分でセルフレビューを行い、チェックリストを埋めてからマージする。
   - CI（整備後）が通っていることを確認する。

4. **内部設定・周知不要なものはGitHubに上げない**
   - `.claude/`（スキル・エージェント・設定等、Claude Codeの内部動作設定）は `.gitignore` で除外し、リポジトリにコミットしない。
   - 同様に、チーム外への周知が不要な個人環境依存の設定ファイルはコミット対象外とする。

---

## ブランチ命名規則

```
<prefix>/#<issue番号>-<英語の概要>
```

| プレフィックス | 用途 |
|---|---|
| `feature` | 機能追加 |
| `fix` | 不具合修正 |
| `chore` | リファクタ・設定変更・依存更新 |
| `docs` | ドキュメントのみの変更 |

**例:**
- `feature/#1-add-book-entity`
- `fix/#5-search-filter-error`
- `chore/#3-update-dependencies`
- `docs/#2-add-requirements`

---

## 作業フロー（毎回この順番で）

```
1. GitHub で Issue を作成（テンプレートを使う）
2. ブランチを切る: git checkout -b feature/#<番号>-<概要>
3. 実装
4. 品質チェックを実行する（/品質チェック スキルを使う）
5. Codex CLI でコードレビューを実行（codex review --uncommitted）し、指摘があれば Codex 自身に修正させる（次項参照）。指摘ゼロになるまで繰り返す。
6. ユーザーがブラウザで動作確認する（← ここで一度止まる。レビュー済みの完成形を確認する）
7. コミット: git commit
8. git push origin <ブランチ名>
9. GitHub で PR を作成（テンプレートを使う・Closes #<番号> を記載）
10. 念のため codex review --base main を1回実行し、指摘ゼロを確認（指摘があれば手順5と同様に修正）
11. セルフレビュー → マージ
12. ブランチ削除
```

**Codex CLIによるレビュー・修正フローについて**：このマシンには Codex CLI が導入されている。`codex review --base main` でブランチの差分を非対話的にレビューできるほか、`codex review --uncommitted` でコミット前の変更、`codex review --commit <SHA>` で特定コミットのレビューも可能。Claude Codeによるセルフレビューに加え、別モデルによる第二の視点として活用する。

指摘が出た場合は、以下の手順を**都度の指示なしに毎回**適用する（恒久ルール）。

1. `codex review --uncommitted`（または `--base main`）でレビューを実行する。
2. 指摘があれば、指摘内容と対象ファイルを踏まえた具体的な修正指示を添えて `codex exec "<修正指示>"` を実行し、**Codex 自身にコードを修正させる**。Claude Code が直接コードを修正するのは、Codex の応答が得られない・失敗する等、Codex による修正が行えない場合の代替手段とする。
3. Codex の修正後、Claude Code が品質チェック（ESLint等）で検証する。
4. 指摘ゼロになるまで `codex review` の再実行 → `codex exec` による修正を繰り返す。

---

## 学び・手直しの記録

Codexレビューで採用された指摘や、実装中の手直しを [docs/lessons-learned.md](docs/lessons-learned.md) に記録する。

- 記録先は `docs/lessons-learned.md`
- 記録のタイミング・基準・形式は `lessons-learned` Skill（`~/.claude/skills/lessons-learned/SKILL.md`）に従う
- ユーザーが明示的に「覚えておいて」と言った場合は、除外条件（秘密情報・一時的指示・既存ルールと矛盾する内容等）に触れない限り即記録する

---

## コミットメッセージ規則

```
<種別>: <変更内容の要約>（日本語可）

例:
feat: 本の登録機能を追加
fix: 検索フィルターのバグを修正
chore: 依存パッケージを更新
docs: 要件定義書を追加
```

---

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes（同一プロジェクト内） |
| データベース | MySQL 8.4 |
| ORM | Prisma 6 |
| スタイリング | Tailwind CSS v4 |
| コンテナ | Docker |
| 認証 | 未定（NextAuth.js 候補） |
| 外部API | 楽天ブックスAPI（候補） |
| デプロイ | AWS（EC2（Next.js standalone を systemd で起動）/ RDS MySQL / CloudFront / Lambda + EventBridge ルール（cron）/ SSM Parameter Store、Terraform 管理） |

---

## 責務分離のルール

新規実装および大きく改修する既存実装では、画面・HTTP・業務ロジック・データアクセスを同じファイルに混在させない。既存の直接依存は Issue #613 で段階的に移行する。小さな修正で無関係な範囲まで一括置換せず、混在を新たに増やさないことを優先する。

### 層ごとの責務

| 層 | 主な配置先 | 担当すること | 担当しないこと |
| --- | --- | --- | --- |
| Presentation | `app/**/page.tsx`、表示コンポーネント | 表示、画面イベント、画面向けデータの受け取り | Prisma クエリ、業務ルール、画面表示中の DB 書き込み |
| Controller | `app/api/**/route.ts`、Server Action | HTTP 入出力、認証・認可、入力形式の検証、Service 呼び出し、HTTP エラーへの変換 | 業務フロー、Prisma クエリの詳細、複数リソースをまたぐ更新判断 |
| Service / Query | `src/lib/` のユースケース単位のモジュール | 業務ルール、ユースケースの順序、トランザクション境界、画面向けの集計・整形 | HTTP 固有の `Request` / `Response`、UI の表示詳細 |
| Repository | `src/repositories/` | Prisma を使った永続化、DB クエリ、DB 固有の型・条件 | HTTP、画面表示、業務上の分岐判断 |
| Infrastructure | `src/lib/prisma.ts`、外部 API クライアント | Prisma Client と外部サービスへの接続 | アプリケーション固有の業務ルール |

### 実装時の必須ルール

1. `app/` 配下の新規・大規模改修コードから `@/lib/prisma` を直接 import しない。画面は Query / Service を、Route Handler は Service を呼び出す。
2. Prisma を呼び出す新規コードは `src/repositories/` に置く。複数の Repository をまたぐ処理や通知・外部 API を組み合わせる判断は Service に置く。
3. GET 画面のレンダリング中に DB を書き込まない。登録・更新・削除は明示的な API または Server Action を通す。
4. Route Handler では、入力値を Zod などで検証し、認証・認可を確認した後に Service を呼ぶ。`Request` / `Response` を Service や Repository へ渡さない。
5. 単純な読み取りでも、画面から直接 Prisma を呼ばず、用途が分かる Query 関数として切り出す。形式だけの Repository 増殖は避け、1回限りの Query は Service / Query モジュールにまとめてよい。
6. 既存コードに例外が必要な場合は、理由と移行先 Issue をコメントまたは Issue に残す。例外を新しい通常ルールにしない。

### テストとレビュー

- Service はユースケース単位で単体テストする。Repository は Prisma / D1 アダプタとの結合テストで担保する。
- Route Handler は認可、入力検証、Service の結果を正しい HTTP 応答へ変換することをテストする。
- レビュー時は、`app/` からの Prisma 直接 import、画面レンダリング中の書き込み、Route Handler 内の複数ユースケース混在を確認する。
- DB を MySQL から D1 へ移す際も、Presentation / Controller が DB 方言や Prisma 固有型へ依存しないことを確認する。

### 新しい技術選定が必要になったとき

上記は決定済みの技術方針であり、変更しない。**今後、明記の無い新しい技術要素の選定が必要になった場合は、`resolve-tech-stack` Skill（`~/.claude/skills/resolve-tech-stack/SKILL.md`）に従う。** 明記が無ければ必ずユーザーに確認し、決定したらバージョンを明記した上でこのPCでの利用可否を検査する。導入が必要な場合は手順を提示し、実際の導入はユーザーが行う。

## アプリ起動手順

```bash
# 1. データベース起動
docker compose up -d

# 2. 開発サーバー起動（app/ ディレクトリで）
cd app
npm run dev
```

## テスト実行

```bash
cd app
npm test
```
