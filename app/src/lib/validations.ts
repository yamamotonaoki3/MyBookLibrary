import { z } from "zod";

export const ReviewSchema = z.object({
  body: z
    .string()
    .trim()
    .min(10, "感想は10文字以上で入力してください。")
    .max(2000, "感想は2000文字以内で入力してください。"),
  isSpoiler: z.boolean().optional().default(false),
  bookId: z.number().int().positive().optional(),
});

export const ReadingStatusSchema = z.object({
  status: z.enum(["unread", "want_to_read", "reading", "read"]).check(
    (ctx) => {
      if (!ctx.value) ctx.issues.push({ code: "custom", message: "status の値が不正です。", input: ctx.value });
    }
  ),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(100),
  isbn: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  publishedAt: z.string().optional().nullable(),
});

export const FavoriteAuthorSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(2, "著者名は2文字以上で入力してください。")
    .max(100, "著者名は100文字以内で入力してください。"),
});
