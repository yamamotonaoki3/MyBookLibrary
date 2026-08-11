import {
  ReviewSchema,
  ReadingStatusSchema,
  FavoriteAuthorSchema,
  RegisterSchema,
  LoginSchema,
  ResetPasswordSchema,
  SecretWordSchema,
  AuditLogQuerySchema,
} from "@/lib/validations";

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

  it("coverImageUrl が有効なURLなら合格する", () => {
    const result = ReadingStatusSchema.safeParse({
      ...base,
      status: "read",
      coverImageUrl: "https://example.com/cover.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("coverImageUrl がURL形式でなければ失敗する", () => {
    const result = ReadingStatusSchema.safeParse({
      ...base,
      status: "read",
      coverImageUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("coverImageUrl は省略可能", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, status: "read" });
    expect(result.success).toBe(true);
  });

  it.each(["rakuten", "manual"] as const)('source "%s" は合格する', (source) => {
    const result = ReadingStatusSchema.safeParse({ ...base, status: "read", source });
    expect(result.success).toBe(true);
  });

  it("source が不正な値は失敗する", () => {
    const result = ReadingStatusSchema.safeParse({
      ...base,
      status: "read",
      source: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("source は省略可能", () => {
    const result = ReadingStatusSchema.safeParse({ ...base, status: "read" });
    expect(result.success).toBe(true);
  });
});

// ─── RegisterSchema ──────────────────────────────────────────────────────────

describe("RegisterSchema", () => {
  const valid = {
    name: "テストユーザー",
    email: "test@example.com",
    password: "password123",
    confirmPassword: "password123",
  };

  it("正常系: 有効なデータは合格する", () => {
    const result = RegisterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("パスワードが7文字は失敗する", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "1234567", confirmPassword: "1234567" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("パスワードは8文字以上で入力してください");
    }
  });

  it("パスワードが101文字は失敗する", () => {
    const long = "a".repeat(101);
    const result = RegisterSchema.safeParse({ ...valid, password: long, confirmPassword: long });
    expect(result.success).toBe(false);
  });

  it("無効なメールアドレスは失敗する", () => {
    const result = RegisterSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("有効なメールアドレスを入力してください");
    }
  });

  it("名前が空は失敗する", () => {
    const result = RegisterSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("名前が51文字は失敗する", () => {
    const result = RegisterSchema.safeParse({ ...valid, name: "あ".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("パスワードと確認パスワードが不一致は失敗する", () => {
    const result = RegisterSchema.safeParse({ ...valid, confirmPassword: "different123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("パスワードが一致しません");
    }
  });
});

// ─── LoginSchema ─────────────────────────────────────────────────────────────

describe("LoginSchema", () => {
  it("正常系: 有効なメール・パスワードは合格する", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com", password: "anypassword" });
    expect(result.success).toBe(true);
  });

  it("無効なメールアドレスは失敗する", () => {
    const result = LoginSchema.safeParse({ email: "invalid", password: "pass" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("有効なメールアドレスを入力してください");
    }
  });

  it("パスワードが空は失敗する", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("パスワードを入力してください");
    }
  });
});

// ─── ResetPasswordSchema ──────────────────────────────────────────────────────

describe("ResetPasswordSchema", () => {
  const valid = {
    email: "user@example.com",
    secretWord: "ひみつのことば",
    password: "newpassword1",
    confirmPassword: "newpassword1",
  };

  it("正常系: 有効なデータは合格する", () => {
    const result = ResetPasswordSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("パスワードが7文字は失敗する", () => {
    const result = ResetPasswordSchema.safeParse({ ...valid, password: "1234567", confirmPassword: "1234567" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("パスワードは8文字以上で入力してください");
    }
  });

  it("パスワード不一致は失敗する", () => {
    const result = ResetPasswordSchema.safeParse({ ...valid, confirmPassword: "different" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("パスワードが一致しません");
    }
  });

  it("無効なメールアドレスは失敗する", () => {
    const result = ResetPasswordSchema.safeParse({ ...valid, email: "bad-email" });
    expect(result.success).toBe(false);
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

// ─── SecretWordSchema ─────────────────────────────────────────────────────────

describe("SecretWordSchema", () => {
  const valid = { currentPassword: "currentpass1", secretWord: "ひみつのことば" };

  it("正常系: 有効なデータは合格する", () => {
    const result = SecretWordSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("currentPassword が空は失敗する", () => {
    const result = SecretWordSchema.safeParse({ ...valid, currentPassword: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("現在のパスワードを入力してください");
    }
  });

  it("secretWord が1文字は失敗する", () => {
    const result = SecretWordSchema.safeParse({ ...valid, secretWord: "秘" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("秘密の言葉は2文字以上で入力してください");
    }
  });

  it("secretWord が2文字ちょうどは合格する", () => {
    const result = SecretWordSchema.safeParse({ ...valid, secretWord: "秘密" });
    expect(result.success).toBe(true);
  });

  it("secretWord が50文字ちょうどは合格する", () => {
    const result = SecretWordSchema.safeParse({ ...valid, secretWord: "あ".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("secretWord が51文字は失敗する", () => {
    const result = SecretWordSchema.safeParse({ ...valid, secretWord: "あ".repeat(51) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("秘密の言葉は50文字以内で入力してください");
    }
  });

  it("secretWord は前後の空白がトリムされてから文字数チェックされる", () => {
    // トリム後1文字なので失敗するはず
    const result = SecretWordSchema.safeParse({ ...valid, secretWord: "  秘  " });
    expect(result.success).toBe(false);
  });
});

// ─── AuditLogQuerySchema ──────────────────────────────────────────────────────

describe("AuditLogQuerySchema", () => {
  it("全項目省略時はpageとpageSizeにデフォルト値が入る", () => {
    const result = AuditLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("actorUserId は文字列でも数値に変換される（coerce）", () => {
    const result = AuditLogQuerySchema.safeParse({ actorUserId: "42" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actorUserId).toBe(42);
    }
  });

  it("actorUserId が0以下は失敗する", () => {
    const result = AuditLogQuerySchema.safeParse({ actorUserId: "0" });
    expect(result.success).toBe(false);
  });

  it("from が YYYY-MM-DD 形式なら合格する", () => {
    const result = AuditLogQuerySchema.safeParse({ from: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("from が YYYY-MM-DD 形式でなければ失敗する", () => {
    const result = AuditLogQuerySchema.safeParse({ from: "2026/01/01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("from は YYYY-MM-DD 形式で指定してください。");
    }
  });

  it("to が YYYY-MM-DD 形式でなければ失敗する", () => {
    const result = AuditLogQuerySchema.safeParse({ to: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("to は YYYY-MM-DD 形式で指定してください。");
    }
  });

  it("pageSize が200ちょうどは合格する", () => {
    const result = AuditLogQuerySchema.safeParse({ pageSize: "200" });
    expect(result.success).toBe(true);
  });

  it("pageSize が201は失敗する", () => {
    const result = AuditLogQuerySchema.safeParse({ pageSize: "201" });
    expect(result.success).toBe(false);
  });

  it("page が0以下は失敗する", () => {
    const result = AuditLogQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });
});
