/**
 * デモ環境（docs/demo-environment.md、#720）の、架空のユーザーと関係のデータの計画。
 * DB には触れない純粋な関数（本の ID は、マスターデータの投入結果から受け取る）。
 *
 * ユーザーの名前は `demo_` で始め、メールアドレスは `@example.com`（RFC 2606 の予約ドメイン）にする。
 * この 2 つの条件を満たすユーザーだけが、初期化の対象になる（isDemoUser）。
 */

/** デモの一般ユーザーが共通で使う、公開してよいパスワード（実アカウントの値とは無関係。README に載せる）。 */
export const DEMO_USER_PASSWORD = "DemoPass123!";

export const DEMO_NAME_PREFIX = "demo_";
export const DEMO_EMAIL_SUFFIX = "@example.com";

/** 管理者の名前（認証情報は公開しない。パスワードは、実行時の環境変数から受け取る）。 */
export const DEMO_ADMIN_NAME = "demo_admin";

/** 初期化の対象（デモのユーザー）かどうか。名前が `demo_` で始まり、メールが `@example.com` で終わるものだけ。 */
export function isDemoUser(user: { name: string; email: string }): boolean {
  return user.name.startsWith(DEMO_NAME_PREFIX) && user.email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

export const DEMO_USERNAMES = ["sakura", "ren", "haruka", "kenta", "yui", "sota", "mio", "taku"] as const;

export type DemoBook = { id: number; title: string; isbn: string | null; authorId: number; authorName: string };

export type PlannedUser = { key: string; name: string; email: string; role: "user" | "admin" };

export type DemoPlan = {
  users: PlannedUser[];
  /** [フォローする人, フォローされる人]（ユーザーの key）。相互フォローを含む。 */
  follows: [string, string][];
  readingStatuses: { user: string; bookId: number; status: "read" | "reading" | "want_to_read" }[];
  reviews: { ref: string; user: string; bookId: number; body: string; isSpoiler: boolean; isPublic: boolean; daysAgo: number }[];
  /** reviewRef: reviews の ref */
  likes: { user: string; reviewRef: string }[];
  reports: { user: string; reviewRef: string }[];
  favoriteAuthors: { user: string; authorId: number }[];
  libraries: { user: string; systemid: string; libkey: string; name: string; pref: string; city: string }[];
  notifications: {
    user: string;
    type: "like" | "mutual_favorite_author" | "new_book";
    content: string;
    actor?: string;
    bookIsbn: string | null;
    bookTitle: string | null;
    isRead: boolean;
    daysAgo: number;
  }[];
};

const FOLLOWS: [string, string][] = [
  ["sakura", "ren"],
  ["ren", "sakura"],
  ["sakura", "haruka"],
  ["haruka", "sakura"],
  ["ren", "kenta"],
  ["kenta", "ren"],
  ["haruka", "yui"],
  ["yui", "sakura"],
  ["kenta", "sota"],
  ["sota", "mio"],
  ["mio", "sota"],
  ["mio", "taku"],
  ["taku", "sakura"],
  ["ren", "haruka"],
];

const REVIEW_TEXTS = [
  { body: "テンポよく読めました。登場人物の関係が少しずつ分かってくる構成が良かったです。", isSpoiler: false, isPublic: true },
  { body: "終盤の展開に驚きました。もう一度、最初から読み返したくなります。", isSpoiler: true, isPublic: true },
  { body: "文章が読みやすく、通勤の合間に少しずつ読み進められました。", isSpoiler: false, isPublic: true },
  { body: "結末の真相が分かってから読み返すと、序盤の何気ない場面の意味が変わって見えます。", isSpoiler: true, isPublic: true },
  { body: "情景の描写が丁寧で、読んでいるあいだ、その場にいるような気分になりました。", isSpoiler: false, isPublic: true },
  { body: "好みが分かれそうですが、私は最後まで夢中で読みました。", isSpoiler: false, isPublic: true },
  { body: "あとで読み返すための、自分用のメモです。気になった場面に付箋を貼りました。", isSpoiler: false, isPublic: false },
  { body: "犯人の動機に、少し無理があるように感じました。ただ、そこまでの過程は面白かったです。", isSpoiler: true, isPublic: true },
  { body: "家族や友人に勧めたくなる一冊でした。", isSpoiler: false, isPublic: true },
  { body: "読み終えたあとの余韻が長く残りました。", isSpoiler: false, isPublic: true },
  { body: "登場人物の心の動きが細かく書かれていて、共感する場面が多かったです。", isSpoiler: false, isPublic: true },
  { body: "非公開にしておく、読書の記録です。", isSpoiler: false, isPublic: false },
];

const LIBRARIES = [
  { systemid: "Tokyo_Minato", libkey: "", name: "港区立図書館", pref: "東京都", city: "港区" },
  { systemid: "Kanagawa_Yokohama", libkey: "", name: "横浜市立図書館", pref: "神奈川県", city: "横浜市" },
];

const READING_CYCLE = ["read", "reading", "want_to_read"] as const;

/**
 * 計画を作る。`books` は、賞のある本を ID の昇順に並べたもの（8 冊以上）。同じ入力から、いつも同じ計画ができる。
 * `includeAdmin` が真なら、管理者を 1 名加える。
 */
export function buildDemoPlan(books: DemoBook[], options: { includeAdmin?: boolean } = {}): DemoPlan {
  if (books.length < 8) throw new Error("賞のある本が 8 冊以上必要です。先に、マスターデータをデモ用 D1 へ投入してください。");
  const bookAt = (index: number) => books[((index % books.length) + books.length) % books.length];

  const users: PlannedUser[] = DEMO_USERNAMES.map((name) => ({
    key: name,
    name: `${DEMO_NAME_PREFIX}${name}`,
    email: `${DEMO_NAME_PREFIX}${name}${DEMO_EMAIL_SUFFIX}`,
    role: "user" as const,
  }));
  if (options.includeAdmin) {
    users.push({ key: "admin", name: DEMO_ADMIN_NAME, email: `${DEMO_ADMIN_NAME}${DEMO_EMAIL_SUFFIX}`, role: "admin" });
  }
  const userKeys = DEMO_USERNAMES as readonly string[];

  // レビュー: ユーザー i が、本 (i * 3 + 1) から順に探して、まだ書いていない本に書く（同じ組が重複しないように）
  const reviewPairs = new Set<string>();
  const reviews: DemoPlan["reviews"] = REVIEW_TEXTS.map((text, index) => {
    const user = userKeys[index % userKeys.length];
    let offset = index * 3 + 1;
    while (reviewPairs.has(`${user}:${bookAt(offset).id}`)) offset += 1;
    const bookId = bookAt(offset).id;
    reviewPairs.add(`${user}:${bookId}`);
    return { ref: `r${index}`, user, bookId, ...text, daysAgo: 20 - index };
  });

  // 読書状況: 各ユーザーが 8 冊。レビューを書いた本は「読了」にする
  const statuses = new Map<string, "read" | "reading" | "want_to_read">();
  userKeys.forEach((user, userIndex) => {
    for (let k = 0; k < 8; k += 1) {
      statuses.set(`${user}:${bookAt(userIndex * 3 + k).id}`, READING_CYCLE[(userIndex + k) % READING_CYCLE.length]);
    }
  });
  for (const review of reviews) statuses.set(`${review.user}:${review.bookId}`, "read");
  const readingStatuses = [...statuses].map(([pair, status]) => {
    const [user, bookId] = pair.split(":");
    return { user, bookId: Number(bookId), status };
  });

  // いいね: 公開のレビューに、自分以外の 3 人が付ける。通報: 1 件のレビューに 2 人
  const likes: DemoPlan["likes"] = [];
  for (const review of reviews.filter((r) => r.isPublic)) {
    const authorIndex = userKeys.indexOf(review.user);
    for (let k = 1; k <= 3; k += 1) likes.push({ user: userKeys[(authorIndex + k) % userKeys.length], reviewRef: review.ref });
  }
  const reported = reviews.find((r) => r.isPublic && r.isSpoiler) ?? reviews[0];
  const reporterBase = userKeys.indexOf(reported.user);
  const reports = [1, 2].map((k) => ({ user: userKeys[(reporterBase + k + 3) % userKeys.length], reviewRef: reported.ref }));

  // お気に入り著者: 各ユーザーが、読書状況にある本の著者から 2 名
  const favoriteAuthors: DemoPlan["favoriteAuthors"] = [];
  userKeys.forEach((user, userIndex) => {
    const authorIds = new Set<number>();
    for (let k = 0; authorIds.size < 2 && k < books.length; k += 1) authorIds.add(bookAt(userIndex * 3 + k).authorId);
    for (const authorId of authorIds) favoriteAuthors.push({ user, authorId });
  });

  const libraries: DemoPlan["libraries"] = [];
  userKeys.forEach((user, index) => {
    libraries.push({ user, ...LIBRARIES[index % LIBRARIES.length] });
    if (index % 4 === 0) libraries.push({ user, ...LIBRARIES[(index + 1) % LIBRARIES.length] });
  });

  // 通知: いいね（レビューの著者宛て）、相互フォローの相手のお気に入り著者の追加、お気に入り著者の新刊
  const notifications: DemoPlan["notifications"] = [];
  const reviewByRef = new Map(reviews.map((r) => [r.ref, r]));
  const bookById = new Map(books.map((b) => [b.id, b]));
  // 通知は（宛先, 種類, ISBN）で一意のため、いいねの通知は、レビューごとに 1 件にする
  for (const reviewRef of [...new Set(likes.map((like) => like.reviewRef))].slice(0, 6)) {
    const review = reviewByRef.get(reviewRef)!;
    const book = bookById.get(review.bookId)!;
    notifications.push({
      user: review.user,
      type: "like",
      content: "レビューにいいねが付きました",
      bookIsbn: book.isbn,
      bookTitle: book.title,
      isRead: notifications.length % 3 === 0,
      daysAgo: 6 - (notifications.length % 5),
    });
  }
  const mutualPairs = FOLLOWS.filter(([a, b]) => FOLLOWS.some(([c, d]) => c === b && d === a) && a < b);
  for (const [a, b] of mutualPairs) {
    const author = favoriteAuthors.find((f) => f.user === a);
    const authorName = books.find((book) => book.authorId === author?.authorId)?.authorName;
    if (!authorName) continue;
    notifications.push({
      user: b,
      type: "mutual_favorite_author",
      content: `${DEMO_NAME_PREFIX}${a}さんがお気に入り著者に「${authorName}」を追加しました。`,
      actor: a,
      bookIsbn: null,
      bookTitle: null,
      isRead: false,
      daysAgo: 3,
    });
  }
  const newBook = bookAt(7);
  notifications.push({
    user: "sakura",
    type: "new_book",
    content: `${newBook.authorName} の新刊「${newBook.title}」が発売されました`,
    bookIsbn: newBook.isbn,
    bookTitle: null,
    isRead: false,
    daysAgo: 1,
  });

  return { users, follows: FOLLOWS, readingStatuses, reviews, likes, reports, favoriteAuthors, libraries, notifications };
}
