import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:overflow-y-auto lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>このアプリについて</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            MyBookLibraryは、読んだ本・読みたい本を管理し、感想を記録できる読書管理アプリです。
          </p>
          <div>
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-50">利用している外部API</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                本の書影・書誌情報の取得に、楽天ブックスAPIを利用しています。
                <a
                  href="https://developers.rakuten.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-emerald-700 underline dark:text-emerald-400"
                >
                  Supported by Rakuten Developers
                </a>
              </li>
              <li>本の書誌情報・ISBNの検索に、国立国会図書館サーチのAPIを利用しています。</li>
              <li>近隣図書館の検索・蔵書の貸出状況確認に、カーリルのAPIを利用しています。</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
