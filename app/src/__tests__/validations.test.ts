import { ReviewSchema, ReadingStatusSchema, FavoriteAuthorSchema } from "@/lib/validations";

// ─── ReviewSchema ────────────────────────────────────────────────────────────

describe("ReviewSchema", () => {
  describe("body", () => {
    it("10文字以上2000文字以内は合格する", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(10), bookId: 1 });
      expect(result.success).toBe(true);
    });

    it("2000文字ちょうどは合格する", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(2000), bookId: 1 });
      expect(result.success).toBe(true);
    });

    it("9文字は失敗する", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(9), bookId: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("感想は10文字以上で入力してください。");
      }
    });

    it("2001文字は失敗する", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(2001), bookId: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("感想は2000文字以内で入力してください。");
      }
    });

    it("前後の空白はトリムされてから文字数チェックされる", () => {
      // 前後空白込みで12文字だが、トリム後は10文字
      const result = ReviewSchema.safeParse({ body: "  " + "あ".repeat(10) + "  ", bookId: 1 });
      expect(result.success).toBe(true);
    });

    it("空文字は失敗する", () => {
      const result = ReviewSchema.safeParse({ body: "", bookId: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe("isSpoiler", () => {
    it("未指定のとき false にデフォルトされる", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(10), bookId: 1 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isSpoiler).toBe(false);
      }
    });

    it("true を渡すとそのまま保持される", () => {
      const result = ReviewSchema.safeParse({ body: "あ".repeat(10), bookId: 1, isSpoiler: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isSpoiler).toBe(true);
      }
    });
  });
});

// ─── ReadingStatusSchema ──────────────────────────────────────────────────────

describe("ReadingStatusSchema", () => {
  const base = { title: "テスト本", author: "著者名" };

  it.each(["unread", "want_to_read", "reading", "read"] as const)(
    '"%s" は合格する',
    (status) => {
      const result = ReadingStatusSchema.safeParse({ ...base, status });
      expect(result.success).toBe(true);
    }
  );

  it("不正な status 値は失敗する", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("title が空は失敗する", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, title: "", status: "reading" });
    expect(result.success).toBe(false);
  });

  it("author が空は失敗する", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, author: "", status: "reading" });
    expect(result.success).toBe(false);
  });

  it("isbn は省略可能", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, status: "read" });
    expect(result.success).toBe(true);
  });
});

// ─── FavoriteAuthorSchema ─────────────────────────────────────────────────────

describe("FavoriteAuthorSchema", () => {
  it("2文字以上は合格する", () => {
    const result = FavoriteAuthorSchema.safeParse({ authorName: "村上" });
    expect(result.success).toBe(true);
  });

  it("100文字ちょうどは合格する", () => {
    const result = FavoriteAuthorSchema.safeParse({ authorName: "あ".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("1文字は失敗する", () => {
    const result = FavoriteAuthorSchema.safeParse({ authorName: "村" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("著者名は2文字以上で入力してください。");
    }
  });

  it("101文字は失敗する", () => {
    const result = FavoriteAuthorSchema.safeParse({ authorName: "あ".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("著者名は100文字以内で入力してください。");
    }
  });

  it("空文字は失敗する", () => {
    const result = FavoriteAuthorSchema.safeParse({ authorName: "" });
    expect(result.success).toBe(false);
  });

  it("前後の空白はトリムされてから文字数チェックされる", () => {
    // トリム後1文字なので失敗するはず
    const result = FavoriteAuthorSchema.safeParse({ authorName: "  村  " });
    expect(result.success).toBe(false);
  });
});
