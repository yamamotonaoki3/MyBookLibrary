# 学び・手直しの記録

Codexレビューで採用された指摘や、実装中の手直しのうち、次回以降に活かすべき内容を記録する。記録するタイミング・基準・形式は `lessons-learned` Skill（`~/.claude/skills/lessons-learned/SKILL.md`）に従う。手動で追記する場合も、以下の形式を保つこと。

## 索引

- 2026-08-04: NextAuth `update()` の2つの落とし穴（引数なし呼び出しはGET化／SessionProvider初回ロード中は無視される）

## 記録

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
