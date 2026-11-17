import { ReadingStatusSchema } from "@/lib/validations";
const base={ title:"[E2E_TEST] 本",author:"testuser_author",status:"reading" };
it.each(["javascript:alert(1)","data:image/png;base64,AA==","ftp://example.com/cover.jpg","https://user:pass@example.com/cover.jpg","https://example.com/a\nb.jpg"])("rejects non-Web or ambiguous cover %s", coverImageUrl => { expect(ReadingStatusSchema.safeParse({...base,coverImageUrl}).success).toBe(false); });
it.each(["http://library.example.com/cover.jpg","https://arbitrary.example.net/image.jpg"])("preserves existing HTTP(S) cover hosts: %s",coverImageUrl=>{expect(ReadingStatusSchema.safeParse({...base,coverImageUrl}).success).toBe(true);});

it.each(["", "  "])("preserves the original Japanese cover URL after trimming whitespace %j", (whitespace) => {
  const coverImageUrl = `https://example.com/${"あ".repeat(20)}.jpg`;
  expect(coverImageUrl).toHaveLength(44);
  expect(new URL(coverImageUrl).href.length).toBeGreaterThan(191);

  const parsed = ReadingStatusSchema.parse({
    ...base,
    coverImageUrl: `${whitespace}${coverImageUrl}${whitespace}`,
  });
  expect(parsed.coverImageUrl).toBe(coverImageUrl);
});
