import { BookCard } from "./BookCard";
import { auth } from "@/auth";
import { getAwardBookEntries } from "@/lib/awardBookList";

type Props = {
  awardId: number | "all";
  year?: number;
};

export async function BookList({ awardId, year }: Props) {
  const session = await auth();
  const userId = Number(session!.user.id);
  const entries = await getAwardBookEntries({ awardId, year, userId });

  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        該当する作品が見つかりませんでした。
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {entries.map((entry) => (
        <BookCard key={entry.awardEntryId} entry={entry} />
      ))}
    </div>
  );
}
