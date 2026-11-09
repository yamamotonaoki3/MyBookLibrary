"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onClose: () => void;
  onScanned: (isbn: string) => void;
};

export default function BarcodeScannerModal({ onClose, onScanned }: Props) {
  const scannerRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(false);
  const isRunningRef = useRef(false);
  // 親は onClose / onScanned を毎回新しい関数で渡す。effect の依存に入れると、親が再レンダリング
  // されるたびにカメラが止まって起動し直され、映像が消える。最新の関数を ref で保持して参照する。
  const onCloseRef = useRef(onClose);
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onCloseRef.current = onClose;
    onScannedRef.current = onScanned;
  });

  // ?scanDebug=1 のときだけ、映像の状態を画面に表示する（iPhone の PWA で映像が出ない原因の調査用）
  const [debug] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("scanDebug")
  );
  const [debugText, setDebugText] = useState("");
  const startCountRef = useRef(0);
  const startErrorRef = useRef("");

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      const container = document.getElementById("barcode-reader");
      if (container) container.innerHTML = "";

      if (stopped) return;

      const { Html5Qrcode } = await import("html5-qrcode");

      if (stopped) return;

      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;
      startCountRef.current += 1;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 120 }, disableFlip: false },
          (decodedText) => {
            if (scannedRef.current || stopped) return;
            const isbn = decodedText.replace(/[^0-9X]/gi, "");
            if (isbn.length !== 13 && isbn.length !== 10) return;
            scannedRef.current = true;
            isRunningRef.current = false;
            scanner.stop().catch(() => {});
            onScannedRef.current(isbn);
            onCloseRef.current();
          },
          () => {}
        );

        if (stopped) {
          scanner.stop().then(() => { scanner.clear(); }).catch(() => {});
          return;
        }

        isRunningRef.current = true;
        const cont = document.getElementById("barcode-reader");
        cont?.querySelectorAll("canvas").forEach((c) => {
          (c as HTMLElement).style.display = "none";
        });
        setScanning(true);
      } catch (e) {
        startErrorRef.current = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        if (!stopped) {
          setError("カメラを起動できませんでした。カメラへのアクセスを許可してください。");
        }
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (isRunningRef.current) {
        isRunningRef.current = false;
        scannerRef.current?.stop()
          .then(() => { scannerRef.current?.clear(); })
          .catch(() => {});
      } else {
        scannerRef.current?.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!debug) return;
    const timer = setInterval(() => {
      const video = document.querySelector<HTMLVideoElement>("#barcode-reader video");
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const reader = document.getElementById("barcode-reader");
      setDebugText(
        [
          `standalone=${(navigator as Navigator & { standalone?: boolean }).standalone ?? "n/a"}`,
          `starts=${startCountRef.current} running=${isRunningRef.current}`,
          `startError=${startErrorRef.current || "none"}`,
          `reader=${reader?.clientWidth}x${reader?.clientHeight}`,
          video
            ? `video=${video.clientWidth}x${video.clientHeight} src=${video.videoWidth}x${video.videoHeight} ready=${video.readyState} paused=${video.paused}`
            : "video=none",
          video ? `style.width=${video.style.width} display=${getComputedStyle(video).display} opacity=${getComputedStyle(video).opacity}` : "",
          track ? `track=${track.readyState} muted=${track.muted} enabled=${track.enabled}` : "track=none",
        ].join("\n")
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [debug]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          バーコードをスキャン
        </h2>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        ) : (
          <>
            <div
              id="barcode-reader"
              className="overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
            />
            {!scanning && (
              <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
                カメラを起動中…
              </p>
            )}
            {scanning && (
              <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
                本の裏表紙のバーコードをカメラに向けてください
              </p>
            )}
          </>
        )}

        {debug && (
          <pre
            data-testid="scan-debug"
            className="mt-3 overflow-x-auto rounded bg-zinc-100 p-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {debugText || "診断中…"}
          </pre>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
