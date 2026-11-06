'use strict';

/* =========================================================
   つづけログ — 1タップで今日の継続を記録するアプリ
   データはこの端末の localStorage にだけ保存されます。
   ========================================================= */

const STORE_KEY = 'tsuzuke-log-v1';
const APP_NAME = 'つづけログ';
const HASHTAG = '#つづけログ';
const COLORS = ['#ff7a45', '#2fb57c', '#4c8dff', '#9b6cf0', '#e8a800', '#f2557f'];
const EMOJIS = ['📖', '🏃', '💪', '🧘', '✍️', '💻', '🎸', '💧', '🛏️', '🧹', '🗣️', '🥗'];
const SUGGEST = [['📖', '読書'], ['🏃', '運動'], ['🧘', 'ストレッチ'], ['✍️', '日記'], ['💻', '勉強'], ['🎸', '楽器の練習']];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/* ---------- state ---------- */
let state = load();
let tab = new URLSearchParams(location.search).get('tab') || 'today';
let recHabit = null;
let calMonth = null; // Date (1日)

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits)) {
      return { habits: s.habits, logs: s.logs || {}, settings: { remindTime: '21:00', ...(s.settings || {}) } };
    }
  } catch (e) { /* 壊れたデータは無視して新規 */ }
  return { habits: [], logs: {}, settings: { remindTime: '21:00' } };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('保存できませんでした'); }
}

/* ---------- utils ---------- */
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const habitById = (id) => state.habits.find((h) => h.id === id);
const logsOf = (id) => (state.logs[id] ||= {});
const isDone = (id, k) => !!(state.logs[id] && state.logs[id][k]);

function stats(id) {
  const L = state.logs[id] || {};
  const keys = Object.keys(L).sort();
  const tk = todayKey();

  // 今日まだなら昨日から数える（今日記録すれば連続が続く）
  let d = new Date();
  if (!L[tk]) d = addDays(d, -1);
  let cur = 0;
  while (L[keyOf(d)]) { cur++; d = addDays(d, -1); }

  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && keyOf(addDays(parseKey(prev), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  const ym = tk.slice(0, 7);
  const monthDone = keys.filter((k) => k.startsWith(ym)).length;
  return { total: keys.length, cur, best, monthDone, dayOfMonth: new Date().getDate(), doneToday: !!L[tk] };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function buzz() { try { navigator.vibrate && navigator.vibrate(18); } catch (e) {} }

/* ---------- render ---------- */
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  if (tab === 'records') renderRecords(v);
  else if (tab === 'settings') renderSettings(v);
  else renderToday(v);
}

function setHeader(title, sub) {
  $('#title').textContent = title;
  $('#subtitle').textContent = sub || '';
}

/* ----- 今日 ----- */
function renderToday(v) {
  setHeader('今日', fmtDate(new Date()));
  const hs = state.habits;

  if (!hs.length) {
    v.innerHTML = `
      <div class="card onboard">
        <div class="big">🌱</div>
        <h2>続けたいことを1つ決めましょう</h2>
        <p class="muted">毎日ここを開いて、丸を1回タップするだけ。<br>まずは1つから始めるのがおすすめです。</p>
        <div class="chips">
          ${SUGGEST.map(([e, n]) => `<button class="chip" data-act="quick-add" data-emoji="${e}" data-name="${n}">${e} ${n}</button>`).join('')}
        </div>
        <button class="btn" data-act="add">自分で決める</button>
      </div>`;
    return;
  }

  const tk = todayKey();
  const doneCount = hs.filter((h) => isDone(h.id, tk)).length;
  const pct = Math.round((doneCount / hs.length) * 100);
  const msg = doneCount === hs.length ? '今日はぜんぶ完了！🎉' : `今日 ${doneCount} / ${hs.length}`;

  v.innerHTML = `
    <div class="progress"><span>${msg}</span><div class="bar"><i style="width:${pct}%"></i></div></div>
    ${hs.map((h) => habitCard(h, tk)).join('')}
    <button class="add" data-act="add">＋ 続けたいことを追加</button>`;
}

function habitCard(h, tk) {
  const s = stats(h.id);
  const entry = state.logs[h.id]?.[tk];
  let hint = '';
  if (!s.doneToday && s.cur > 0) hint = `今日タップで ${s.cur + 1}日連続！`;
  else if (!s.doneToday && s.total > 0) hint = `合計${s.total}日分は消えません。今日からまた1日目`;
  else if (!s.doneToday) hint = '丸をタップして記録';

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    days.push(`<span class="${isDone(h.id, keyOf(d)) ? 'on' : ''}"><i></i>${i === 0 ? '今日' : DOW[d.getDay()]}</span>`);
  }

  return `
    <section class="habit ${s.doneToday ? 'done' : ''}" style="--c:${h.color}" data-id="${h.id}">
      <div class="main">
        <button class="check" data-act="toggle" data-id="${h.id}" aria-label="${esc(h.name)}を${s.doneToday ? '取り消す' : '記録する'}">✓</button>
        <div class="info">
          <div class="name">${esc(h.emoji)} ${esc(h.name)}</div>
          <div class="meta">🔥 <b>${s.cur}</b>日連続 ・ 合計 <b>${s.total}</b>日</div>
          ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
        </div>
      </div>
      <div class="week">${days.join('')}</div>
      ${s.doneToday ? `
        <div class="after">
          <input type="text" class="memo" data-id="${h.id}" maxlength="100" placeholder="今日やったこと（任意）" value="${esc(entry?.memo)}">
          <button class="btn small" data-act="share" data-id="${h.id}">シェア</button>
        </div>` : ''}
    </section>`;
}

/* ----- 記録 ----- */
function renderRecords(v) {
  setHeader('記録', '続けた日が色で埋まっていきます');
  const hs = state.habits;
  if (!hs.length) {
    v.innerHTML = `<div class="card muted">まだ記録がありません。「今日」タブから続けたいことを追加しましょう。</div>`;
    return;
  }
  if (!recHabit || !habitById(recHabit)) recHabit = hs[0].id;
  const h = habitById(recHabit);
  const s = stats(h.id);
  const L = state.logs[h.id] || {};
  if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }

  // ヒートマップ（直近20週）
  const WEEKS = 20;
  const today = new Date();
  const start = addDays(today, -(WEEKS - 1) * 7 - today.getDay());
  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i);
    const k = keyOf(d);
    const future = d > today;
    const cls = [L[k] ? 'on' : '', k === keyOf(today) ? 'today' : '', future ? 'future' : ''].join(' ');
    cells.push(`<button class="${cls}" data-act="day" data-k="${k}" ${future ? 'disabled' : ''} aria-label="${k}"></button>`);
  }

  // 月カレンダー
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const cal = DOW.map((d) => `<div class="dow">${d}</div>`);
  for (let i = 0; i < first.getDay(); i++) cal.push('<div></div>');
  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(y, m, day), k = keyOf(d);
    const cls = [L[k] ? 'on' : '', k === keyOf(today) ? 'today' : ''].join(' ');
    cal.push(`<button class="${cls}" data-act="day" data-k="${k}" ${d > today ? 'disabled' : ''}>${day}</button>`);
  }

  const memos = Object.entries(L).filter(([, e]) => e && e.memo).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 20);

  v.innerHTML = `
    <div class="chips left">
      ${hs.map((x) => `<button class="chip ${x.id === h.id ? 'active' : ''}" data-act="rec-habit" data-id="${x.id}">${esc(x.emoji)} ${esc(x.name)}</button>`).join('')}
    </div>
    <div style="--c:${h.color}">
      <div class="stats">
        <div class="stat hero">
          <div><div class="l">いまの連続</div><div class="v">${s.cur}<small>日</small></div></div>
          <button class="btn small" style="background:${h.color}" data-act="share" data-id="${h.id}">シェア</button>
        </div>
        <div class="stat"><div class="v">${s.total}<small>日</small></div><div class="l">合計（減りません）</div></div>
        <div class="stat"><div class="v">${s.best}<small>日</small></div><div class="l">最長連続</div></div>
        <div class="stat"><div class="v">${s.monthDone}<small>/${s.dayOfMonth}日</small></div><div class="l">今月</div></div>
        <div class="stat"><div class="v">${s.dayOfMonth ? Math.round((s.monthDone / s.dayOfMonth) * 100) : 0}<small>%</small></div><div class="l">今月の達成率</div></div>
      </div>

      <div class="card">
        <h2>直近20週</h2>
        <div class="heat-wrap"><div class="heat">${cells.join('')}</div></div>
        <div class="heat-legend"><span>${start.getMonth() + 1}月</span><span>マスをタップで付け忘れを修正</span><span>今日</span></div>
      </div>

      <div class="card">
        <div class="month-head">
          <button data-act="month" data-d="-1" aria-label="前の月">‹</button>
          <h2 style="margin:0">${y}年${m + 1}月</h2>
          <button data-act="month" data-d="1" aria-label="次の月">›</button>
        </div>
        <div class="cal">${cal.join('')}</div>
      </div>

      <div class="card">
        <h2>やったことメモ</h2>
        ${memos.length ? `<ul class="memos">${memos.map(([k, e]) => `<li><time>${fmtDate(parseKey(k))}</time>${esc(e.memo)}</li>`).join('')}</ul>`
          : '<p class="muted" style="margin:0">記録した後にメモを書くと、ここに並びます。</p>'}
      </div>
    </div>`;
}

/* ----- 設定 ----- */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

function renderSettings(v) {
  setHeader('設定', '');
  const t = state.settings.remindTime;
  v.innerHTML = `
    ${!isStandalone() ? `
    <div class="card">
      <h2>📱 ホーム画面に追加</h2>
      <div class="warn">ホーム画面から開くと、アプリのように1タップで起動できます。記録も消えにくくなります。</div>
      <ol class="steps">
        <li>Safariでこのページを開く</li>
        <li>下の <b>共有ボタン</b>（□に↑）をタップ</li>
        <li><b>「ホーム画面に追加」</b>を選ぶ</li>
        <li>以後はホーム画面の「${APP_NAME}」から開く</li>
      </ol>
    </div>` : ''}

    <div class="card">
      <h2>🔔 毎日のリマインダー</h2>
      <p class="muted" style="margin-top:0">決まった時刻にiPhoneへ通知を出して、記録を思い出させます。</p>
      <label class="muted" for="remind-time">通知する時刻</label>
      <input type="time" id="remind-time" value="${esc(t)}" style="margin:6px 0 12px">
      <button class="btn" data-act="ics">カレンダーに毎日の通知を追加</button>
      <p class="muted" style="font-size:12px;margin:8px 0 0">iPhoneのカレンダーに「毎日${esc(t)}」の予定と通知が入ります。うまく開かないときは、Safariでこのページを開いてから押してください。</p>
      <details>
        <summary>ショートカットで通知する方法（より確実）</summary>
        <ol class="steps">
          <li>「ショートカット」アプリ →「オートメーション」→「＋」</li>
          <li>「時刻」→ <b>${esc(t)}</b>・<b>毎日</b>・<b>すぐに実行</b> を選んで「次へ」</li>
          <li>アクションに<b>「通知を表示」</b>を追加し、「今日の継続を記録しよう」と入力</li>
          <li>通知が来たら、ホーム画面の「${APP_NAME}」を開いて丸をタップ</li>
        </ol>
        <p class="muted" style="font-size:12px">ホーム画面のアイコンは、Dockか1ページ目に置くと迷わず開けます。</p>
      </details>
    </div>

    <div class="card">
      <h2>🌱 続けていること</h2>
      ${state.habits.length ? state.habits.map((h) => `
        <div class="list-item">
          <span style="font-size:22px">${esc(h.emoji)}</span>
          <span class="nm">${esc(h.name)}</span>
          <button class="btn small ghost" data-act="edit" data-id="${h.id}">編集</button>
        </div>`).join('') : '<p class="muted">まだありません</p>'}
      <button class="btn ghost" data-act="add" style="margin-top:10px">＋ 追加</button>
    </div>

    <div class="card">
      <h2>💾 バックアップ</h2>
      <p class="muted" style="margin-top:0">記録はこのiPhoneの中だけに保存されています。機種変更の前などに書き出しておくと安心です。</p>
      <div class="row">
        <button class="btn ghost" data-act="export">書き出す</button>
        <button class="btn ghost" data-act="import">読み込む</button>
      </div>
    </div>

    <p class="muted" style="text-align:center;font-size:12px">${APP_NAME} v1.0</p>`;
}

/* ---------- actions ---------- */
function toggleToday(id, btnEl) {
  const tk = todayKey();
  const L = logsOf(id);
  if (L[tk]) {
    if (L[tk].memo && !confirm('今日の記録とメモを取り消しますか？')) return;
    delete L[tk];
    save(); render();
    toast('取り消しました');
    return;
  }
  L[tk] = { t: Date.now(), memo: '' };
  save();
  buzz();
  render();
  const card = document.querySelector(`.habit[data-id="${id}"]`);
  if (card) {
    card.classList.add('pop');
    setTimeout(() => card.querySelector('.memo')?.focus({ preventScroll: true }), 50);
  }
  const s = stats(id);
  toast(s.cur > 1 ? `記録しました 🔥 ${s.cur}日連続！` : '記録しました 🎉');
}

function toggleDay(k) {
  const h = habitById(recHabit);
  if (!h) return;
  const L = logsOf(h.id);
  const label = fmtDate(parseKey(k));
  if (L[k]) {
    if (!confirm(`${label}の記録を取り消しますか？`)) return;
    delete L[k];
    toast(`${label}を取り消しました`);
  } else {
    L[k] = { t: Date.now(), memo: '', later: k !== todayKey() };
    toast(`${label}を記録しました`);
  }
  save(); render();
}

/* ----- シート（下から出るパネル） ----- */
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheet-bg').hidden = false;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-bg').hidden = true;
  $('#sheet').innerHTML = '';
}

function openHabitEditor(id, preset) {
  const h = id ? habitById(id) : null;
  const draft = { emoji: h?.emoji || preset?.emoji || EMOJIS[0], color: h?.color || COLORS[state.habits.length % COLORS.length] };
  openSheet(`
    <h2>${h ? '編集' : '続けたいことを追加'}</h2>
    <label for="h-name">名前</label>
    <input type="text" id="h-name" maxlength="20" placeholder="例：読書を1ページ" value="${esc(h?.name || preset?.name || '')}">
    <p class="muted" style="font-size:12px;margin:6px 0 0">コツ：「1ページ読む」「1分ストレッチ」のように、小さくするほど続きます。</p>
    <label>アイコン</label>
    <div class="emoji-grid">${EMOJIS.map((e) => `<button data-pick-emoji="${e}" class="${e === draft.emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
    <label>色</label>
    <div class="color-row">${COLORS.map((c) => `<button data-pick-color="${c}" style="background:${c}" class="${c === draft.color ? 'active' : ''}" aria-label="色"></button>`).join('')}</div>
    <div class="actions">
      <button class="btn" data-act="save-habit" data-id="${h?.id || ''}">保存</button>
      ${h ? `<button class="btn ghost" data-act="delete-habit" data-id="${h.id}" style="color:#e5484d">削除する</button>` : ''}
      <button class="btn ghost" data-act="close">キャンセル</button>
    </div>`);
  $('#sheet').dataset.emoji = draft.emoji;
  $('#sheet').dataset.color = draft.color;
  if (!h && !preset) setTimeout(() => $('#h-name')?.focus(), 250);
}

function saveHabit(id) {
  const name = $('#h-name').value.trim();
  if (!name) { toast('名前を入れてください'); $('#h-name').focus(); return; }
  const emoji = $('#sheet').dataset.emoji, color = $('#sheet').dataset.color;
  if (id) Object.assign(habitById(id), { name, emoji, color });
  else state.habits.push({ id: uid(), name, emoji, color, createdAt: Date.now() });
  save(); closeSheet(); render();
  toast(id ? '保存しました' : '追加しました');
}

function deleteHabit(id) {
  const h = habitById(id);
  if (!h || !confirm(`「${h.name}」とその記録をすべて削除しますか？\nこの操作は元に戻せません。`)) return;
  state.habits = state.habits.filter((x) => x.id !== id);
  delete state.logs[id];
  save(); closeSheet(); render();
  toast('削除しました');
}

/* ----- シェア ----- */
function shareText(h, s, memo) {
  const lines = [
    `${h.emoji} ${h.name}${s.doneToday ? ' 今日も達成！' : ''}`,
    `🔥 ${s.cur}日連続 ／ 合計${s.total}日`,
  ];
  if (memo) lines.push(`今日やったこと：${memo}`);
  lines.push(HASHTAG);
  return lines.join('\n');
}

function wrapText(ctx, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

function makeShareImage(h, s, memo) {
  const W = 1080, H = 1080;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const F = '-apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

  // 背景
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, h.color);
  g.addColorStop(1, shade(h.color, -0.25));
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // カード
  x.fillStyle = '#ffffff';
  roundRect(x, 70, 70, W - 140, H - 140, 48); x.fill();

  x.fillStyle = '#8a7d74'; x.font = `600 34px ${F}`;
  x.fillText(fmtDate(new Date()), 130, 165);

  x.fillStyle = '#2b2420'; x.font = `800 64px ${F}`;
  const title = `${h.emoji} ${h.name}`;
  x.fillText(wrapText(x, title, W - 260)[0], 130, 255);

  // 連続日数
  x.fillStyle = h.color; x.font = `900 230px ${F}`;
  const num = String(s.cur);
  x.fillText(num, 120, 500);
  const nw = x.measureText(num).width;
  x.fillStyle = '#2b2420'; x.font = `800 60px ${F}`;
  x.fillText('日連続 🔥', 140 + nw, 490);

  x.fillStyle = '#8a7d74'; x.font = `600 36px ${F}`;
  x.fillText(`合計 ${s.total}日 ・ 最長 ${s.best}日`, 130, 570);

  // 直近5週のマス
  const L = state.logs[h.id] || {};
  const today = new Date();
  const days = 35, cell = 100, gap = 14;
  const startX = 130, startY = 615;
  const first = addDays(today, -(days - 1));
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i);
    const col = i % 7, row = Math.floor(i / 7);
    x.fillStyle = L[keyOf(d)] ? h.color : '#f1e8e2';
    roundRect(x, startX + col * (cell + gap) + 2, startY + row * (36 + 8), cell, 36, 10); x.fill();
  }

  // メモ
  let y = 885;
  if (memo) {
    x.fillStyle = '#2b2420'; x.font = `600 36px ${F}`;
    const lines = wrapText(x, `今日やったこと：${memo}`, W - 260).slice(0, 2);
    for (const ln of lines) { x.fillText(ln, 130, y); y += 50; }
  }

  x.fillStyle = '#b3a69c'; x.font = `700 30px ${F}`;
  x.textAlign = 'right';
  x.fillText(`✓ ${APP_NAME}`, W - 130, H - 115);

  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

let shareCtx = null;
async function openShare(id) {
  const h = habitById(id);
  const s = stats(id);
  const memo = state.logs[id]?.[todayKey()]?.memo || '';
  const text = shareText(h, s, memo);
  const blob = await makeShareImage(h, s, memo);
  const file = new File([blob], 'tsuzuke-log.png', { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  shareCtx = { text, file, url };
  openSheet(`
    <h2>シェアする</h2>
    <img class="share-preview" src="${url}" alt="シェア用の画像">
    <div class="share-text">${esc(text)}</div>
    <div class="actions">
      <button class="btn" data-act="share-native">画像とテキストを共有</button>
      <div class="row">
        <button class="btn ghost" data-act="share-x">Xに投稿</button>
        <button class="btn ghost" data-act="share-copy">テキストをコピー</button>
      </div>
      <button class="btn ghost" data-act="close">閉じる</button>
    </div>`);
}

async function shareNative() {
  const { text, file } = shareCtx;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
    } else if (navigator.share) {
      await navigator.share({ text });
    } else {
      const a = document.createElement('a');
      a.href = shareCtx.url; a.download = 'tsuzuke-log.png'; a.click();
      await copyText(text);
      toast('画像を保存してテキストをコピーしました');
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('共有できませんでした');
  }
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

/* ----- リマインダー（.ics） ----- */
function downloadIcs() {
  const [hh, mm] = (state.settings.remindTime || '21:00').split(':');
  const d = new Date();
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tsuzuke-log//JA', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:tsuzuke-log-reminder-${uid()}@tsuzuke-log`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${hh}${mm}00`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:✅ 今日の継続を記録しよう',
    `DESCRIPTION:${APP_NAME}を開いて丸をタップ`,
    `URL:${appUrl()}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:今日の継続を記録しよう', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tsuzuke-reminder.ics';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ----- バックアップ ----- */
async function exportData() {
  const json = JSON.stringify({ app: 'tsuzuke-log', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const name = `tsuzuke-log-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.habits) || typeof d.logs !== 'object') throw new Error('bad');
      if (!confirm(`続けていること${d.habits.length}件の記録を読み込みます。今の記録は置き換わります。よろしいですか？`)) return;
      state = { habits: d.habits, logs: d.logs || {}, settings: { remindTime: '21:00', ...(d.settings || {}) } };
      save(); render(); toast('読み込みました');
    } catch (e) { toast('このファイルは読み込めません'); }
  };
  r.readAsText(file);
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('.tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }

  const pe = e.target.closest('[data-pick-emoji]');
  if (pe) { $('#sheet').dataset.emoji = pe.dataset.pickEmoji; document.querySelectorAll('[data-pick-emoji]').forEach((b) => b.classList.toggle('active', b === pe)); return; }
  const pc = e.target.closest('[data-pick-color]');
  if (pc) { $('#sheet').dataset.color = pc.dataset.pickColor; document.querySelectorAll('[data-pick-color]').forEach((b) => b.classList.toggle('active', b === pc)); return; }

  if (e.target.id === 'sheet-bg') { closeSheet(); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'toggle': toggleToday(id, el); break;
    case 'add': openHabitEditor(null); break;
    case 'quick-add': openHabitEditor(null, { emoji: el.dataset.emoji, name: el.dataset.name }); break;
    case 'edit': openHabitEditor(id); break;
    case 'save-habit': saveHabit(id); break;
    case 'delete-habit': deleteHabit(id); break;
    case 'close': closeSheet(); break;
    case 'rec-habit': recHabit = id; render(); break;
    case 'day': toggleDay(el.dataset.k); break;
    case 'month': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(el.dataset.d), 1); render(); break;
    case 'share': openShare(id); break;
    case 'share-native': shareNative(); break;
    case 'share-x': window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareCtx.text)}`, '_blank'); break;
    case 'share-copy': if (await copyText(shareCtx.text)) toast('コピーしました'); break;
    case 'ics': downloadIcs(); break;
    case 'export': exportData(); break;
    case 'import': $('#import-file').click(); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('memo')) {
    const entry = state.logs[e.target.dataset.id]?.[todayKey()];
    if (entry) { entry.memo = e.target.value; save(); }
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'remind-time') { state.settings.remindTime = e.target.value || '21:00'; save(); render(); }
  if (e.target.id === 'import-file' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('memo')) { e.target.blur(); toast('メモを保存しました'); }
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

// 日付が変わった後にアプリへ戻ってきたら描き直す
let lastDay = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== lastDay) { lastDay = todayKey(); render(); }
});

/* ---------- boot ---------- */
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
