const CALIL_API_BASE = "https://api.calil.jp";

export type LibraryResult = {
  systemid: string;
  systemname: string;
  libkey: string;
  formal: string;
  pref: string;
  city: string;
  address: string;
};

// systemid + libkey ごとの貸出状況
export type AvailabilityResult = {
  systemid: string;
  libkey: string;     // 支館キー（例: "玉川台"）
  loanStatus: string; // 「貸出可」「貸出中」など日本語の貸出状況
  reserveurl: string;
};

type CheckResponseBooks = Record<
  string, // isbn
  Record<
    string, // systemid
    {
      status: string;
      reserveurl: string;
      libkey: Record<string, string>; // { "玉川台": "貸出可", ... }
    }
  >
>;

export async function searchLibraries(
  pref: string,
  city?: string
): Promise<LibraryResult[]> {
  const apiKey = process.env.CALIL_API_KEY;
  if (!apiKey) throw new Error("CALIL_API_KEY is not set");

  const params = new URLSearchParams({
    appkey: apiKey,
    pref,
    ...(city ? { city } : {}),
    format: "json",
    callback: "no",
  });

  const res = await fetch(`${CALIL_API_BASE}/library?${params}`);
  if (!res.ok) throw new Error("カーリルAPI図書館検索に失敗しました");

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function checkAvailability(
  isbn: string,
  systemids: string[]
): Promise<AvailabilityResult[]> {
  const apiKey = process.env.CALIL_API_KEY;
  if (!apiKey) throw new Error("CALIL_API_KEY is not set");

  const params = new URLSearchParams({
    appkey: apiKey,
    isbn,
    systemid: systemids.join(","),
    format: "json",
    callback: "no",
  });

  let url = `${CALIL_API_BASE}/check?${params}`;
  const deadline = Date.now() + 20000;

  while (true) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("カーリルAPI貸出状況確認に失敗しました");

    const data = await res.json();

    // continue が 0 になったら完了
    if (!data.continue) {
      return extractResults(data, isbn, systemids);
    }

    // タイムアウトしたらその時点の結果を返す
    if (Date.now() >= deadline) {
      return extractResults(data, isbn, systemids);
    }

    // ポーリング（2秒以上あける）
    const sessionParams = new URLSearchParams({
      appkey: apiKey,
      session: data.session,
      format: "json",
      callback: "no",
    });
    url = `${CALIL_API_BASE}/check?${sessionParams}`;

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

function extractResults(
  data: { books?: CheckResponseBooks },
  isbn: string,
  systemids: string[]
): AvailabilityResult[] {
  const results: AvailabilityResult[] = [];
  if (!data.books) return results;

  const isbnData = data.books[isbn];
  if (!isbnData) return results;

  for (const systemid of systemids) {
    const sysData = isbnData[systemid];
    if (!sysData) continue;

    const libkeyMap = sysData.libkey ?? {};
    const reserveurl = sysData.reserveurl ?? "";

    if (Object.keys(libkeyMap).length === 0) {
      // 蔵書なし
      results.push({ systemid, libkey: "", loanStatus: "蔵書なし", reserveurl });
    } else {
      for (const [libkey, loanStatus] of Object.entries(libkeyMap)) {
        results.push({ systemid, libkey, loanStatus, reserveurl });
      }
    }
  }

  return results;
}
