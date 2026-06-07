"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FavoriteAuthor = { id: number; name: string };

type Props = {
  favoriteAuthors: FavoriteAuthor[];
};

export function BooksFilter({ favoriteAuthors }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status: string = searchParams.get("status") ?? "all";
  const author: string = searchParams.get("author") ?? "all";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`/books?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <Select value={status} onValueChange={(v) => { if (v) update("status", v); }}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="ステータスで絞り込み" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべてのステータス</SelectItem>
          <SelectItem value="want_to_read">読みたい</SelectItem>
          <SelectItem value="reading">読書中</SelectItem>
          <SelectItem value="read">読了</SelectItem>
        </SelectContent>
      </Select>

      <Select value={author} onValueChange={(v) => { if (v) update("author", v); }}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="著者で絞り込み" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべての著者</SelectItem>
          {favoriteAuthors.map((fa) => (
            <SelectItem key={fa.id} value={String(fa.id)}>
              {fa.name}
            </SelectItem>
          ))}
          <SelectItem value="others">その他</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
