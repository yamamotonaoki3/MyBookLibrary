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
  source: z.enum(["rakuten", "manual"]).optional(),
});

export const FavoriteAuthorSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(2, "著者名は2文字以上で入力してください。")
    .max(100, "著者名は100文字以内で入力してください。"),
});

export const LoginSchema = z.object({
  email: z.email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

export const ResetPasswordSchema = z
  .object({
    email: z.email("有効なメールアドレスを入力してください"),
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(100, "パスワードは100文字以内で入力してください"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export const RegisterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "名前を入力してください")
      .max(50, "名前は50文字以内で入力してください"),
    email: z.email("有効なメールアドレスを入力してください"),
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(100, "パスワードは100文字以内で入力してください"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });
