/**
 * 自分のパスワードを変更できるか（設定画面にリンクを出すかの判定）。
 *
 * - パスワードでログインできるアカウントだけ（Google ログインだけのユーザーは、パスワードを持たない。
 *   API は 422 を返す）。
 * - デモ環境（`DEMO_MODE`）では、変更できない（API は 403。変更画面は案内だけ）。
 */
export function canChangeOwnPassword({ hasPasswordLogin, demoMode }: { hasPasswordLogin: boolean; demoMode: boolean }): boolean {
  return hasPasswordLogin && !demoMode;
}
