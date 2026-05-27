/* ===== ダミーデータ ===== */
const BOOKS = {
  naoki: [
    { id: 1, title: '流浪の月', author: '凪良ゆう', year: 2019, badge: 'win', cover: 1, read: false },
    { id: 2, title: '少年と犬', author: '馳星周', year: 2020, badge: 'win', cover: 2, read: true },
    { id: 3, title: '塞王の楯', author: '今村翔吾', year: 2022, badge: 'win', cover: 3, read: false },
    { id: 4, title: '姉ちゃんの恋人', author: '有川ひろ', year: 2021, badge: 'nom', cover: 4, read: false },
    { id: 5, title: 'ツミデミック', author: '一穂ミチ', year: 2024, badge: 'win', cover: 1, read: true },
    { id: 6, title: 'ぼくが電話をかけていた場所', author: '桐野夏生', year: 2023, badge: 'nom', cover: 2, read: false },
  ],
  akutagawa: [
    { id: 7, title: '推し、燃ゆ', author: '宇佐見りん', year: 2020, badge: 'win', cover: 3, read: true },
    { id: 8, title: '貝に続く場所にて', author: '石沢麻依', year: 2021, badge: 'win', cover: 4, read: false },
    { id: 9, title: '荒地の家族', author: '佐藤厚志', year: 2023, badge: 'win', cover: 1, read: false },
    { id: 10, title: 'ハンチバック', author: '市川沙央', year: 2023, badge: 'win', cover: 2, read: true },
    { id: 11, title: '東京都同情塔', author: '九段理江', year: 2024, badge: 'win', cover: 3, read: false },
  ],
  honya: [
    { id: 12, title: '同志少女よ、敵を撃て', author: '逢坂冬馬', year: 2022, badge: 'win', cover: 4, read: true },
    { id: 13, title: '汝、星のごとく', author: '凪良ゆう', year: 2023, badge: 'win', cover: 1, read: false },
    { id: 14, title: '成瀬は天下を取りにいく', author: '宮島未奈', year: 2024, badge: 'win', cover: 2, read: true },
    { id: 15, title: 'ともぐい', author: '河崎秋子', year: 2024, badge: 'nom', cover: 3, read: false },
  ],
  konomys: [
    { id: 16, title: '名探偵のいけにえ', author: '白井智之', year: 2023, badge: 'win', cover: 4, read: false },
    { id: 17, title: '可燃物', author: '米澤穂信', year: 2024, badge: 'win', cover: 1, read: true },
    { id: 18, title: 'ジウ', author: '誉田哲也', year: 2022, badge: 'nom', cover: 2, read: false },
  ],
};

const AUTHORS = [
  { id: 1, name: '凪良ゆう', works: 45, read: 12, notif: true },
  { id: 2, name: '東野圭吾', works: 80, read: 30, notif: true },
  { id: 3, name: '宇佐見りん', works: 10, read: 5, notif: false },
  { id: 4, name: '米澤穂信', works: 35, read: 18, notif: false },
];

const NOTIFICATIONS = [
  { id: 1, type: 'new', icon: '📚', label: '新刊', text: '東野圭吾が新刊を出しました「魔女と探偵」', date: '2024/05/25', read: false, target: 'author' },
  { id: 2, type: 'like', icon: '♡', label: 'いいね', text: '「推し、燃ゆ」の感想にいいねがつきました', date: '2024/05/24', read: false, target: 'review' },
  { id: 3, type: 'new', icon: '📚', label: '新刊', text: '凪良ゆうが新刊を出しました「静謐な午後」', date: '2024/05/20', read: true, target: 'author' },
  { id: 4, type: 'like', icon: '♡', label: 'いいね', text: '「ハンチバック」の感想にいいねがつきました', date: '2024/05/18', read: true, target: 'review' },
];

const REVIEWS = [
  { id: 1, user: 'よむよむ', date: '2024/05/10', spoiler: false, text: '読み終わってしばらく放心してしまいました。登場人物それぞれの孤独が丁寧に描かれていて、読後感がとても深い作品でした。', likes: 12, liked: false },
  { id: 2, user: 'book_lover88', date: '2024/04/28', spoiler: true, text: '終盤の展開には驚きました。主人公の選択が賛否あると思いますが、私は支持したいです。', likes: 7, liked: false },
  { id: 3, user: 'ねこと本', date: '2024/04/15', spoiler: false, text: '文体が美しくて、情景描写が目に浮かぶようでした。受賞も納得の一冊です。', likes: 21, liked: true },
];

/* ===== 状態管理 ===== */
let state = {
  currentScreen: 'login',
  currentAwardTab: 'naoki',
  bookReadState: {},   // bookId -> bool
  authorNotif: {},     // authorId -> bool
  notifReadState: {},  // notifId -> bool
  reviewLikes: {},     // reviewId -> {count, liked}
  currentBookId: 1,
  currentAuthorId: 1,
  prevScreen: 'dashboard',
};

// 初期化
BOOKS.naoki.concat(BOOKS.akutagawa, BOOKS.honya, BOOKS.konomys).forEach(b => {
  state.bookReadState[b.id] = b.read;
});
AUTHORS.forEach(a => { state.authorNotif[a.id] = a.notif; });
NOTIFICATIONS.forEach(n => { state.notifReadState[n.id] = n.read; });
REVIEWS.forEach(r => { state.reviewLikes[r.id] = { count: r.likes, liked: r.liked }; });

/* ===== 画面遷移 ===== */
function navigate(screenId, opts = {}) {
  if (opts.prev) state.prevScreen = state.currentScreen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + screenId);
  if (target) { target.classList.add('active'); state.currentScreen = screenId; }
  if (opts.bookId !== undefined) state.currentBookId = opts.bookId;
  if (opts.authorId !== undefined) state.currentAuthorId = opts.authorId;
  window.scrollTo(0, 0);
  renderScreen(screenId);
}

function goBack() { navigate(state.prevScreen); }

/* ===== 各画面レンダリング ===== */
function renderScreen(id) {
  if (id === 'dashboard') renderDashboard();
  if (id === 'award') renderAward();
  if (id === 'authors') renderAuthors();
  if (id === 'author-detail') renderAuthorDetail();
  if (id === 'review') renderReview();
  if (id === 'notifications') renderNotifications();
}

/* ===== ダッシュボード ===== */
function renderDashboard() {
  const awards = [
    { key: 'naoki', name: '直木賞' },
    { key: 'akutagawa', name: '芥川賞' },
    { key: 'honya', name: '本屋大賞' },
    { key: 'konomys', name: 'このミス' },
  ];
  const el = document.getElementById('dashboard-award-list');
  el.innerHTML = awards.map(a => {
    const books = BOOKS[a.key];
    const total = books.length;
    const done = books.filter(b => state.bookReadState[b.id]).length;
    const pct = Math.round(done / total * 100);
    return `<li class="award-item">
      <div class="award-name">${a.name}</div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-text">${done} / ${total}冊 (${pct}%)</div>
    </li>`;
  }).join('');

  const unread = NOTIFICATIONS.filter(n => !state.notifReadState[n.id]).length;
  document.querySelectorAll('.notif-badge').forEach(el => { el.textContent = unread; el.style.display = unread ? '' : 'none'; });
}

/* ===== 賞別作品一覧 ===== */
function renderAward() {
  const key = state.currentAwardTab;
  const books = BOOKS[key];
  const total = books.length;
  const done = books.filter(b => state.bookReadState[b.id]).length;
  const pct = Math.round(done / total * 100);

  document.getElementById('award-progress-text').textContent = `${done} / ${total}冊 (${pct}%)`;
  document.getElementById('award-progress-fill').style.width = pct + '%';

  document.querySelectorAll('.tab-btn[data-award]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.award === key);
  });

  const grid = document.getElementById('award-book-grid');
  grid.innerHTML = books.map(b => buildBookCard(b)).join('');
}

/* ===== 著者一覧 ===== */
function renderAuthors() {
  const list = document.getElementById('author-list');
  list.innerHTML = AUTHORS.map(a => {
    const notif = state.authorNotif[a.id];
    return `<div class="author-card">
      <div class="author-card-header" onclick="navigate('author-detail',{authorId:${a.id},prev:'authors'})">
        <div class="author-avatar">${a.name[0]}</div>
        <div>
          <div class="author-name">${a.name}</div>
          <div class="author-meta">登録作品: ${a.works}冊 / 読了: ${a.read}冊</div>
        </div>
        <div class="author-actions" onclick="event.stopPropagation()">
          <button class="notif-toggle ${notif ? 'on' : ''}" onclick="toggleAuthorNotif(${a.id})">
            ${notif ? '🔔ON' : '🔕OFF'}
          </button>
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">削除</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ===== 著者別作品 ===== */
function renderAuthorDetail() {
  const author = AUTHORS.find(a => a.id === state.currentAuthorId);
  if (!author) return;
  document.getElementById('author-detail-name').textContent = author.name;

  const allBooks = Object.values(BOOKS).flat().filter((_, i) => i % 2 === state.currentAuthorId % 2 || i < 4);
  const total = allBooks.length;
  const done = allBooks.filter(b => state.bookReadState[b.id]).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('author-detail-progress-text').textContent = `読了: ${done} / ${total}冊 (${pct}%)`;
  document.getElementById('author-detail-progress-fill').style.width = pct + '%';

  const grid = document.getElementById('author-detail-book-grid');
  grid.innerHTML = allBooks.map(b => buildBookCard(b)).join('');
}

/* ===== 感想 ===== */
function renderReview() {
  const book = Object.values(BOOKS).flat().find(b => b.id === state.currentBookId) || BOOKS.naoki[0];
  document.getElementById('review-book-title').textContent = book.title;
  document.getElementById('review-book-author').textContent = book.author;

  const list = document.getElementById('review-list');
  list.innerHTML = REVIEWS.map(r => {
    const ls = state.reviewLikes[r.id];
    return `<div class="review-card">
      <div class="review-card-header">
        <span class="reviewer-name">${r.user}</span>
        <span class="review-date">${r.date}</span>
      </div>
      ${r.spoiler ? '<span class="badge badge-nom" style="margin-bottom:6px;display:inline-block">⚠️ ネタバレあり</span>' : ''}
      <div class="review-text">${r.spoiler ? '<span class="spoiler-warning">（ネタバレを含みます。タップで展開）</span>' : r.text}</div>
      <div class="review-footer">
        <button class="like-btn ${ls.liked ? 'liked' : ''}" onclick="toggleLike(${r.id})">♡ ${ls.count}</button>
      </div>
    </div>`;
  }).join('');
}

/* ===== 通知 ===== */
function renderNotifications() {
  const unread = NOTIFICATIONS.filter(n => !state.notifReadState[n.id]).length;
  document.querySelectorAll('.notif-badge').forEach(el => { el.textContent = unread; el.style.display = unread ? '' : 'none'; });

  const list = document.getElementById('notif-list');
  list.innerHTML = NOTIFICATIONS.map(n => {
    const isUnread = !state.notifReadState[n.id];
    return `<div class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotifClick(${n.id},'${n.target}')">
      <span class="notif-icon">${n.icon}</span>
      <div class="notif-body">
        <span class="notif-type">${n.label}</span>
        <div class="notif-text">${n.text}</div>
        <div class="notif-meta">
          <span class="notif-date">${n.date}</span>
          <span class="notif-status ${isUnread ? 'unread-badge' : 'read-badge'}">${isUnread ? '未読' : '既読'}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ===== ヘルパー ===== */
function buildBookCard(b) {
  const isRead = state.bookReadState[b.id];
  return `<div class="book-card" onclick="navigate('review',{bookId:${b.id},prev:'${state.currentScreen}'})">
    <div class="book-cover cover-${b.cover}">📖</div>
    <div class="book-info">
      <div class="title">${b.title}</div>
      <div class="author">${b.author}</div>
      <div class="book-footer">
        <span class="badge ${b.badge === 'win' ? 'badge-win' : 'badge-nom'}">${b.badge === 'win' ? '受賞' : '候補'}</span>
        <button class="read-toggle ${isRead ? 'read' : ''}" onclick="event.stopPropagation(); toggleRead(${b.id})">
          ${isRead ? '✓ 読了' : '未読'}
        </button>
      </div>
    </div>
  </div>`;
}

function toggleRead(bookId) {
  state.bookReadState[bookId] = !state.bookReadState[bookId];
  renderScreen(state.currentScreen);
}

function toggleAuthorNotif(authorId) {
  state.authorNotif[authorId] = !state.authorNotif[authorId];
  renderAuthors();
}

function toggleLike(reviewId) {
  const ls = state.reviewLikes[reviewId];
  if (ls.liked) { ls.count--; ls.liked = false; }
  else { ls.count++; ls.liked = true; }
  renderReview();
}

function handleNotifClick(notifId, target) {
  state.notifReadState[notifId] = true;
  if (target === 'author') navigate('author-detail', { authorId: 1, prev: 'notifications' });
  else navigate('review', { bookId: 7, prev: 'notifications' });
}

function markAllRead() {
  NOTIFICATIONS.forEach(n => { state.notifReadState[n.id] = true; });
  renderNotifications();
}

/* ===== タブ切り替え ===== */
function switchAwardTab(key) {
  state.currentAwardTab = key;
  renderAward();
}

/* ===== ユーザーメニュー ===== */
function toggleUserMenu() {
  document.querySelectorAll('.user-dropdown').forEach(d => d.classList.toggle('open'));
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) {
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('open'));
  }
});

/* ===== 初期表示 ===== */
document.addEventListener('DOMContentLoaded', () => {
  navigate('login');
});
