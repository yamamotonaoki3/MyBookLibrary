"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const UPDATE_MAX_RETRIES = 5;
const UPDATE_RETRY_DELAY_MS = 100;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 管理者権限を剥奪された直後、admin APIは403を返す（Issue #417）。
// その403を検知して生のJSONエラーが画面に表示されたままになるのを防ぎ、
// セッションは維持したまま一般ユーザー向けのダッシュボードへ誘導する（Issue #423）。
// update() でJWTのroleクレームをDBの最新値に更新してから遷移することで、
// ナビゲーションの管理者向け表示も即座に切り替わるようにする（Issue #426）。
export function useAdminFetch() {
  const { update } = useSession();
  const router = useRouter();
  // update/router はセッション状態の変化のたびに参照が変わるため、
  // ref経由で参照することで返り値の関数の参照を安定させ、呼び出し側の
  // useEffect依存配列に含めても不要な再実行が起きないようにする。
  const updateRef = useRef(update);
  const routerRef = useRef(router);
  useEffect(() => {
    updateRef.current = update;
    routerRef.current = router;
  }, [update, router]);

  return useCallback(async (input: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(input, init);
    if (res.status === 403) {
      // update() を引数なしで呼ぶとGETでの単純な再取得になり、jwtコールバックに
      // trigger: "update" が渡らずDBのroleが反映されない。何らかのdataを渡す
      // ことでPOSTになり、trigger: "update" 付きでjwtコールバックが再実行される。
      // また、SessionProviderの初回セッション取得がまだ終わっていない間は
      // update()が内部のloadingガードで無視され何もせずundefinedを返すため、
      // 管理画面初回マウント時の並行fetchで発生しやすいこのケースをリトライで救う。
      for (let i = 0; i < UPDATE_MAX_RETRIES; i++) {
        const newSession = await updateRef.current({});
        if (newSession) break;
        await wait(UPDATE_RETRY_DELAY_MS);
      }
      routerRef.current.push("/");
      // 遷移中、他の並行中のadminFetch呼び出しが403のエラーボディを
      // 正常データとしてパース・setStateしてクラッシュするのを防ぐため、
      // あえて解決しないPromiseを返す（ページ遷移でコンポーネントごと
      // 破棄されるため無害）。
      return new Promise<Response>(() => {});
    }
    return res;
  }, []);
}
