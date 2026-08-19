"use client";

import { useState } from "react";
import { Library } from "lucide-react";
import { LibraryAvailabilityModal } from "@/components/ui/LibraryAvailabilityModal";

type Props = {
  bookId: number;
  bookTitle: string;
};

export default function LibraryAvailabilityButton({ bookId, bookTitle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        <Library className="h-3.5 w-3.5" />
        登録されている版ごとの在庫を見る
      </button>

      {open && (
        <LibraryAvailabilityModal
          bookId={bookId}
          bookTitle={bookTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
