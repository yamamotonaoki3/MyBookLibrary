// ISBN-13（978プレフィックス）からISBN-10へ変換する。
// 978除去後の9桁からISBN-10用のチェックデジット（mod11）を再計算する。
// 979プレフィックスや978以外の13桁にはISBN-10が存在しないためnullを返す。
export function isbn13ToIsbn10(isbn13: string): string | null {
  const digits = isbn13.replace(/-/g, "");
  if (!/^978\d{10}$/.test(digits)) return null;

  const core = digits.slice(3, 12);
  const sum = [...core].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const checkDigit = remainder === 10 ? "X" : String(remainder);

  return core + checkDigit;
}
