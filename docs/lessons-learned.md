# 学び・手直しの記録

Codexレビューで採用された指摘や、実装中の手直しのうち、次回以降に活かすべき内容を記録する。記録するタイミング・基準・形式は `lessons-learned` Skill（`~/.claude/skills/lessons-learned/SKILL.md`）に従う。手動で追記する場合も、以下の形式を保つこと。

## 索引

- 2026-08-04: NextAuth `update()` の2つの落とし穴（引数なし呼び出しはGET化／SessionProvider初回ロード中は無視される）
- 2026-08-06: Prisma共通モックは手動モック（`__mocks__`）＋Proxyで実装する（jest.mockのhoisting制約とProxyの落とし穴）
- 2026-08-08: ドキュメントの「事実」も実物で裏を取る（Next 16のproxyはNode.js runtimeが既定／ダミーAPIキーは実リクエストを飛ばしていない証明にならない）
- 2026-08-11: 実DBへの安全ガードは全ての実行経路（Jest／Playwright／CLI）に個別に必要。1箇所直しても他の経路に穴が残る
- 2026-08-11: `next dev`はENV変数を事前設定すれば`.env.local`より優先される／Next.js 16のSSRF対策とE2Eスタブの組み合わせ方
- 2026-08-12: `jest.useFakeTimers()`（modern）は`Date.now()`も一緒にフェイクするため、`setTimeout`＋`Date.now()`デッドライン処理は`advanceTimersByTimeAsync`で実時間ゼロで検証できる
- 2026-08-13: 楽観的UI更新（API応答を待たずに見た目を先に変える実装）を検証するE2E/結合テストは、UIの見た目だけでなくAPI成功・DB永続化まで確認しないと、バックエンドの退行を見逃す
- 2026-08-15: Notificationの`bookIsbn`を「アクター横断で異なる通知を区別するキー」に使うと一意制約で衝突する／複合ユニークキーはPrismaの仕様上null値を直接指定できない／DBレベルの直列化にSELECT...FOR UPDATEを使うと存在しない行へのロックがInnoDBギャップロックのデッドロックを招くことがある
- 2026-08-15: アクセス制御（閲覧範囲）の変更は、それに依存する「情報漏洩」系のレビュー指摘の深刻度を変える。閲覧制限を撤廃した後は、旧仕様を前提にした指摘が残っていないか見直す

## 記録

### 2026-08-15: 閲覧制限の仕様変更は、依存するセキュリティ系レビュー指摘の重み付けも変える

- **種別**: Codexとの対話で検証・合意した判断（Issue #521 相互フォロー機能の追加要件対応中）
- **対象領域・関連ファイル**: バックエンド/フロントエンド / `app/src/app/api/users/[id]/favorite-authors/route.ts`、`app/src/app/users/[id]/page.tsx`、`app/src/app/api/reading-status/route.ts`、`app/src/app/api/favorite-authors/route.ts`
- **何が起きたか**: Issue #521実装時点では「相手のお気に入り著者・読んでいる本は相互フォローにならないと見られない」仕様だったため、Codexレビューは「フォロー解除と通知作成が競合すると、相互フォロー限定情報が古い通知として残ってしまう」というP2指摘（情報漏洩系）を出していた。その後、ユーザー要望で「閲覧制限自体を撤廃し、誰でも見られるようにする（相互フォローの差分は通知の有無のみ）」という仕様変更を行ったところ、同じレース条件を指摘するP2がCodexから再度出た。しかし今度は、通知に含まれる著者名・本のタイトルはそもそも全ユーザーに公開済みの情報になっているため、指摘の実害は「情報漏洩」ではなく「フォロー解除後に通知欄の表示が一時的に実態と食い違う」という軽微なUI整合性の問題に変質していた。`codex exec`で背景（閲覧制限撤廃の事実）を伝えて再評価を依頼したところ、Codex自身も「セキュリティ上の不具合ではなく軽微な整合性問題」と同意し、対応不要と判断した。
- **対応**: コード変更なし。指摘は「検討のうえ意図的に不採用」として扱い、`codex exec`でのやり取りをレビューループの記録として残した。
- **次回の行動規則**:
  - **あるアクセス制御（閲覧範囲）を変更したときは、それより前に出ていた「情報漏洩」系のセキュリティレビュー指摘を、新しい閲覧範囲を前提に再評価する。** 旧仕様では重大だった指摘が、閲覧制限撤廃後は軽微なUI整合性の話に変わっていることがある。指摘の文言だけを見て機械的に対応するのではなく、「今の仕様でその情報は本当に非公開か」を都度確認する。
  - Codexのレビューが同じ指摘を繰り返す場合、`codex review`を再実行するだけでなく、`codex exec`で仕様変更の背景を明示的に伝えて再評価を依頼すると、機械的な指摘の繰り返しを避けられる。
- **状態**: 有効
- **根拠**: Issue #521

### 2026-08-15: Notificationの一意制約設計と、DB直列化にFOR UPDATEを使う際の落とし穴

- **種別**: Codexレビューで採用された指摘（Issue #521 相互フォロー成立後の活動通知の実装中）
- **対象領域・関連ファイル**: バックエンド / `app/prisma/schema.prisma`（`Notification`モデル）、`app/src/app/api/reading-status/route.ts`、`app/src/app/api/favorite-authors/route.ts`、`app/src/app/api/admin/reviews/[id]/route.ts`
- **何が起きたか**:
  1. `Notification`には既存の`@@unique([userId, type, bookIsbn])`があり、これは「本ごとに1件のnew_book/review_deleted通知」を保証するための設計。新しい通知種別（相互フォロー相手の読みたい本追加）で「誰が追加したか」を区別しようとして`actorId`を一意制約に追加するマイグレーションを行ったところ、`actorId`が常にnullの既存通知種別（`new_book`）でMySQLがNULL同士を別値扱いするため、cronの重複防止が効かなくなる副作用（DBレベルの重複防止の後退）が生じた。
  2. さらに、`actorId: null`を複合ユニークキーの`where`に指定するupsertはPrismaの型上そもそも許可されない（`NotificationUserIdTypeBookIsbnActorIdCompoundUniqueInput`はnullを受け付けない）ため、`findFirst`＋手動create/updateへの書き換えが必要になった。
  3. 最終的に、スキーマ変更そのものを取りやめ、「複数アクターが同じ本を対象にしうる新種別の通知には`bookIsbn`を設定しない（本詳細への直接リンクを諦める）」という設計に倒すことで、一意制約に触れさせずに衝突を回避した。
  4. 別の対応案として「同一ユーザー・同一本への同時リクエストを直列化する」ために`SELECT ... FOR UPDATE`で行ロックを試みたが、対象行が存在しない場合はInnoDBのギャップロックとなり、2つの同時INSERTが互いに競合してデッドロック（500エラー）を起こしうることが判明し、撤回した。「稀に通知が重複する」より「保存自体が失敗する」方が明確に悪いトレードオフ。
- **対応**: schema.prismaの一意制約は元の`(userId, type, bookIsbn)`のまま維持。新設した`mutual_want_to_read`は`bookIsbn`を持たせず`bookTitle`のみ保持する設計に変更。行ロックによる直列化は行わず、通知作成は`createMany`によるバッチ処理に留めた。
- **次回の行動規則**:
  - **既存の複合ユニークキーに列を追加する変更は、その制約が「どの通知種別のどんな重複を防ぐために存在するか」を全利用箇所で洗い出してから行う。** 一部の値が常にnullになる列を追加すると、MySQLの「NULL同士は別値」という仕様により、他の呼び出し箇所の重複防止が意図せず無効化される。
  - **Prismaの複合ユニークキー（`@@unique`）は、値にnullを含む組み合わせをfindUnique/upsertの`where`に直接指定できない。** null値を含みうるキーで既存行を探す場合は`findFirst`＋手動でのcreate/update振り分けが必要（既存の`review_deleted`実装がこのパターンの参考実装）。
  - **「同時実行時の重複」を完全に防ぎたい誘惑に負けず、対象行が存在しない可能性がある一意キーに対して`SELECT ... FOR UPDATE`で直列化しようとしない。** 存在しない行へのロックはInnoDBのギャップロックとなり、複数トランザクションが同時に初回INSERTしようとするとデッドロックする。「稀な重複」と「デッドロックによる500エラー」を比較し、後者の方が深刻なら重複は許容する。
- **状態**: 有効
- **根拠**: Issue #521

### 2026-08-13: 楽観的UI更新のE2E検証はAPI成功・DB永続化まで確認する

- **種別**: Codexレビューで採用された指摘（Issue #483 E2Eベースライン確認の事前調査中）
- **対象領域・関連ファイル**: テスト / `app/e2e/smoke.spec.ts`（対象: `app/src/app/books/[id]/_components/ReadingStatusButtons.tsx`）
- **何が起きたか**: `ReadingStatusButtons.tsx` は「読了」ボタン押下時、`/api/reading-status` へのPOSTレスポンスを待たずに先に `setStatus(newStatus)` でUIを更新する楽観的更新を行っている。一方 `smoke.spec.ts` は、ボタンに `bg-green-600` クラスが付いたことだけを確認しており、これはクライアント側の状態変化を見ているに過ぎない。APIが失敗してもUIの見た目は変わってしまうため、このテストは「読書ステータス登録」というテスト名が示す内容（サーバー側での保存成功）を実際には検証できていなかった。加えて `ReadingStatusButtons.tsx` 側もHTTPステータスを確認しておらず、500エラー等が起きてもUI上は成功したように見える。
- **対応**: Issue #483は事前調査段階での指摘のため、今回はコード修正を行わずテスト強化の余地として記録するに留めた。修正が必要な場合は別Issueとして起票する。
- **次回の行動規則**:
  - **楽観的UI更新（フロント側で先に状態を書き換え、後追いでAPIを呼ぶ実装）を検証するE2E/結合テストを書くときは、UIの見た目の変化だけでなく、DBへの反映（再取得後の値、ページリロード後の状態等）まで確認する。** 見た目だけの確認は「クライアント側の状態管理が動いていること」しか証明せず、バックエンドの退行を検出できない。
  - 楽観的更新を行うコンポーネント自体も、`fetch` のレスポンスの `ok` を確認せずに成功扱いにしていないか実装側もあわせて確認する。
- **状態**: 有効
- **根拠**: Issue #483

### 2026-08-12: `jest.useFakeTimers()`はDate.nowも一緒にフェイクする（setTimeout＋Date.nowのデッドライン検証）

- **種別**: 実装中の手直し（Issue #454 Phase 2 外部APIクライアントのテスト実装中に確認）
- **対象領域・関連ファイル**: テスト / `app/src/__tests__/node/lib/calil.test.ts`（対象: `app/src/lib/calil.ts` の `checkAvailability`）
- **何が起きたか**: `checkAvailability` はカーリルAPIのポーリング処理で、`Date.now()`による20秒デッドラインと`setTimeout(..., 2000)`による2秒間隔待機を組み合わせている。この「`continue`が1のままでも20秒でポーリングを打ち切る」という外部API保護上重要な分岐を、実時間を20秒以上消費せずに検証する必要があった。`jest.useFakeTimers()`（Jest 30の既定であるmodern fake timers）は`setTimeout`だけでなく`Date.now()` / `Date`コンストラクタも同時にフェイクするため、`await jest.advanceTimersByTimeAsync(25000)`でタイマーを進めるだけで、`Date.now()`ベースのデッドライン判定も含めて実時間ゼロで最後まで到達させることができた。
- **対応**: `mockFetchJson`で`continue: 1`を返し続けるレスポンスを用意し、`jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync(25000)`でポーリングが無限ループにならず打ち切られること（fetch呼び出し回数が10〜14回程度に収まること）を検証するテストを追加した。
- **次回の行動規則**:
  - **`Date.now()`（または`new Date()`）と`setTimeout`/`setInterval`を組み合わせたタイムアウト・デッドライン処理をテストするときは、`jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync()`を第一候補にする。** 個別に`Date.now`をモックする必要はない（Jest 30のmodern fake timersでは既に含まれる）。
  - ループが「時間経過で打ち切られること」を検証するテストでは、呼び出し回数を厳密な固定値ではなく範囲（`toBeGreaterThanOrEqual` / `toBeLessThan`）で assert すると、タイマー丸め等の実装詳細差でテストが壊れにくい。
- **状態**: 有効
- **根拠**: Issue #454

### 2026-08-08: ドキュメントの「事実」も実物で裏を取る

- **種別**: Codexレビューで採用された指摘（Issue #437 / PR #440）
- **対象領域・関連ファイル**: ドキュメント / `docs/test-dependency-map.md`
- **何が起きたか**: コードを1行も変えないドキュメントのみのPRで、Codexレビューが**4件の事実誤認**を指摘し、すべて妥当だった。
  - **Next.js 16 の `proxy.ts` を「Edge runtime 前提」と書いた** → 誤り。同梱ドキュメント `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:219` に `Proxy defaults to using the Node.js runtime.` と明記されている。Edge runtime が既定だったのは Next 15 までの Middleware で、訓練データ由来の思い込みだった。しかもこれは「だからテストしない」という**除外の根拠**にしていたため、誤った理由で除外することになっていた。
  - **「APIキーをダミー値にしたままテストが通ること」を、外部APIに実リクエストが飛んでいない証明として書いた** → 誤り。(1) リクエスト自体は相手サーバーに到達し認証エラーとして拒否されるだけなので相手側への負荷は発生する、(2) NDLサーチはそもそもAPIキーを必要としないため議論が成立しない。
  - **既存テストの網羅範囲を過小に記載した** → `lib/auth.test.ts` は8ケースを検証しているのに「ロック閾値の分岐のみ」と書いていた。将来の作業で既存テストを重複して書く原因になる。
  - **PWAバッジのテスト方針で `navigator.setAppBadge` だけのスタブを指示した** → `lib/badge.ts` は0件時に `clearAppBadge` を呼ぶが、機能検出ガードは `setAppBadge` の有無しか見ないため、ガードを通過した後に `TypeError` になる。書いたとおりに実装すると意図しない理由でテストが落ちる。
- **対応**: 4件とも `codex exec` で修正させ、指摘ゼロになるまで反復した（計4周）。Next 16 の挙動は `node_modules/next/dist/docs/` の記述で裏を取ってから修正した。
- **次回の行動規則**:
  - **設計ドキュメントもコードと同じレビュー基準で扱う。** 「コードを変えていないから安全」ではない。テスト方針・除外の根拠を書いたドキュメントは、後続の実装がそのまま従うため、誤りがコードに転写される。
  - **バージョン依存の挙動を書くときは、必ず `node_modules/<pkg>/dist/docs/` か公式ドキュメントで確認してから書く**（`app/AGENTS.md` の指示のとおり）。Next.js 16 は Middleware → Proxy の改名を含む破壊的変更があり、訓練データの知識がそのまま通用しない。
  - **「〜が通ることが証明になる」と書くときは、反例を1つ探してから書く。** 今回は「キーがダミーでも通る」の反例が「そもそもキーを要求しないAPI」だった。
  - **既存テストの網羅範囲を書くときは、テストファイルを開いて `it` を数える。** 記憶や概要で書かない。
- **状態**: 有効
- **根拠**: Issue #437, PR #440

### 2026-08-11: 実DBへの安全ガードは全ての実行経路に個別に必要

- **種別**: Codexレビューで採用された指摘（Issue #433 PR #444、Issue #435 PR #448）
- **対象領域・関連ファイル**: テスト基盤 / `app/src/__tests__/helpers/testDbGuard.ts`, `app/src/__tests__/helpers/dbTest.ts`, `app/jest.global-setup.integration.ts`, `app/e2e/global-setup.ts`, `app/prisma/seed.e2e.ts`
- **何が起きたか**: 実DB（db-test）に書き込む安全ガード（接続先がローカルのテスト用DBであることを検証してから処理する仕組み）を、**ある1つの実行経路にだけ実装して安心してしまい、別の経路には入れ忘れる**という同種の指摘が2つのIssueにまたがって計3回発生した。
  - Issue #433: 当初のガードはポート・DB名しか見ておらず、**同じポート・DB名を持つリモートサーバー**を指していた場合に素通りしてしまう欠陥があった（ホスト名の検証が抜けていた）。
  - Issue #435: `prisma/seed.e2e.ts` を Playwright の `global-setup.ts` から import する経路にはガードを実装したが、**同じファイルをCLIから直接実行する経路（`require.main === module` のブロック）にはガードを呼ぶ処理を入れ忘れていた**。CLI実行時は `dotenv.config()` を `override: true` なしで呼んでいたため、シェルに既に開発用DBの `DATABASE_URL` がエクスポートされていると、`.env.test` の値が無視され開発DBに書き込みうる状態だった。
- **対応**: いずれも `codex exec` で修正させ、**実際に接続先を壊してガードが発動することを実証**した上で指摘ゼロを確認した（#433はホストのみ別IPに変更、#435は`.env.test`自体を開発DBのURLに書き換え）。修正後は開発DBのレコード数に変化がないことも毎回確認した。
- **次回の行動規則**:
  - **実DBへの書き込みコードを新設したら、「このロジックに到達しうる実行経路」を全て列挙してから、各経路の入口でガードが呼ばれているかをチェックリストとして確認する。** 1つの経路で動作確認できても、他の経路が素通りになっている可能性を疑う。
  - **ガードの検証は「正常系が通ること」だけでなく、「壊れた入力で実際に発火すること」を毎回実機で確認する。** 発火を見ていないガードは、書いただけで機能していない可能性がある。
  - CLIエントリーポイント（`if (require.main === module)` のブロック等）は import 実行と別経路になりやすく、見落としの典型パターン。新規追加時は真っ先に疑う。
- **状態**: 有効
- **根拠**: Issue #433 PR #444, Issue #435 PR #448

### 2026-08-11: `next dev` へのDB/API接続先の安全な差し替え方（E2E用）

- **種別**: Codexレビューで採用された指摘＋実装中の手直し（Issue #435 PR #448）
- **対象領域・関連ファイル**: `app/playwright.config.ts`, `app/next.config.ts`, `app/e2e/stub-server.ts`
- **何が起きたか**:
  - `next dev` は常に development モードで起動し `.env.local` を自動読み込みするため、素朴に起動すると開発DB・実外部APIに接続してしまう。**`DATABASE_URL` 等を `next dev` 起動前に環境変数として渡せば `.env.local` の値より優先される**ことを、実際に壊れたURLを渡してDB接続エラーが起きることで実証してから採用した（`node_modules/next/dist/docs` にはこの優先順位の明記が無かったため、訓練データに頼らず実機で確認する必要があった）。
  - E2E用フィクスチャの画像URLを実URL（`thumbnail.image.rakuten.co.jp`）のまま残していたため、`next/image` が実際に外部へリクエストしていた（外部通信ゼロという目標に反する）。スタブサーバー自身に画像を配信させて解決。
  - ローカルのスタブサーバー（`http://localhost:<port>`）への画像リクエストが、**Next.js 16 で新設されたSSRF対策**（画像URLの解決先がプライベートIPだと拒否する）に阻まれた。`images.dangerouslyAllowLocalIP` を、E2E実行時だけ設定される目印の環境変数（`STUB_SERVER_PORT`）の有無で条件分岐して有効化し、本番・開発の設定は変えない形にした。
- **対応**: `codex exec` を介さず自己検証（webServerのログに外部ドメインへのリクエストが一切出ないことを確認）で発見・修正。Codexレビューでは指摘されなかった箇所だが、`docs/test-dependency-map.md` の「外部APIに実リクエストを飛ばさない仕組みを共有する」という目的に照らして自主的に潰した。
- **次回の行動規則**:
  - **E2Eで外部通信を完全に止めたと主張する前に、`webServer` のログを実際に見て確認する。** テストのアサーションが通ることと、外部通信が発生していないことは別。
  - **フィクスチャに実URLを1つでも残すと、それだけで検証の意味が壊れる。** 画像・リンク等、レスポンスに含まれる全てのURLをスタブ経由に揃える。
  - Next.js のバージョンアップ（特にメジャー）で新設されたセキュリティ機構（今回はSSRF対策）がローカル開発・テストの都合と衝突することがある。挙動不明な500系エラーが出たら、まず該当バージョンの `node_modules/next/dist/docs` の upgrading ガイドを確認する。
- **状態**: 有効
- **根拠**: Issue #435 PR #448

### 2026-08-06: Prisma共通モックは手動モック（`__mocks__`）＋Proxyで実装する

- **種別**: 設計判断（Issue #430 / Phase 0-1 の実装中に確定）
- **対象領域・関連ファイル**: テスト基盤 / `app/src/lib/__mocks__/prisma.ts`, `app/src/__mocks__/auth.ts`, `app/src/lib/__mocks__/session.ts`, `app/src/__tests__/helpers/`
- **何が起きたか**:
  - Prismaモックの共通化を「ヘルパー関数の中で `jest.mock()` を呼ぶ」方式にしようとしたが、ts-jest は `jest.mock()` の呼び出しを import より上に**巻き上げる（hoisting）**ため、ヘルパー関数経由では巻き上げが効かない。`jest.doMock()` なら動くが、静的 import しているテスト（`src/__tests__/lib/session.test.ts` 等）ではモックが適用されない。
  - `jest.mock("@/lib/prisma", () => require(...))` 形式は eslint（`@typescript-eslint/no-require-imports`）に抵触する。
  - Proxy でモデル・メソッドを遅延生成する際、`get` は テストコードからの参照だけでなく `await` の解決や jest の等値比較・整形の過程でも呼ばれる。`then` に `jest.fn()` を返すと `await prisma` が解決しなくなる。
- **対応**:
  - Jest の**手動モック**（`src/lib/__mocks__/prisma.ts`）方式を採用した。テスト側は `jest.mock("@/lib/prisma")` の1行だけで済み、hoisting も eslint も問題にならない。型付きアクセスは `src/__tests__/helpers/prismaMock.ts` が `@/lib/prisma` を import してキャストする形で提供する。
  - Proxy の `get` では `then` / `catch` / `constructor` / `toJSON` / `asymmetricMatch` / `$$typeof` 等を「メンバーではない」として `undefined` を返すようにした。
  - `$transaction` のコールバックには**ルートと同一の**モックを渡した。これによりトランザクション内の `tx.user.deleteMany` も `prismaMock.user.deleteMany` で検証でき、テストごとに tx 用モックを組み立てる必要がなくなった（`admin-users.test.ts` の beforeEach が丸ごと不要になった）。
  - ヘルパーが本物のモジュールを読み込んでしまう事故を防ぐため、`jest.mock(...)` の書き忘れを検知して明示的に throw するガードを各ヘルパーに入れた。
- **次回の行動規則**:
  - モジュール単位のモックを複数テストで共有したくなったら、ヘルパー関数で `jest.mock()` を呼ぶのではなく `__mocks__/` の手動モックを作り、テスト側は引数なしの `jest.mock("<path>")` を書く。型付けだけをヘルパーに置く。
  - Proxy でモックを自動生成する場合は、必ず `then` 等の「JS処理系・jestが触れるプロパティ」を除外リストに入れる。
  - モックに既定実装を持たせる場合、`jest.clearAllMocks()` は呼び出し履歴のみを消して実装を残すが、`jest.resetAllMocks()` は実装も消す。既定実装に依存する設計なら reset を使わない。
- **状態**: 有効
- **根拠**: Issue #430

### 2026-08-04: NextAuth `update()` の2つの落とし穴

- **種別**: 手直し（ユーザー指摘によるブラウザ確認で発覚）
- **対象領域・関連ファイル**: frontend / `app/src/lib/adminFetch.ts`, `app/src/auth.ts`
- **何が起きたか**:
  - 管理者権限剥奪時にクライアント側のJWTセッション（`useSession()`のrole）を即時更新する実装で、`update()`を引数なしで呼んだところ、jwtコールバックに`trigger: "update"`が渡らずDBの最新roleが反映されなかった。NextAuthの`fetchData`実装（`node_modules/next-auth/src/lib/client.ts`）は、`data === undefined`のときリクエストボディを付けないためGETになり、`isUpdate`判定がfalseになる。
  - `update({})`に変更した後も、まだ「管理」アイコンが消えない現象が残った。原因は、NextAuthの`update()`内部に`if (loading) return`というガードがあり、`loading`はSessionProvider全体の初回セッション取得が完了するまでtrueになる。管理画面は複数のadmin APIへ並行fetchするため、初回マウント直後に403を検知して`update()`を呼ぶタイミングがSessionProviderの初回フェッチ完了前に重なりやすく、`update()`が何もせず`undefined`を返して終わっていた。
- **対応**:
  - `update()`には常に`{}`など非undefinedの値を渡し、POSTかつ`trigger: "update"`付きでjwtコールバックが再実行されるようにした。
  - `update()`の戻り値が`falsy`の場合は最大5回・100ms間隔でリトライするようにした（`useAdminFetch`フック内）。
- **次回の行動規則**: サーバー側の状態変更（role変更等）をクライアント側のNextAuthセッションに即時反映させたい場合は、(1) `update()`には必ず何らかの値を渡す、(2) ページ初回マウント直後など`SessionProvider`の初回フェッチが終わっていない可能性があるタイミングで呼ぶ場合は、戻り値が`falsy`ならリトライする実装にする。単発の`await update()`だけでは信頼できない。
- **状態**: 有効
- **根拠**: Issue #426, PR #427

デバッグ手法として有効だったもの（参考）:
- `window.fetch`をモンキーパッチして実際に飛んだリクエストのURL/methodをログする。chrome-devtools MCPの`navigate_page`の`initScript`パラメータを使うとページ読み込み前・アプリコードより先に仕込める。
- `console.log`を一時的に仕込み、`list_console_messages`に`includePreservedMessages: true`を付けて確認する（reloadやSPA遷移でconsoleがクリアされるため、これを付けないと過去のログが消えて見えない）。
- サーバー側ロジックが正しいかは、ブラウザを介さず`curl`でCSRFトークン取得→ログイン→session update POSTの一連の流れを再現して検証すると、クライアント側の問題かサーバー側の問題かを素早く切り分けられる。
