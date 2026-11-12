// ABL demo — PWA для действующих игроков. Данные — снимок из API MTGame в ./data (см. directives/abl_demo_app.md).

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");
const $sheet = document.getElementById("sheet");
const TZ = "Europe/Moscow";
const ME_KEY = "abl.me";

// ---------- Данные ----------
const TEAM_KEY = "abl.team";
let league = null;
const teamCache = new Map();
const gameCache = new Map();
const playerCache = new Map();

// Без сети service worker отдаёт сохранённую копию с заголовком X-ABL-Cache — тогда показываем плашку «Нет сети».
const SYNC_KEY = "abl.synced";
let fromCache = false;
async function loadJSON(url, fresh = false) {
  const r = await fetch(url, fresh ? { cache: "no-store" } : {});
  if (!r.ok) throw new Error(`Не удалось загрузить ${url} (${r.status})`);
  if (r.headers.get("X-ABL-Cache")) fromCache = true;
  else localStorage.setItem(SYNC_KEY, new Date().toISOString());
  return r.json();
}
function offlineBar() {
  const at = localStorage.getItem(SYNC_KEY);
  const when = at ? new Date(at).toLocaleString("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;
  return `<div class="offline" role="status"><b>Нет сети</b><span>${when ? `Показаны данные, сохранённые ${esc(when)}. Изменения, внесённые лигой позже, здесь не видны.` : "Показаны сохранённые данные."}</span></div>`;
}
const getLeague = async () => (league ??= await loadJSON("data/league.json"));
const myTeamId = () => Number(localStorage.getItem(TEAM_KEY)) || league?.default_team_id || null;
// Данные команды: по умолчанию — команда игрока; любая команда дивизиона — по id.
async function getTeam(id) {
  await getLeague();
  id ??= myTeamId();
  if (!teamCache.has(id)) teamCache.set(id, await loadJSON(`data/t/${id}/team.json`));
  return teamCache.get(id);
}
// Протокол матча хранится «глазами» команды: us — эта команда, them — соперник.
async function getGame(id, fresh = false, teamId) {
  await getLeague();
  teamId ??= myTeamId();
  const key = `${teamId}:${id}`;
  if (fresh || !gameCache.has(key)) gameCache.set(key, await loadJSON(`data/t/${teamId}/games/${id}.json`, fresh));
  return gameCache.get(key);
}
const inLeague = (lp) => !!league?.teams.some((t) => t.roster.includes(lp));
const teamOfPlayer = (lp) => league?.teams.find((t) => t.roster.includes(lp))?.id;
async function getPlayer(id) {
  if (!playerCache.has(id)) playerCache.set(id, await loadJSON(`data/players/${id}.json`));
  return playerCache.get(id);
}
const me = () => Number(localStorage.getItem(ME_KEY)) || null;

// ---------- Утилиты ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fullName = (p) => `${p.first_name} ${p.last_name}`.trim();
const initials = (p) => `${(p.first_name || " ")[0]}${(p.last_name || " ")[0]}`.trim();
const fmt1 = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 }));
const fmtInt = (v) => (v == null ? "—" : Math.round(Number(v)).toLocaleString("ru-RU"));
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
const bg = (url) => (url ? `style="background-image:url('${esc(url)}')"` : "");

function dateParts(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
  const wd = d.toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "short" });
  const time = d.toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return { day, wd, time };
}
const POS = { point_guard: "Разыгрывающий", shooting_guard: "Атакующий защитник", small_forward: "Лёгкий форвард", power_forward: "Тяжёлый форвард", center: "Центровой" };
const EVENT = {
  one_point_made: "1 очко", free_throw_made: "Штрафной", two_point_made: "2 очка", three_point_made: "3 очка", four_point_made: "4 очка",
  personal_foul: "Фол", technical_foul: "Технический фол", unsportsmanlike_foul: "Неспортивный фол",
  disqualification_foul: "Дисквалифицирующий фол", flagrant_foul: "Флагрант-фол", timeout: "Тайм-аут", block: "Блок-шот", steal: "Перехват",
};
const PTS = { one_point_made: 1, free_throw_made: 1, two_point_made: 2, three_point_made: 3, four_point_made: 4 };
// Бейджи: ключи приходят из fetch_abl_data.py, тексты — здесь.
const BADGES = {
  triple_double: { g: "3×10", t: "Трипл-дабл", d: "10+ в трёх показателях за игру" },
  double_double: { g: "2×10", t: "Дабл-дабл", d: "10+ в двух показателях за игру" },
  pts30: { g: "30+", t: "30 очков", d: "30 и больше очков за игру" },
  pts20: { g: "20+", t: "20 очков", d: "20 и больше очков за игру" },
  sniper: { g: "3PT", t: "Снайпер", d: "4 и больше трёхочковых за игру" },
  boards: { g: "10ПБ", t: "Хозяин щита", d: "10 и больше подборов за игру" },
  dimes: { g: "10ПД", t: "Диспетчер", d: "10 и больше передач за игру" },
  mvp: { g: "MVP", t: "MVP матча", d: "Лучший игрок матча" },
  champion: { g: "1", t: "Чемпион", d: "" },
  since: { g: "", t: "В лиге с", d: "" },
};
const MILESTONE = { games: ["игр в ABL", "Ветеран"], pts: ["очков в ABL", "Бомбардир"] };
const LEAD_CATS = [["points", "Очки"], ["rebounds", "Подборы"], ["assists", "Передачи"], ["efficiency", "КПИ"], ["steals", "Перехваты"], ["blocks", "Блок-шоты"]];
function ranking(board, cat) {
  return board.players.filter((p) => p.games >= board.min_games).sort((a, b) => b[cat] - a[cat]);
}

const periodName = (n) => (n <= 4 ? `${n}-я четверть` : `Овертайм ${n - 4}`);

const icon = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v8h14v-8"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.6-2.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  ext: '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
};
const arcSVG = (cls = "arc") =>
  `<svg class="${cls}" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="180" fill="none" stroke="#ed1c24" stroke-width="5" stroke-dasharray="16 14" /></svg>`;

const top = (title, backHref) =>
  `<header class="top">${backHref ? `<a class="back" href="${backHref}" aria-label="Назад">${icon.back}</a>` : ""}<span class="title">${esc(title)}</span></header>`;

function result(g) {
  if (g.status !== "closed") return null;
  return g.us.score > g.them.score ? "w" : g.us.score < g.them.score ? "l" : "d";
}

// ---------- Экраны ----------
// «Это я»: игрок находит себя по фамилии во всех составах дивизиона, команды подтягиваются сами.
// Запасной путь — выбрать команду, затем себя в составе (#/pick).
function pickMe(lp, teamId) {
  localStorage.setItem(ME_KEY, String(lp));
  localStorage.setItem(TEAM_KEY, String(teamId));
  teamCache.clear(); gameCache.clear();
  location.hash = "#/games";
}
async function viewTeamPicker() {
  const L = await getLeague();
  $view.innerHTML = `
    <div class="onb">
      <div class="intro">${arcSVG()}
        <img class="logo-main" src="icons/main_logo.svg" alt="ABL — Amateur Basketball League" width="104" height="81">
        <h1>Твоя лига<br>в кармане</h1>
        <p class="lead">Игры, счёт, протоколы и статистика — всё, что раньше искали на сайте.</p>
      </div>
      <section class="section" style="padding-top:0"><div class="section-h"><h2>Это я</h2><span class="aside">дивизион ${esc(L.division.name)}</span></div>
        <p class="screen-sub" style="padding:0">Найдите себя по фамилии — приложение покажет игры всех ваших команд.</p></section>
      <div class="search"><input id="q" type="search" placeholder="Фамилия" autocomplete="off" aria-label="Поиск себя по фамилии"></div>
      <div class="section" style="padding-top:8px"><div class="list" id="found"></div></div>
      <section class="section"><div class="section-h"><h2>Или выберите команду</h2></div>
        <div class="list">${L.teams.map((t) => `
          <a class="row" href="#/pick/${t.id}"><span class="logo sm" ${bg(t.logo)}></span>
            <span class="main"><span class="t">${esc(t.name)}</span><span class="s">${t.roster.length} ${plural(t.roster.length, "игрок", "игрока", "игроков")}</span></span>${icon.chev}</a>`).join("")}</div></section>
      <p class="updated">В рабочей версии — вход через Telegram, аккаунт MTGame не нужен.</p>
    </div>`;
  const $found = document.getElementById("found");
  let people = null; // составы всех команд дивизиона, грузятся при первом вводе
  document.getElementById("q").addEventListener("input", async (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (q.length < 2) return ($found.innerHTML = "");
    people ??= (await Promise.all(L.teams.map((t) => getTeam(t.id).catch(() => null)))).filter(Boolean)
      .flatMap((t) => t.roster.map((p) => ({ ...p, team: t.team })));
    if (e.target.value.trim().toLowerCase() !== q) return; // пока грузили, запрос изменился
    const hits = people.filter((p) => fullName(p).toLowerCase().includes(q)).slice(0, 20);
    $found.innerHTML = hits.map((p) => `
      <button class="row" data-me="${p.league_player_id}:${p.team.id}" style="width:100%;text-align:left">
        <span class="avatar sm" ${bg(p.photo)}>${p.photo ? "" : esc(initials(p))}</span>
        <span class="main"><span class="t">${esc(fullName(p))}</span><span class="s">${esc(p.team.name)}${p.number != null ? `, № ${esc(p.number)}` : ""}</span></span>
        <span class="s">Это я</span></button>`).join("") || `<p class="empty" style="padding:16px 0">Никого не нашли. Проверьте написание или выберите команду ниже.</p>`;
  });
  // Подтверждение защищает от случайного нажатия на однофамильца (ia/wireframes/findme.md → Confirm).
  $found.addEventListener("click", (e) => {
    const b = e.target.closest("[data-me]");
    if (!b) return;
    const [lp, tid] = b.dataset.me.split(":").map(Number);
    const p = people.find((x) => x.league_player_id === lp && x.team.id === tid);
    openSheet(`<h3>Это вы?</h3>
      <p class="rsvp-game">${esc(fullName(p))}${p.number != null ? `, № ${esc(p.number)}` : ""}<br>${esc(p.team.name)}</p>
      <p>Добавим в избранное вас и ваши команды. Если вы играете ещё где-то под другой записью, отметьте её позже: «Это моя вторая запись» на странице игрока.</p>
      <div class="btn-row" style="padding:20px 0 0"><button class="btn primary" data-act="ok">Да, это я</button><button class="btn ghost" data-close>Нет, другой игрок</button></div>`,
      (act) => { if (act === "ok") pickMe(lp, tid); });
  });
}

async function viewOnboarding(teamId) {
  const t = await getTeam(teamId);
  const render = (q = "") => {
    const list = t.roster.filter((p) => fullName(p).toLowerCase().includes(q.toLowerCase()));
    return list.map((p) => `
      <button class="row" data-pick="${p.league_player_id}" style="width:100%;text-align:left">
        <span class="avatar sm" ${bg(p.photo)}>${p.photo ? "" : esc(initials(p))}</span>
        <span class="main"><span class="t">${esc(fullName(p))}</span><span class="s">${p.number != null ? "№ " + esc(p.number) : "Без номера"}${p.captain ? " · капитан" : ""}</span></span>
        ${icon.chev}
      </button>`).join("") || `<p class="empty">Никого не нашли. Проверьте написание фамилии.</p>`;
  };
  $view.innerHTML = `
    <div class="onb">
      ${top("Выбор игрока", "#/")}
      <div class="team-pick"><span class="logo sm" ${bg(t.team.logo)}></span>
        <span class="main"><span class="t">${esc(t.team.name)}</span><span class="s">${esc(t.tournaments.map((x) => x.name).join(", "))}</span></span></div>
      <div class="search"><input id="q" type="search" placeholder="Найдите себя в составе" autocomplete="off" aria-label="Поиск игрока"></div>
      <div class="section" style="padding-top:8px"><div class="list" id="roster">${render()}</div></div>
      <p class="updated">В рабочей версии — вход через Telegram, аккаунт MTGame не нужен.</p>
    </div>`;
  const $list = document.getElementById("roster");
  document.getElementById("q").addEventListener("input", (e) => ($list.innerHTML = render(e.target.value)));
  $list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) pickMe(Number(b.dataset.pick), t.team.id);
  });
}

// ---------- Избранное ----------
// «Следить» за любой командой или игроком. Игры команд из избранного попадают в «Мои игры»
// (в рабочей версии — и уведомления по ним). Хранится на устройстве.
const FOLLOW_KEY = "abl.follow";
const follows = () => ({ t: [], p: [], ...JSON.parse(localStorage.getItem(FOLLOW_KEY) || "{}") });
function toggleFollow(kind, id) {
  const f = follows();
  f[kind] = f[kind].includes(id) ? f[kind].filter((x) => x !== id) : [...f[kind], id];
  localStorage.setItem(FOLLOW_KEY, JSON.stringify(f));
}
const followBtn = (kind, id, note) => {
  const on = follows()[kind].includes(id);
  return `<div class="btn-row"><button class="btn ghost" data-follow="${kind}:${id}" aria-pressed="${on}">${on ? `${icon.check}Вы следите` : "Следить"}</button>
    <p class="follow-note">${on ? "Нажмите, чтобы убрать из избранного." : note}</p></div>`;
};
function bindFollow(rerender) {
  $view.querySelectorAll("[data-follow]").forEach((b) => b.addEventListener("click", () => {
    const [k, id] = b.dataset.follow.split(":");
    toggleFollow(k, Number(id));
    const y = window.scrollY; rerender().then(() => window.scrollTo(0, y));
  }));
}

// ---------- Мои команды ----------
// Игрок может быть заявлен в нескольких командах (по данным лиги — каждый пятый в дивизионе).
// Список берётся из заявок MTGame (players/<id>.json → teams); команду можно убрать: «Я здесь больше не играю».
const LEFT_KEY = "abl.left";
const leftTeams = () => JSON.parse(localStorage.getItem(LEFT_KEY) || "[]");
const teamMeta = (id) => league?.teams.find((t) => t.id === id) || league?.extra_teams?.find((t) => t.id === id) || null;
// «Это тоже я»: если капитан другой команды завёл игрока отдельной записью («пустышкой»), игрок привязывает её.
// В демо команды этой записи попадают в «Мои игры»; статистику в рабочей версии сложит сервер.
const ALSO_KEY = "abl.alsome";
const alsoMe = () => JSON.parse(localStorage.getItem(ALSO_KEY) || "[]");
const isMine = (lp) => lp === me() || alsoMe().includes(lp);
async function myTeamsAll() {
  const ids = [];
  for (const lp of [me(), ...alsoMe()]) {
    try { for (const i of (await getPlayer(lp)).teams || []) if (teamMeta(i) && !ids.includes(i)) ids.push(i); } catch {}
    const t = teamOfPlayer(lp);
    if (t && !ids.includes(t)) ids.push(t);
  }
  if (myTeamId() && !ids.includes(myTeamId())) ids.unshift(myTeamId());
  return ids;
}
async function myTeams() {
  const left = leftTeams();
  const ids = (await myTeamsAll()).filter((i) => !left.includes(i));
  return ids.length ? ids : [myTeamId()];
}
const gameHref = (g) => (g._t.team.id === myTeamId() ? `#/game/${g.id}` : `#/g/${g._t.team.id}/${g.id}`);
// Разбор соперника есть только у основной команды.
const opponentHref = (g) => (g._t.team.id === myTeamId() && !g._t.light ? `#/opponent/${g.them.id}` : null);

// Две игры разных команд впритык: меньше 2 часов между началом, или меньше 4 часов в разных залах.
function clashes(games) {
  const dated = games.filter((g) => g.datetime && g.status !== "closed");
  const out = [];
  for (let i = 0; i < dated.length; i++) for (let j = i + 1; j < dated.length; j++) {
    const [a, b] = [dated[i], dated[j]].sort((x, y) => x.datetime.localeCompare(y.datetime));
    if (a._t.team.id === b._t.team.id) continue;
    const gap = (new Date(b.datetime) - new Date(a.datetime)) / 36e5;
    const va = a.venue || a.venue_expected, vb = b.venue || b.venue_expected;
    if (gap < 2 || (gap < 4 && va !== vb)) out.push({ a, b, gap, sameVenue: va === vb });
  }
  return out;
}
function clashBlock(list) {
  return list.map(({ a, b, gap, sameVenue }) => {
    const da = dateParts(a.datetime), db = dateParts(b.datetime);
    const h = fmt1(Math.round(gap * 10) / 10);
    const where = (g) => `${esc(g._t.team.name)}, ${esc(g.venue || g.venue_expected || "зал уточняется")}`;
    return `<div class="clash" role="note"><b>Две игры ${esc(da.day)}${da.day !== db.day ? ` и ${esc(db.day)}` : ""}</b>
      <span>${esc(da.time)} — ${where(a)}<br>${esc(db.time)} — ${where(b)}</span>
      <span class="why">${gap < 2 ? `Между началом игр ${h} ч — игры могут пересечься.` : `Между началом игр ${h} ч, а залы разные — проверь, успеешь ли доехать.`}${sameVenue && gap < 2 ? " Предупреди капитанов обеих команд." : ""}</span></div>`;
  }).join("");
}

async function teamsSheet(all, active) {
  const fav = follows();
  const favPlayers = (await Promise.all(fav.p.map((id) => getPlayer(id).catch(() => null)))).filter(Boolean);
  const favRow = (kind, id, logo, avatar, title, sub) => `<div class="row"><span class="${kind === "t" ? "logo" : "avatar"} sm" ${bg(logo)}>${avatar}</span>
      <span class="main"><span class="t">${esc(title)}</span><span class="s">${esc(sub)}</span></span>
      <button class="link" data-act="unf:${kind}:${id}">Не следить</button></div>`;
  const following = fav.t.map((id) => { const m = teamMeta(id); return m ? favRow("t", id, m.logo, "", m.name, m.tournament || "") : ""; }).join("")
    + favPlayers.map((p) => favRow("p", p.league_player_id, p.photo, p.photo ? "" : esc(initials(p)), fullName(p), teamMeta(teamOfPlayer(p.league_player_id))?.name || "Игрок ABL")).join("");
  const row = (id) => {
    const m = teamMeta(id), on = active.includes(id);
    return `<div class="row ${on ? "" : "off"}"><span class="logo sm" ${bg(m?.logo)}></span>
      <span class="main"><span class="t">${esc(m?.name || "Команда")}</span><span class="s">${esc(m?.tournament || "")}${on ? "" : ", скрыта"}</span></span>
      <button class="link" data-act="${on ? "leave" : "back"}:${id}">${on ? "Я здесь больше не играю" : "Вернуть"}</button></div>`;
  };
  openSheet(`<h3>Избранное</h3>
    <p class="opt-h">Мои команды</p>
    <p>Из твоих заявок в MTGame на этот сезон. Их игры — в одном списке и в одном календаре.</p>
    <div class="list team-list">${all.map(row).join("")}</div>
    <p class="hint">Нет нужной команды? Её добавит капитан в заявке MTGame. Если капитан завёл тебя отдельной записью — открой её и нажми «Это моя вторая запись».</p>
    <p class="opt-h" style="margin-top:20px">Слежу</p>
    ${following ? `<div class="list team-list">${following}</div>` : `<p class="hint">Пока ни за кем. Кнопка «Следить» — на странице команды и игрока.</p>`}
    <div class="btn-row" style="padding:16px 0 0"><button class="btn ghost" data-close>Готово</button></div>`,
    (act) => {
      if (act.startsWith("unf:")) {
        const [, k, raw2] = act.split(":");
        toggleFollow(k, Number(raw2));
        return viewGames().then(async () => teamsSheet(await myTeamsAll(), await myTeams()));
      }
      const [kind, raw] = act.split(":"), id = Number(raw);
      let left = leftTeams().filter((x) => x !== id);
      if (kind === "leave") {
        if (active.length <= 1) return viewGames(); // хотя бы одна команда остаётся
        left.push(id);
        if (id === myTeamId()) localStorage.setItem(TEAM_KEY, String(active.find((x) => x !== id)));
      }
      localStorage.setItem(LEFT_KEY, JSON.stringify(left));
      viewGames().then(async () => teamsSheet(await myTeamsAll(), await myTeams()));
    });
}

// Быстрый переход к командам и игрокам из избранного.
async function favoritesBlock(fav, favTeams) {
  const teamRow = (id) => {
    const t = favTeams.find((x) => x.team.id === id), m = teamMeta(id);
    if (!t && !m) return "";
    const n = t?.games.find((g) => g.status !== "closed");
    const when = n?.datetime ? dateParts(n.datetime) : null;
    // Карточка ленты (FavoriteTile в Figma, 67:1290): знак, название, ближайшая игра.
    return `<a class="fav-tile" href="#/team/${id}"><span class="logo sm" ${bg(t?.team.logo || m?.logo)}></span>
      <span class="t">${esc(t?.team.name || m.name)}</span>
      <span class="s">${n ? (when ? `${esc(when.wd)}, ${esc(when.time)}` : "дата уточняется") : "игр нет"}</span></a>`;
  };
  const players = (await Promise.all(fav.p.map((id) => getPlayer(id).catch(() => null)))).filter(Boolean);
  const playerRow = (p) => `<a class="fav-tile" href="#/player/${p.league_player_id}"><span class="avatar sm" ${bg(p.photo)}>${p.photo ? "" : esc(initials(p))}</span>
    <span class="t">${esc(fullName(p))}</span><span class="s">${esc(teamMeta(teamOfPlayer(p.league_player_id))?.name || "Игрок ABL")}</span></a>`;
  const rows = fav.t.map(teamRow).join("") + players.map(playerRow).join("");
  return `<section class="section"><div class="section-h"><h2>Избранное</h2>${rows ? `<button class="link" id="fav-edit">Изменить</button>` : ""}</div>
    ${rows ? `<div class="fav-strip">${rows}</div>` : `<p class="follow-note" style="margin:0">Следите за соперниками, друзьями или командой ребёнка: кнопка «Следить» — на странице команды и игрока. <a class="link" href="#/team">Найти команду</a></p>`}</section>`;
}

async function viewGames() {
  const all = await myTeamsAll();
  const ids = await myTeams();
  const fav = follows();
  // Команды из избранного, за которые игрок не играет: их игры тоже в списке, с подписью команды.
  const favIds = fav.t.filter((id) => !ids.includes(id));
  const load = (list) => Promise.all(list.map((id) => getTeam(id).catch(() => null))).then((x) => x.filter(Boolean));
  const [teams, favTeams] = await Promise.all([load(ids), load(favIds)]);
  const multi = teams.length + favTeams.length > 1;
  // Общий список игр всех команд; игра двух своих команд друг с другом — один раз. Свои команды — первыми.
  const seen = new Set(), games = [];
  for (const t of [...teams, ...favTeams]) for (const g of t.games) if (!seen.has(g.id)) { seen.add(g.id); games.push({ ...g, _t: t, _own: teams.includes(t) }); }
  const byTime = (a, b) => (a.datetime == null) - (b.datetime == null) || (a.datetime || "").localeCompare(b.datetime || "") || (a.tour || 0) - (b.tour || 0);
  const upcoming = games.filter((g) => g.status !== "closed").sort(byTime);
  const played = games.filter((g) => g.status === "closed").sort(byTime).reverse();
  const ownPlayed = played.filter((g) => g._own);
  // Ближайшая игра, форма, отметка и накладки — только по своим командам.
  const next = upcoming.find((g) => g._own && g.status === "in_progress") || upcoming.find((g) => g._own);
  const teamTag = (g) => (multi ? `${esc(g._t.team.name)}, ` : "");

  const nextBlock = next ? (() => {
    const when = next.datetime ? dateParts(next.datetime) : null;
    const live = next.status === "in_progress";
    const href = live ? gameHref(next) : opponentHref(next);
    const tag = href ? "a" : "div";
    return `
      <${tag} class="next" ${href ? `href="${href}"` : ""}>
        ${live ? `<span class="live">Идёт матч</span>` : ""}
        <div class="when ${when ? "" : "tbd"}">${when ? `${esc(when.day)}, ${esc(when.time)}` : `Тур ${esc(next.tour)} — дата уточняется`}</div>
        <div class="meta">${teamTag(next)}${esc(next.tournament_name)}${next.venue ? `, ${esc(next.venue)}` : ""}${when ? `, ${esc(when.wd)}` : ""}</div>
        <div class="vs">
          <div class="team"><span class="logo" ${bg(next.us.logo)}></span>${esc(next.us.name)}</div>
          <div class="x">VS</div>
          <div class="team"><span class="logo" ${bg(next.them.logo)}></span>${esc(next.them.name)}</div>
        </div>
      </${tag}>
      ${kitBlock(next)}
      ${venueBlock(next)}
      ${rsvpBlock(next._t, next)}`;
  })() : `<p class="empty">Ближайших игр нет. Расписание появится, когда лига его опубликует.</p>`;

  const gameRow = (g) => {
    const r = result(g);
    const when = g.datetime ? dateParts(g.datetime) : null;
    return `
      <a class="row" href="${gameHref(g)}">
        <span class="wl ${r}">${r === "w" ? "W" : r === "l" ? "L" : "D"}</span>
        <span class="logo sm" ${bg(g.them.logo)}></span>
        <span class="main"><span class="t">${esc(g.them.name)}</span>
          <span class="s">${when ? esc(when.day) : ""}, ${teamTag(g)}${esc(g.tournament_name)}${g.tour ? `, тур ${esc(g.tour)}` : ""}</span></span>
        <span class="res ${r}">${g.us.score}:${g.them.score}</span>${icon.chev}
      </a>`;
  };
  const futureRow = (g) => {
    const href = opponentHref(g), tag = href ? "a" : "div";
    return `
      <${tag} class="row" ${href ? `href="${href}"` : ""}>
        <span class="wl"></span><span class="logo sm" ${bg(g.them.logo)}></span>
        <span class="main"><span class="t">${esc(g.them.name)}</span>
          <span class="s">${g.datetime ? `${esc(dateParts(g.datetime).day)}, ${esc(dateParts(g.datetime).time)}` : "Дата уточняется"}, ${teamTag(g)}${esc(g.tournament_name)}, тур ${esc(g.tour)}</span></span>
        <span class="s">${g.home ? "Дома" : "В гостях"}</span>${href ? icon.chev : `<span class="chev-pad"></span>`}
      </${tag}>`;
  };

  const rest = upcoming.filter((g) => g !== next);
  const others = teams.length - 1;
  const updated = teams.map((t) => t.generated_at).filter(Boolean).sort().pop();
  const favBlock = await favoritesBlock(fav, favTeams);
  $view.innerHTML = `
    <h1 class="screen-title">Мои игры</h1>
    <p class="screen-sub">${esc(teams[0].team.name)}${others ? ` и ещё ${others} ${plural(others, "команда", "команды", "команд")}` : ""}${all.length > 1 || leftTeams().length ? ` <button class="link inline" id="my-teams">${multi ? "мои команды" : "ещё команды"}</button>` : ""}</p>
    ${clashBlock(clashes(games.filter((g) => g._own)))}
    ${nextBlock}
    ${await wrapBanner()}
    ${favBlock}
    <section class="section"><div class="section-h"><h2>Результаты</h2><span class="aside">${favTeams.length ? "мои: " : ""}${ownPlayed.filter((g) => result(g) === "w").length}–${ownPlayed.filter((g) => result(g) === "l").length}</span></div>
      <div class="list" id="res">${played.slice(0, 10).map(gameRow).join("") || `<p class="empty">В этом сезоне игр ещё не было.</p>`}</div>
      ${played.length > 10 ? `<button class="more" id="more-res">Показать все результаты</button>` : ""}</section>
    ${rest.length ? `<section class="section"><div class="section-h"><h2>Календарь</h2><span class="aside">${rest.length} ${plural(rest.length, "игра", "игры", "игр")}</span></div>
      <div class="list" id="cal">${rest.slice(0, 4).map(futureRow).join("")}</div>
      ${rest.length > 4 ? `<button class="more" id="more">Показать все игры</button>` : ""}</section>` : ""}
    <div class="btn-row"><button class="btn ghost" id="cal-sub">${icon.cal}Добавить игры в календарь</button></div>
    <p class="updated">Данные MTGame обновлены ${esc(new Date(updated).toLocaleString("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))}</p>`;
  document.getElementById("cal-sub").addEventListener("click", calendarSheet);
  document.getElementById("my-teams")?.addEventListener("click", async () => teamsSheet(all, ids));
  document.getElementById("fav-edit")?.addEventListener("click", async () => teamsSheet(all, ids));
  document.getElementById("more")?.addEventListener("click", (e) => {
    document.getElementById("cal").innerHTML = rest.map(futureRow).join("");
    e.currentTarget.remove();
  });
  document.getElementById("more-res")?.addEventListener("click", (e) => {
    document.getElementById("res").innerHTML = played.map(gameRow).join("");
    e.currentTarget.remove();
  });
}

let liveTimer = null;
async function viewGame(id, tab = "box", fresh = false, teamId = null) {
  const d = await getGame(id, fresh, teamId ?? undefined);
  const mineTeam = !teamId || teamId === myTeamId();
  const g = d.game;
  const r = result(g);
  const live = g.status === "in_progress";
  const myId = me();
  const when = g.datetime ? dateParts(g.datetime) : null;

  const periodsTable = g.periods.length ? `
    <table class="periods" aria-label="Счёт по четвертям">
      <thead><tr><th>Команда</th>${g.periods.map((_, i) => `<th>${i < 4 ? i + 1 : "ОТ" + (i - 3)}</th>`).join("")}<th>И</th></tr></thead>
      <tbody>
        ${["us", "them"].map((side, k) => `<tr><td>${esc(g[side].name)}</td>${g.periods.map((p) => `<td class="num ${p[k] > p[1 - k] ? "won" : "lost"}">${p[k]}</td>`).join("")}<td class="num won">${g[side].score}</td></tr>`).join("")}
      </tbody></table>` : "";

  const boxTable = (side) => `
    <div class="box-wrap"><table class="box">
      <thead><tr><th>Игрок</th><th>О</th><th>ПБ</th><th>ПД</th><th>ПХ</th><th>БШ</th><th>ПТ</th><th>Ф</th><th>2-очк</th><th>3-очк</th><th>ШТ</th><th>+/−</th><th>КПИ</th></tr></thead>
      <tbody>${d.box[side].map((p) => `
        <tr class="${p.league_player_id === myId ? "me" : ""}">
          <td><span class="n">${esc(p.number ?? "")}</span>${inLeague(p.league_player_id) ? `<a href="#/player/${p.league_player_id}">${esc(p.last_name)} ${esc((p.first_name || "")[0] || "")}.</a>` : `${esc(p.last_name)} ${esc((p.first_name || "")[0] || "")}.`}${p.mvp ? '<span class="mvp">MVP</span>' : ""}</td>
          <td class="pts">${p.points}</td><td>${p.rebounds}</td><td>${p.assists}</td><td>${p.steals}</td><td>${p.blocks}</td><td>${p.turnovers}</td><td>${p.fouls}</td>
          <td>${p.fg2[0]}/${p.fg2[1]}</td><td>${p.fg3[0]}/${p.fg3[1]}</td><td>${p.ft[0]}/${p.ft[1]}</td><td>${p.plus_minus ?? "—"}</td><td>${p.efficiency ?? "—"}</td>
        </tr>`).join("")}</tbody></table></div>`;

  const events = () => {
    let out = "", cur = null;
    for (const e of [...d.events].reverse()) {
      if (e.period !== cur) { cur = e.period; out += `<div class="period-h">${periodName(cur)}</div>`; }
      const pts = PTS[e.type];
      const mm = String(Math.floor((e.time || 0) / 60)).padStart(2, "0"), ss = String((e.time || 0) % 60).padStart(2, "0");
      out += `<div class="ev ${e.side} ${pts ? "pts" : ""} ${pts === 3 ? "pts3" : ""}">
        <span class="tm">${mm}:${ss}</span>
        <span class="what"><b>${esc(EVENT[e.type] || e.type)}</b><br><span>${e.player ? `${esc(e.number ?? "")} ${esc(e.player)}` : esc(g[e.side].name)}</span></span>
        <span class="sc">${e.score[0]}:${e.score[1]}</span></div>`;
    }
    return out || `<p class="empty">Секретарь ещё не внёс события этой игры.</p>`;
  };

  const tabs = { box: `Протокол`, them: g.them.name, log: "Ход игры" };
  $view.innerHTML = `
    ${top(`${g.tournament_name}${g.tour ? `, тур ${g.tour}` : ""}`, mineTeam ? "#/games" : `#/team/${teamId}`)}
    <section class="board"><svg class="arc" viewBox="0 0 360 84" aria-hidden="true"><path d="M8 6 A250 250 0 0 0 352 6" fill="none" stroke="#ed1c24" stroke-width="6" stroke-dasharray="15 12"/></svg>
      <p class="label">${live ? `<span class="live">Live</span>` : when ? `${esc(when.day)}, ${esc(when.time)}${g.venue ? `, <a class="maplink" href="${mapLink(g.address || g.venue)}" target="_blank" rel="noopener">${esc(g.venue)}</a>` : ""}` : ""}</p>
      <div class="teams">
        <div class="side"><span class="logo" ${bg(g.us.logo)}></span>${esc(g.us.name)}</div>
        <div class="score num"><span class="${r === "l" ? "lose" : ""}">${g.us.score}</span><span class="sep">:</span><span class="${r === "w" ? "lose" : ""}">${g.them.score}</span></div>
        <div class="side"><span class="logo" ${bg(g.them.logo)}></span>${esc(g.them.name)}</div>
      </div>
      ${r ? `<p class="verdict">${r === "w" ? "Победа" : r === "l" ? "Поражение" : "Ничья"}</p>` : ""}
    </section>
    <section class="section" style="padding-top:0">${periodsTable}</section>
    ${g.status !== "open" ? leadChart(d) : ""}
    ${d.video || g.status === "closed" ? `<div class="btn-row">
      ${d.video ? `<a class="btn ghost" href="${esc(d.video)}" target="_blank" rel="noopener">${icon.play}${live ? "Смотреть прямой эфир" : "Смотреть трансляцию"}</a>` : ""}
      ${g.status === "closed" ? `<button class="btn ghost" id="share">${icon.share}Поделиться итогом</button>` : ""}</div>` : ""}
    <div class="seg" role="group" aria-label="Данные матча">${Object.entries(tabs).map(([k, v]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${esc(k === "box" ? g.us.name : v)}</button>`).join("")}</div>
    <section class="section" style="padding-top:16px">${tab === "log" ? events() : boxTable(tab === "them" ? "them" : "us")}</section>`;

  $view.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => viewGame(id, b.dataset.tab, false, teamId)));
  document.getElementById("share")?.addEventListener("click", () => shareStory(d));
  bindLeadChart(d);

  clearInterval(liveTimer);
  const here = location.hash;
  if (live) liveTimer = setInterval(() => { if (location.hash === here) viewGame(id, tab, true, teamId); else clearInterval(liveTimer); }, 30000);
}

async function viewTeam(teamId = null, tIdx = 0, cat = "points") {
  const t = await getTeam(teamId ?? undefined);
  const mine = t.team.id === myTeamId();
  const own = (await myTeams()).includes(t.team.id);
  const my = await getTeam();
  const st = t.standings[Math.min(tIdx, t.standings.length - 1)];
  const played = t.games.filter((g) => g.status === "closed").reverse();
  $view.innerHTML = `
    ${mine ? "" : top("Команда", "#/team")}
    <div class="hero" style="padding-top:${mine ? "20px" : "4px"}"><span class="logo lg" ${bg(t.team.logo)}></span>
      <div><h1>${esc(t.team.name)}</h1><p class="s">${esc(t.tournaments[0].season || "")}${own ? ", моя команда" : ""}</p></div></div>
    ${own ? "" : followBtn("t", t.team.id, "Игры команды появятся в «Моих играх».")}
    ${!mine && my.opponents[t.team.id] ? `<div class="btn-row"><a class="btn ghost" href="#/opponent/${t.team.id}">Разбор соперника перед игрой с ${esc(my.team.name)}</a></div>` : ""}
    <section class="section"><div class="section-h"><h2>Таблица</h2></div>
      <div class="chips" style="padding:0;margin-bottom:12px">${t.standings.map((s, i) => `<button class="chip" data-t="${i}" aria-pressed="${i === tIdx}">${esc(s.name)}</button>`).join("")}</div>
      <table class="periods" aria-label="Турнирная таблица">
        <thead><tr><th>#&nbsp; Команда</th><th>И</th><th>В</th><th>П</th><th>+/−</th><th>О</th></tr></thead>
        <tbody>${st.rows.map((row, i) => `<tr ${row.team_id === t.team.id ? 'style="background:#1d1d1d"' : ""} ${league.teams.some((x) => x.id === row.team_id) && row.team_id !== t.team.id ? `data-team="${row.team_id}" class="link"` : ""}>
          <td><span class="n num" style="color:var(--muted);display:inline-block;width:22px">${i + 1}</span>${esc(row.name)}</td>
          <td>${row.games}</td><td>${row.won}</td><td>${row.lost}</td><td>${row.plus_minus > 0 ? "+" : ""}${row.plus_minus}</td><td class="num won">${row.points}</td></tr>`).join("")}</tbody>
      </table></section>
    <section class="section"><div class="section-h"><h2>Лидеры ${esc(st.name)}</h2></div>${leadersBlock(t, tIdx, cat)}</section>
    ${mine ? "" : `<section class="section"><div class="section-h"><h2>Результаты</h2><span class="aside">${played.filter((g) => result(g) === "w").length}–${played.filter((g) => result(g) === "l").length}</span></div>
      <div class="list">${played.slice(0, 6).map((g) => `<a class="row" href="#/g/${t.team.id}/${g.id}">
        <span class="wl ${result(g)}">${result(g) === "w" ? "W" : "L"}</span><span class="logo sm" ${bg(g.them.logo)}></span>
        <span class="main"><span class="t">${esc(g.them.name)}</span><span class="s">${g.datetime ? esc(dateParts(g.datetime).day) : ""}, ${esc(g.tournament_name)}</span></span>
        <span class="res ${result(g)}">${g.us.score}:${g.them.score}</span>${icon.chev}</a>`).join("") || `<p class="empty">Команда ещё не играла в этом сезоне.</p>`}</div></section>`}
    <section class="section"><div class="section-h"><h2>Состав</h2><span class="aside">${t.roster.length} ${plural(t.roster.length, "игрок", "игрока", "игроков")}</span></div>
      <div class="list">${t.roster.map((p) => `
        <a class="row" href="#/player/${p.league_player_id}">
          <span class="num" style="width:28px;color:var(--muted);font-size:17px">${esc(p.number ?? "–")}</span>
          <span class="avatar sm" ${bg(p.photo)}>${p.photo ? "" : esc(initials(p))}</span>
          <span class="main"><span class="t">${esc(fullName(p))}${p.captain ? '<span class="cap">C</span>' : ""}</span><span class="s">${esc(POS[p.position] || "")}</span></span>${icon.chev}
        </a>`).join("")}</div></section>`;
  bindFollow(() => viewTeam(teamId, tIdx, cat));
  $view.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => viewTeam(teamId, Number(b.dataset.t), cat)));
  $view.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { const y = window.scrollY; viewTeam(teamId, tIdx, b.dataset.cat).then(() => window.scrollTo(0, y)); }));
  $view.querySelectorAll("tr[data-team]").forEach((tr) => tr.addEventListener("click", () => (location.hash = Number(tr.dataset.team) === myTeamId() ? "#/team" : `#/team/${tr.dataset.team}`)));
}

async function viewPlayer(id, isMe = false) {
  const p = await getPlayer(id);
  const c = p.career;
  $view.innerHTML = `
    ${isMe ? "" : top("Игрок", "#/team")}
    <div class="hero" ${isMe ? 'style="padding-top:20px"' : ""}>
      <span class="avatar" ${bg(p.photo)}>${p.photo ? "" : esc(initials(p))}</span>
      <div><h1>${esc(p.first_name)}<br>${esc(p.last_name)}</h1>
      <p class="s">${p.number != null ? `№ ${esc(p.number)}, ` : ""}${esc(POS[p.position] || "")}${p.captain ? ", капитан" : ""}</p></div>
    </div>
    ${isMe || isMine(id) ? "" : followBtn("p", id, "Игрок появится в избранном на экране «Мои игры».")}
    ${!isMe && id !== me() && alsoMe().includes(id) ? `<p class="follow-note" style="padding:0 var(--pad)">Это ваша вторая запись: её команды — в «Моих играх».</p>` : ""}
    ${isMe ? "" : (() => {
      // Команды игрока в этом сезоне (ia/wireframes/playerprofile.md → PlayerTeams): помогают понять, тот ли это человек.
      const ids = [...new Set([...(p.teams || []), teamOfPlayer(id)].filter((t) => t && teamMeta(t)))];
      return ids.length ? `<section class="section"><div class="section-h"><h2>Команды в этом сезоне</h2></div><div class="list">${ids.map((t) => { const m = teamMeta(t); return `<a class="row" href="#/team/${t}"><span class="logo sm" ${bg(m.logo)}></span><span class="main"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.tournament || "")}</span></span>${icon.chev}</a>`; }).join("")}</div></section>` : "";
    })()}
    <div class="big3">
      <div><div class="v">${fmt1(c.ppg)}</div><div class="k">очков за игру</div></div>
      <div><div class="v">${fmt1(c.rpg)}</div><div class="k">подборов</div></div>
      <div><div class="v">${fmt1(c.apg)}</div><div class="k">передач</div></div>
    </div>
    <section class="section"><div class="section-h"><h2>Карьера в ABL</h2></div>
      <div class="facts">
        <div><div class="v">${fmtInt(c.games)}</div><div class="k">игр сыграно</div></div>
        <div><div class="v">${c.games ? Math.round((c.won / c.games) * 100) + "%" : "—"}</div><div class="k">побед</div></div>
        <div><div class="v">${fmtInt(c.points_total)}</div><div class="k">очков всего</div></div>
        <div><div class="v">${fmtInt(c.three_made_total)}</div><div class="k">трёхочковых</div></div>
      </div></section>
    ${await (async () => {
      // Допуск к плей-офф — для игроков команд дивизиона.
      const tid = teamOfPlayer(id);
      if (!tid) return "";
      const t = await getTeam(tid).catch(() => null);
      const rule = t && playoffRule(t);
      return rule ? admissionBlock(rule, admission(rule, gamesInDivision(p, rule.tid)), isMe ? "" : t.team.name) : "";
    })()}
    ${await placesBlock(p)}
    ${p.season_best ? (() => { const b = p.season_best; return `<section class="section"><div class="section-h"><h2>Лучший матч сезона</h2></div>
      <a class="best" href="#/game/${b.game_id}">
        <span class="best-main"><span class="v">${b.points}</span><span class="k">${plural(b.points, "очко", "очка", "очков")}</span></span>
        <span class="best-ctx"><span class="t">против ${esc(b.opponent)}</span><span class="s">${esc(dateParts(b.date).day)}</span></span>
        <span class="best-sub"><span><b>${b.rebounds}</b>${plural(b.rebounds, "подбор", "подбора", "подборов")}</span><span><b>${b.assists}</b>${plural(b.assists, "передача", "передачи", "передач")}</span></span>
        ${icon.chev}</a></section>`; })() : ""}
    <section class="section"><div class="section-h"><h2>Достижения</h2><span class="aside">сезон и карьера</span></div>${badgesBlock(p)}</section>
    ${goalsBlock(p)}
    ${shootingBlock(p, await getTeam())}
    <section class="section"><div class="section-h"><h2>По сезонам</h2><span class="aside">в среднем за игру</span></div>
      ${p.seasons.length ? `<div class="box-wrap"><table class="box">
        <thead><tr><th>Турнир</th><th>И</th><th>О</th><th>ПБ</th><th>ПД</th><th>КПИ</th></tr></thead>
        <tbody>${p.seasons.map((s) => `<tr><td><b>${esc(s.tournament || "—")}</b><br><span style="color:var(--muted);font-size:12px">${esc(s.season || "")}${s.team ? `, ${esc(s.team)}` : ""}</span></td>
          <td>${s.games ?? "—"}</td><td class="pts">${fmt1(s.points)}</td><td>${fmt1(s.rebounds)}</td><td>${fmt1(s.assists)}</td><td>${fmt1(s.efficiency)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty">Статистика появится после первой игры в лиге.</p>`}
    </section>
    ${p.wrapped ? `<div class="btn-row"><a class="btn ghost" href="#/wrapped/${p.league_player_id}">Итоги: ${esc(p.wrapped.season)}</a></div>` : ""}
    ${isMe ? mtgameAccountBlock(p) : ""}
    ${isMe ? `<div class="btn-row"><a class="btn ghost" href="#/rules">Правила лиги</a></div>` : ""}
    ${isMe ? `<div class="btn-row"><button class="btn ghost" id="switch">Сменить игрока</button></div>` : ""}
    ${!isMe && !isMine(id) ? `<div class="btn-row"><button class="btn ghost" id="also-me">Это моя вторая запись</button></div>` : ""}`;
  bindFollow(() => viewPlayer(id, isMe));
  if (isMe) bindMtgameAccess(p, teamMeta(teamOfPlayer(id))?.name);
  document.getElementById("also-me")?.addEventListener("click", () => {
    const team = teamMeta(teamOfPlayer(id))?.name;
    openSheet(`<h3>Объединить записи?</h3>
      <p class="rsvp-game">${esc(fullName(p))}${p.number != null ? `, № ${esc(p.number)}` : ""}${team ? `<br>${esc(team)}` : ""}</p>
      <p>Если капитан другой команды завёл вас отдельно, это ваша вторая запись. Её команды появятся в «Моих играх», статистика сложится. Навсегда склеить записи может MTGame — напишите в лигу.</p>
      <div class="btn-row" style="padding:20px 0 0"><button class="btn primary" data-act="ok">Объединить</button><button class="btn ghost" data-close>Отмена</button></div>`,
      (act) => {
        if (act !== "ok") return;
        localStorage.setItem(ALSO_KEY, JSON.stringify([...new Set([...alsoMe(), id])]));
        const f = follows(); f.p = f.p.filter((x) => x !== id); localStorage.setItem(FOLLOW_KEY, JSON.stringify(f));
        teamCache.clear();
        viewPlayer(id, isMe);
      });
  });
  document.getElementById("switch")?.addEventListener("click", () => { localStorage.removeItem(ME_KEY); localStorage.removeItem(TEAM_KEY); teamCache.clear(); gameCache.clear(); location.hash = "#/"; });
}

async function viewOpponent(id) {
  const t = await getTeam();
  const o = t.opponents[id];
  if (!o) throw new Error("нет данных о сопернике");
  const st = t.standings.find((s) => s.tournament_id === o.tournament_id);
  const pos = st ? st.rows.findIndex((r) => r.team_id === id) : -1;
  const row = pos >= 0 ? st.rows[pos] : null;
  const board = t.leaders.find((l) => l.tournament_id === o.tournament_id);
  const theirs = board ? board.players.filter((p) => p.team_id === id && p.games >= 1) : [];
  const best = (cat) => [...theirs].sort((a, b) => b[cat] - a[cat])[0];
  const won = o.h2h.filter((g) => g.score[0] > g.score[1]).length;
  const next = t.games.find((g) => g.status !== "closed" && g.them.id === id);
  const form = (sc) => (sc[0] > sc[1] ? "w" : "l");
  $view.innerHTML = `
    ${top("Разбор соперника", "#/games")}
    <div class="hero"><span class="logo lg" ${bg(o.logo)}></span>
      <div><h1>${esc(o.name)}</h1><p class="s">${next ? `Тур ${esc(next.tour)}, ${next.home ? "дома" : "в гостях"}` : esc(st?.name || "")}</p></div></div>
    ${row ? `<div class="big3">
      <div><div class="v">${pos + 1}</div><div class="k">место в ${esc(st.name)}</div></div>
      <div><div class="v">${row.won}–${row.lost}</div><div class="k">победы и поражения</div></div>
      <div><div class="v">${row.plus_minus > 0 ? "+" : ""}${row.plus_minus}</div><div class="k">разница очков</div></div></div>` : ""}
    ${league.teams.some((x) => x.id === id) ? `<div class="btn-row"><a class="btn ghost" href="#/team/${id}">Профиль команды: состав, игры, лидеры</a></div>` : ""}
    ${next ? `<section class="section" style="padding-top:20px"><div class="section-h"><h2>Следующая встреча</h2><span class="aside">${next.datetime ? esc(dateParts(next.datetime).day + ", " + dateParts(next.datetime).time) : "дата уточняется"}</span></div>${venueBlock(next, "0")}</section>` : ""}
    <section class="section"><div class="section-h"><h2>Личные встречи</h2><span class="aside">${o.h2h.length ? `${esc(t.team.name)} ${won}–${o.h2h.length - won}` : ""}</span></div>
      <div class="list">${o.h2h.length ? o.h2h.slice(0, 5).map((g) => `
        <div class="row">
          <span class="wl ${form(g.score)}">${form(g.score) === "w" ? "W" : "L"}</span>
          <span class="main"><span class="t">${esc(g.tournament)}</span><span class="s">${g.datetime ? esc(dateParts(g.datetime).day) + " " + new Date(g.datetime).getFullYear() : ""}</span></span>
          <span class="res ${form(g.score)}">${g.score[0]}:${g.score[1]}</span></div>`).join("") : `<p class="empty">Команды ещё не встречались.</p>`}</div></section>
    ${theirs.length ? `<section class="section"><div class="section-h"><h2>Кого держать</h2><span class="aside">в среднем за игру</span></div>
      <div class="facts">${[["points", "очков"], ["rebounds", "подборов"], ["assists", "передач"], ["threes", "трёхочковых"]].map(([k, label]) => {
        const p = best(k); return p ? `<div><div class="v">${fmt1(p[k])}</div><div class="k">${esc(label)}: ${esc(p.last_name)} ${esc((p.first_name || "")[0] || "")}.</div></div>` : "";
      }).join("")}</div></section>` : ""}
    <section class="section"><div class="section-h"><h2>Последние игры</h2></div>
      <div class="list">${o.recent.map((g) => `
        <div class="row"><span class="wl ${form(g.score)}">${form(g.score) === "w" ? "W" : "L"}</span>
          <span class="logo sm" ${bg(g.opponent_logo)}></span>
          <span class="main"><span class="t">${esc(g.opponent)}</span><span class="s">${g.datetime ? esc(dateParts(g.datetime).day) : ""}</span></span>
          <span class="res ${form(g.score)}">${g.score[0]}:${g.score[1]}</span></div>`).join("") || `<p class="empty">Соперник ещё не играл в этом турнире.</p>`}</div></section>`;
}

function leadersBlock(t, bIdx, cat) {
  const board = t.leaders[bIdx];
  const list = ranking(board, cat);
  const myId = me();
  const myPos = list.findIndex((p) => p.league_player_id === myId);
  const rowHtml = (p, i) => `
    <a class="row ${p.league_player_id === myId ? "mine" : ""}" ${inLeague(p.league_player_id) ? `href="#/player/${p.league_player_id}"` : ""}>
      <span class="num" style="width:28px;color:var(--muted)">${i + 1}</span>
      <span class="main"><span class="t">${esc(p.first_name)} ${esc(p.last_name)}</span><span class="s">${esc(p.team || "")}, ${p.games} ${plural(p.games, "игра", "игры", "игр")}</span></span>
      <span class="res">${fmt1(p[cat])}</span></a>`;
  return `
    <div class="chips" style="padding:0;margin-bottom:12px" id="lcats">${LEAD_CATS.map(([k, v]) => `<button class="chip" data-cat="${k}" aria-pressed="${k === cat}">${v}</button>`).join("")}</div>
    <div class="list">${list.slice(0, 5).map(rowHtml).join("")}${myPos >= 5 ? `<div class="gap">···</div>${rowHtml(list[myPos], myPos)}` : ""}</div>
    <p class="updated" style="padding:8px 0 0">В среднем за игру. В рейтинге игроки, сыгравшие не меньше ${board.min_games} ${plural(board.min_games, "игры", "игр", "игр")}.</p>`;
}

// Медаль достижения: круг с фирменной пунктирной дугой (Arc) и уровнем внутри.
// Призовые места (1, 2, 3) — красная медаль с белым пунктирным кольцом и цифрой места.
function medalSVG(glyph, gold = false) {
  const fs = glyph.length === 1 ? 28 : glyph.length === 2 ? 22 : glyph.length === 3 ? 18 : glyph.length === 4 ? 14.5 : 12; // текст помещается внутрь пунктирного кольца
  return `<svg class="medal" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="34" fill="${gold ? "#ed1c24" : "#1a1a1a"}" stroke="${gold ? "#ed1c24" : "#ffffff"}" stroke-width="2"/>
    <circle cx="36" cy="36" r="27.5" fill="none" stroke="${gold ? "#ffffff" : "#ed1c24"}" stroke-width="3" stroke-dasharray="5.5 4.5" transform="rotate(-90 36 36)" pathLength="100" />
    <text x="36" y="${36 + fs * 0.36}" text-anchor="middle" font-family="Tektur, sans-serif" font-weight="800" font-size="${fs}" fill="#fff">${esc(glyph)}</text></svg>`;
}

function badgeItems(p) {
  const items = [];
  const season = {};
  for (const b of p.badges.season) (season[b.key] ??= []).push(b);
  for (const [key, list] of Object.entries(season)) {
    const B = BADGES[key], last = list[0];
    items.push({ glyph: B.g, title: B.t, note: `${esc(last.opponent)}, ${esc(dateParts(last.date).day)}`, count: list.length, href: `#/game/${last.game_id}`, hint: B.d });
  }
  for (const b of p.badges.career) {
    if (b.key === "champion") items.push({ glyph: "1", title: `Чемпион ${b.tournament}`, note: esc(b.season || ""), gold: true });
    else if (b.key === "place2" || b.key === "place3") items.push({ glyph: String(b.place), title: `${b.place}-е место ${b.tournament}`, note: esc(b.season || ""), gold: true });
    else if (b.key === "since") {
      const n = new Date().getFullYear() - b.value;
      items.push({ glyph: String(b.value), title: `В лиге с ${b.value}`, note: `${n} ${plural(n, "сезон", "сезона", "сезонов")} в ABL` });
    } else {
      const kind = b.key.replace(/\d+/, ""), n = b.key.match(/\d+/)[0];
      items.push({ glyph: `${n}+`, title: MILESTONE[kind][1], note: `${fmtInt(b.value)} ${MILESTONE[kind][0]}` });
    }
  }
  return items;
}

function badgesBlock(p) {
  const items = badgeItems(p);
  if (!items.length) return `<p class="empty" style="padding:0">Достижения появятся после первых игр.</p>`;
  return `<div class="badges">${items.map((b) => {
    const inner = `<span class="medal-wrap">${medalSVG(b.glyph, b.gold)}${b.count > 1 ? `<span class="cnt">×${b.count}</span>` : ""}</span>
      <span class="bt">${esc(b.title)}</span><span class="bd">${b.note}</span>`;
    return b.href ? `<a class="badge" href="${b.href}" title="${esc(b.hint || "")}">${inner}</a>` : `<div class="badge">${inner}</div>`;
  }).join("")}</div>
  <p class="updated" style="padding:10px 0 0">Медали за игры — по протоколам этого сезона, под медалью — последний такой матч. Медали за карьеру — по всей истории в ABL.</p>`;
}

async function placesBlock(p) {
  const t = await getTeam();
  const out = [];
  for (const board of t.leaders) {
    for (const [cat, label] of LEAD_CATS.slice(0, 4)) {
      const list = ranking(board, cat);
      const i = list.findIndex((x) => x.league_player_id === p.league_player_id);
      if (i >= 0 && i < 20) out.push({ i, cat, label, board, v: list[i][cat], n: list.length });
    }
  }
  if (!out.length) return "";
  out.sort((a, b) => a.i / a.n - b.i / b.n);
  return `<section class="section"><div class="section-h"><h2>Место в рейтингах</h2><span class="aside">${esc((t.tournaments[0].season || "").replace(/^Сезон\s*/i, "сезон "))}</span></div>
    <div class="facts">${out.slice(0, 4).map((x) => `<div><div class="v">${x.i + 1}-й</div><div class="k">${esc(x.label.toLowerCase())} в ${esc(x.board.name)}, ${fmt1(x.v)} за игру</div></div>`).join("")}</div></section>`;
}

// ---------- График хода матча ----------
// Одна величина с полярностью — разница в счёте «мы минус соперник» по игровому времени.
// Выше нуля — команда игрока впереди (белым), ниже — соперник (серым), как в правиле «победитель белым».
const PERIOD_SEC = (n) => (n <= 4 ? 720 : 300);
function leadSeries(d) {
  const start = (n) => { let t = 0; for (let i = 1; i < n; i++) t += PERIOD_SEC(i); return t; };
  const pts = [{ t: 0, diff: 0, sc: [0, 0], e: null }];
  for (const e of d.events) {
    if (!PTS[e.type]) continue;
    pts.push({ t: start(e.period) + Math.min(e.time || 0, PERIOD_SEC(e.period)), diff: e.score[0] - e.score[1], sc: e.score, e });
  }
  const periods = Math.max(4, ...d.events.map((e) => e.period || 1));
  return { pts, total: start(periods + 1), periods, start };
}
function leadStats(pts) {
  let maxUs = 0, maxThem = 0, changes = 0, ties = 0, leader = 0;
  for (const p of pts.slice(1)) {
    maxUs = Math.max(maxUs, p.diff); maxThem = Math.min(maxThem, p.diff);
    const now = Math.sign(p.diff);
    if (now === 0) ties++;
    else { if (leader !== 0 && now !== leader) changes++; leader = now; }
  }
  return { maxUs, maxThem: -maxThem, changes, ties };
}
function leadChart(d) {
  const g = d.game;
  const { pts, total, periods, start } = leadSeries(d);
  if (pts.length < 3) return "";
  const W = 350, H = 150, padT = 14, padB = 22;
  const lim = Math.max(5, ...pts.map((p) => Math.abs(p.diff)));
  const X = (t) => (t / total) * W, Y = (v) => padT + ((lim - v) / (2 * lim)) * (H - padT - padB);
  let path = `M0 ${Y(0)}`;
  for (const p of pts.slice(1)) path += ` H${X(p.t).toFixed(1)} V${Y(p.diff).toFixed(1)}`;
  path += ` H${W}`;
  const area = `${path} V${Y(0)} H0 Z`;
  const st = leadStats(pts);
  const dividers = Array.from({ length: periods - 1 }, (_, i) => X(start(i + 2)));
  const labels = Array.from({ length: periods }, (_, i) => ({ x: (X(start(i + 1)) + X(start(i + 2))) / 2, t: i < 4 ? `${i + 1}-я` : `ОТ${i - 3}` }));
  return `<section class="section"><div class="section-h"><h2>Ход матча</h2><span class="aside">разница в счёте</span></div>
    <div class="lead" data-total="${total}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="График разницы в счёте по ходу матча. Наибольший отрыв ${esc(g.us.name)}: ${st.maxUs}, ${esc(g.them.name)}: ${st.maxThem}.">
        <defs><clipPath id="cu"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath><clipPath id="ct"><rect x="0" y="${Y(0)}" width="${W}" height="${H - Y(0)}"/></clipPath></defs>
        ${dividers.map((x) => `<line x1="${x}" x2="${x}" y1="${padT}" y2="${H - padB}" class="div"/>`).join("")}
        <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/>
        <path d="${area}" class="a-us" clip-path="url(#cu)"/><path d="${area}" class="a-them" clip-path="url(#ct)"/>
        <path d="${path}" class="l-us" clip-path="url(#cu)"/><path d="${path}" class="l-them" clip-path="url(#ct)"/>
        <line class="cross" y1="${padT}" y2="${H - padB}" x1="-10" x2="-10"/>
        ${labels.map((l) => `<text x="${l.x}" y="${H - 6}" class="pl">${l.t}</text>`).join("")}
      </svg>
      <span class="lead-side us">${esc(g.us.name)} впереди</span><span class="lead-side them">${esc(g.them.name)} впереди</span>
      <div class="tip" hidden></div>
    </div>
    <div class="facts" style="margin-top:12px">
      <div><div class="v">+${st.maxUs}</div><div class="k">наибольший отрыв ${esc(g.us.name)}</div></div>
      <div><div class="v">+${st.maxThem}</div><div class="k">наибольший отрыв ${esc(g.them.name)}</div></div>
      <div><div class="v">${st.changes}</div><div class="k">${plural(st.changes, "смена", "смены", "смен")} лидера</div></div>
      <div><div class="v">${st.ties}</div><div class="k">${plural(st.ties, "раз", "раза", "раз")} счёт равный</div></div>
    </div></section>`;
}
function bindLeadChart(d) {
  const box = document.querySelector(".lead");
  if (!box) return;
  const { pts } = leadSeries(d);
  const total = Number(box.dataset.total), svg = box.querySelector("svg"), cross = box.querySelector(".cross"), tip = box.querySelector(".tip");
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total;
    let p = pts[0];
    for (const q of pts) { if (q.t <= t) p = q; else break; }
    const x = (p.t / total) * 350;
    cross.setAttribute("x1", x); cross.setAttribute("x2", x);
    const when = p.e ? `${periodName(p.e.period)}, ${String(Math.floor(p.e.time / 60)).padStart(2, "0")}:${String(p.e.time % 60).padStart(2, "0")}` : "Начало матча";
    tip.innerHTML = `<b>${p.sc[0]}:${p.sc[1]}</b> ${esc(when)}${p.e?.player ? `<br><span>${esc(EVENT[p.e.type])}, ${esc(p.e.player)}</span>` : ""}`;
    tip.hidden = false;
    tip.style.left = `${Math.max(0, Math.min(r.width - tip.offsetWidth, (p.t / total) * r.width - tip.offsetWidth / 2))}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); };
  svg.addEventListener("pointermove", (e) => show(e.clientX));
  svg.addEventListener("pointerdown", (e) => show(e.clientX));
  svg.addEventListener("pointerleave", hide);
}

// ---------- Бросковый профиль ----------
function shootingBlock(p, t) {
  const sh = p.shooting;
  if (!sh || !sh.career) return "";
  const avg = t.leaders[0]?.avg_pct || {};
  const rows = [["fg2", "2 очка"], ["fg3", "3 очка"], ["ft", "Штрафные"]];
  const pct = (ma) => (ma && ma[1] ? (100 * ma[0]) / ma[1] : null);
  const bar = (label, src, key) => {
    const v = pct(src?.[key]);
    if (v == null) return "";
    const a = avg[key];
    return `<div class="shot"><div class="shot-h"><span>${label}</span><span><b class="num">${fmt1(v)}%</b> <span class="muted">${src[key][0]} из ${src[key][1]}</span></span></div>
      <div class="track"><div class="fill" style="width:${Math.min(100, v)}%"></div>${a != null ? `<div class="avg" style="left:${a}%" title="Среднее по ${esc(t.leaders[0].name)}: ${a}%"></div>` : ""}</div></div>`;
  };
  const block = (title, src) => src && (src.fg2?.[1] || src.fg3?.[1] || src.ft?.[1]) ? `<div class="shots"><div class="shots-t">${title}</div>${rows.map(([k, l]) => bar(l, src, k)).join("")}</div>` : "";
  return `<section class="section"><div class="section-h"><h2>Бросок</h2><span class="aside">риска — среднее по ${esc(t.leaders[0]?.name || "дивизиону")}</span></div>
    ${block(`Сезон, ${sh.season?.games || 0} ${plural(sh.season?.games || 0, "игра", "игры", "игр")}`, sh.season)}
    ${block(`Карьера, ${sh.career.games} ${plural(sh.career.games, "игра", "игры", "игр")}`, sh.career)}</section>`;
}

// ---------- Подписка на календарь и маршрут ----------
function calendarSheet() {
  // Личный календарь игрока — игры всех его команд; без выбранного игрока — календарь команды.
  const base = new URL(me() ? `data/players/${me()}.ics` : `data/t/${myTeamId()}/team.ics`, location.href);
  const webcal = `webcal://${base.host}${base.pathname}`;
  openSheet(`<h3>Календарь игр</h3>
    <p>Игры всех твоих команд появятся в календаре телефона. Когда лига утвердит расписание тура, игры появятся в календаре сами. За 2 часа до игры придёт напоминание.</p>
    <div class="btn-row" style="padding:20px 0 0">
      <a class="btn primary" href="${webcal}">Подписаться — iPhone и Mac</a>
      <a class="btn ghost" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Google Календарь</a>
      <a class="btn ghost" href="${base.href}" download="abl-games.ics">Скачать файл .ics</a>
      <button class="btn ghost" data-close>Закрыть</button></div>`);
}
// Площадка игры: назначенная или «обычный зал дивизиона», пока лига не назначила площадку тура.
function venueBlock(g, pad = "10px") {
  const name = g.venue || g.venue_expected, address = g.address || g.address_expected;
  if (!address) return "";
  return `<div class="btn-row" style="${pad === "0" ? "padding:0" : `padding-top:${pad}`}">
    <a class="btn ghost" href="${mapLink(address)}" target="_blank" rel="noopener">${icon.pin}Как добраться: ${esc(name)}</a>
    ${g.venue ? "" : `<p class="venue-note">Площадку тура лига ещё не назначила. Показываем зал, где обычно играет ${esc(g.tournament_name)}.</p>`}</div>`;
}
const mapLink = (address) => `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;

// ---------- Цвет формы ----------
// В MTGame поле цвета есть только у команды (tournament_team.additional_data.color) и лигой не заполняется.
// Пока правило условное: хозяева — в светлой, гости — в тёмной. Капитан может поменять цвет на игру
// (в демо — на этом устройстве); в рабочей версии команда получит уведомление в Telegram.
const KIT = { light: "Светлая", dark: "Тёмная" };
const kitKey = (gid) => `abl.kit.${gid}`;
function kitOf(g) {
  const saved = JSON.parse(localStorage.getItem(kitKey(g.id)) || "null");
  if (saved) return { color: saved.color, by: "captain", at: saved.at };
  return { color: g.home ? "light" : "dark", by: "rule" };
}
function kitBlock(g) {
  if (!g || g.status === "closed") return "";
  const k = kitOf(g);
  const at = k.at ? new Date(k.at).toLocaleString("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  return `<div class="kit ${k.by === "captain" ? "changed" : ""}"><span class="swatch ${k.color}" aria-hidden="true"></span>
    <span class="main"><span class="t">Форма: ${KIT[k.color].toLowerCase()}</span>
    <span class="s">${k.by === "captain" ? `Капитан изменил цвет ${esc(at)}` : `${g.home ? "Вы хозяева" : "Вы в гостях"}: по регламенту ${g.home ? "хозяева в светлой" : "гости в тёмной"}. Капитан может изменить`}</span></span></div>`;
}

// ---------- «Буду на игре» ----------
// Отметка на игру уже есть в личном кабинете MTGame, и капитан смотрит её там.
// Своей отметки в приложении нет, чтобы не было двух источников правды: кнопка ведёт в MTGame.
// Для сводки капитана в демо ответы детерминированы по id игрока; в рабочей версии — отметки из MTGame, если они будут в API.
const MTGAME_URL = "https://mtgame.ru/";
function rsvpOf(lp, gid) {
  const h = (lp * 31 + gid) % 10;
  return h < 6 ? "yes" : h < 8 ? "maybe" : h < 9 ? "no" : null;
}
function rsvpBlock(t, g) {
  if (!g || g.status === "closed" || g.status === "in_progress" || !t.roster.some((p) => p.league_player_id === me())) return "";
  return `<div class="rsvp"><div class="rsvp-h"><span>Будешь на игре?</span><span class="aside">отметки — в MTGame</span></div>
    <a class="btn ghost" href="${MTGAME_URL}" target="_blank" rel="noopener">Отметиться в MTGame${icon.ext}</a>
    <p class="follow-note">Капитан видит отметки в личном кабинете MTGame.</p></div>`;
}

// ---------- Правила лиги (Регламент ABL 2026/27) ----------
const REG_URL = "https://i.mtgame.ru/Reglament_yYArJ.pdf";
// Сроки до начала игры: оплата — за 2 суток (ст. 12.5), заявка на игру — за час (Прил. 1, ст. 5.3).
const PAY_BEFORE_H = 48, APPLY_BEFORE_H = 1, MIN_PLAYERS = 4;
const beforeGame = (g, h) => dateParts(new Date(new Date(g.datetime) - h * 36e5).toISOString());

// Допуск к плей-офф (Прил. 1, ст. 3.6): сыграть не меньше 30% матчей регулярного сезона за эту команду
// (округление вверх) и числиться в её заявке в последнем туре. Считаем по турниру дивизиона (league.division).
// Поле MTGame min_user_games_count (=3 в плей-офф 2026) с регламентом не сходится — не используем.
const PLAYOFF_SHARE = 0.3;
function playoffRule(t) {
  const tid = league?.division?.id;
  const reg = t.games.filter((g) => g.tournament_id === tid && !g.playoff_stage);
  if (!reg.length) return null;
  return {
    tid, total: reg.length,
    left: reg.filter((g) => g.status !== "closed").length,
    need: Math.ceil(reg.length * PLAYOFF_SHARE - 1e-9),
    tname: t.tournaments.find((x) => x.id === tid)?.name || "",
  };
}
function admission(rule, played) {
  const rest = Math.max(rule.need - played, 0);
  return { played, rest, state: rest === 0 ? "ok" : played + rule.left >= rule.need ? "open" : "out" };
}
// Сыгранные игры игрока за команду в турнире дивизиона. Игрок не может быть в двух командах одного дивизиона (ст. 3.4).
const gamesInDivision = (p, tid) => p.seasons.find((s) => s.tournament_id === tid)?.games || 0;
const regLink = (art) => `<a href="${REG_URL}" target="_blank" rel="noopener">Регламент ABL, ${art}${icon.ext}</a>`;

function admissionBlock(rule, a, teamName) {
  const games = (n) => `${n} ${plural(n, "игра", "игры", "игр")}`;
  const status = a.state === "ok"
    ? `<p class="screen-sub" style="padding:10px 0 0"><b>Допуск есть.</b> Осталось быть в заявке команды в последнем туре перед плей-офф.</p>`
    : a.state === "open"
      ? `<p class="screen-sub" style="padding:10px 0 0">Нужно ещё ${games(a.rest)}. У команды осталось ${games(rule.left)} регулярного сезона.</p>`
      : `<div class="clash" role="note" style="margin:10px 0 0"><b>Допуск уже не набрать</b><span class="why">Нужно ещё ${games(a.rest)}, а у команды осталось ${games(rule.left)}.</span></div>`;
  return `<section class="section"><div class="section-h"><h2>Допуск к плей-офф</h2><span class="aside">${esc(rule.tname)}${teamName ? `, ${esc(teamName)}` : ""}</span></div>
    <div class="facts">
      <div><div class="v">${a.played} из ${rule.need}</div><div class="k">игр для допуска</div></div>
      <div><div class="v">${rule.left}</div><div class="k">${plural(rule.left, "игра", "игры", "игр")} команды впереди</div></div>
    </div>${status}
    <p class="follow-note">Нужно сыграть не меньше 30% игр регулярного сезона за эту команду: ${rule.need} из ${rule.total}. ${regLink("Прил. 1, ст. 3.6")}</p></section>`;
}

// Капитану: кто допущен, кто ещё успевает, кто уже нет. Игры — из статистики дивизиона (leaders).
function captainAdmissionBlock(t, rule) {
  const board = t.leaders?.find((l) => l.tournament_id === rule.tid);
  const played = new Map((board?.players || []).filter((p) => p.team_id === t.team.id).map((p) => [p.league_player_id, p.games]));
  const rows = t.roster.map((p) => ({ p, a: admission(rule, played.get(p.league_player_id) || 0) }))
    .sort((x, y) => ({ out: 0, open: 1, ok: 2 }[x.a.state] - { out: 0, open: 1, ok: 2 }[y.a.state]) || x.a.rest - y.a.rest);
  const n = (s) => rows.filter((r) => r.a.state === s).length;
  const label = { ok: "допуск есть", open: "ещё успевает", out: "не успевает" };
  return `<section class="section"><div class="section-h"><h2>Допуск к плей-офф</h2><span class="aside">нужно ${rule.need} из ${rule.total} игр</span></div>
    <div class="big3" style="margin:0"><div><div class="v">${n("ok")}</div><div class="k">допуск есть</div></div>
      <div><div class="v">${n("open")}</div><div class="k">ещё успевают</div></div>
      <div><div class="v">${n("out")}</div><div class="k">не успевают</div></div></div>
    <div class="list" style="margin-top:12px">${rows.map(({ p, a }) => `<a class="row" href="#/player/${p.league_player_id}">
      <span class="main"><span class="t">${esc(p.last_name)} ${esc(p.first_name)}</span><span class="s">${a.state === "open" ? `нужно ещё ${a.rest}` : label[a.state]}</span></span>
      <span class="end"><b>${a.played}/${rule.need}</b></span></a>`).join("")}</div>
    <p class="follow-note">У команды впереди ${rule.left} ${plural(rule.left, "игра", "игры", "игр")} регулярного сезона. В последнем туре перед плей-офф игрок должен быть в заявке команды. ${regLink("Прил. 1, ст. 3.6")}</p></section>`;
}

// ---------- Цели в карьере (F76) ----------
// Ближайшие круглые числа по карьере. Показываем три цели, до которых ближе всего (в долях от цели).
const GOALS = [
  { key: "games", label: "игр в ABL", steps: [25, 50, 100, 150, 200, 250, 300, 400, 500], per: null },
  { key: "points_total", label: "очков в ABL", steps: [250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000], per: "ppg" },
  { key: "three_made_total", label: "трёхочковых", steps: [50, 100, 150, 200, 300, 400, 500, 750, 1000], per: null },
  { key: "rebounds_total", label: "подборов", steps: [100, 250, 500, 750, 1000, 1500, 2000, 3000], per: "rpg" },
  { key: "assists_total", label: "передач", steps: [100, 250, 500, 750, 1000, 1500, 2000], per: "apg" },
];
function careerGoals(c) {
  if (!c?.games) return [];
  return GOALS.map((g) => {
    const v = Math.round(Number(c[g.key]) || 0);
    const target = g.steps.find((s) => s > v);
    if (!target) return null;
    // Темп за игру: из карьеры, для трёхочковых — сумма / игры. «Игр» — сам счётчик.
    const rate = g.key === "games" ? 1 : g.per ? Number(c[g.per]) : v / c.games;
    const rest = target - v;
    return { ...g, v, target, rest, inGames: rate > 0 ? Math.ceil(rest / rate) : null };
  }).filter(Boolean).sort((a, b) => a.rest / a.target - b.rest / b.target).slice(0, 3);
}
function goalsBlock(p) {
  const list = careerGoals(p.career);
  if (!list.length) return "";
  return `<section class="section"><div class="section-h"><h2>Цели в карьере</h2><span class="aside">ближайшие</span></div>
    <div class="shots">${list.map((g) => `<div class="shot"><div class="shot-h"><span>${fmtInt(g.target)} ${g.label}</span>
      <span><b class="num">ещё ${fmtInt(g.rest)}</b>${g.inGames && g.key !== "games" ? ` <span class="muted">≈ ${g.inGames} ${plural(g.inGames, "игра", "игры", "игр")}</span>` : ""}</span></div>
      <div class="track"><div class="fill" style="width:${Math.min(100, (100 * g.v) / g.target)}%"></div></div></div>`).join("")}</div>
    <p class="follow-note">Сейчас: ${list.map((g) => `${fmtInt(g.v)} ${g.label}`).join(", ")}. Оценка в играх — по среднему за карьеру.</p></section>`;
}

// ---------- Доступ к аккаунту MTGame (F79) ----------
// Игрока без почты в MTGame заводит капитан («пустышка»). Войти в ЛК он сможет, когда капитан впишет его e-mail
// и игрок подтвердит регистрацию; статистика сохранится (переписка с MTGame, 11.11.2026).
// Ведём человека в ЛК MTGame: MTGame это выгодно, а нам — довод в переговорах о платном API.
function mtgameAccountBlock(p, teamName) {
  return `<section class="section"><div class="section-h"><h2>Аккаунт MTGame</h2></div>
    <p class="screen-sub" style="padding:0">Отмечаться на игры и править профиль можно в личном кабинете MTGame. Если тебя заводил капитан и войти не получается, попроси его вписать твою почту.</p>
    <div class="btn-row" style="padding:12px 0 0"><button class="btn ghost" id="mtg-access">Как получить доступ</button></div></section>`;
}
function bindMtgameAccess(p, teamName) {
  document.getElementById("mtg-access")?.addEventListener("click", () => {
    const who = `${fullName(p)}${p.number != null ? `, № ${p.number}` : ""}${teamName ? `, ${teamName}` : ""}`;
    const text = `Привет! Впиши, пожалуйста, мою почту в мою карточку игрока в MTGame (${who}): ____. Придёт письмо, я подтвержу регистрацию и смогу сам отмечаться на игры. Статистика сохранится.`;
    const share = `https://t.me/share/url?url=${encodeURIComponent(MTGAME_URL)}&text=${encodeURIComponent(text)}`;
    openSheet(`<h3>Доступ к аккаунту MTGame</h3>
      <ol class="steps">
        <li>Попроси капитана вписать твою почту в твою карточку игрока в MTGame.</li>
        <li>Открой письмо от MTGame и подтверди регистрацию.</li>
        <li>Войди в личный кабинет: там отметки на игры и твой профиль. Статистика сохранится.</li>
      </ol>
      <p class="follow-note">Играешь за две команды и у тебя две записи? MTGame может объединить их навсегда — напиши в лигу.</p>
      <div class="btn-row" style="padding:20px 0 0"><a class="btn primary" href="${share}" target="_blank" rel="noopener">Написать капитану в Telegram${icon.ext}</a>
        <a class="btn ghost" href="${MTGAME_URL}" target="_blank" rel="noopener">Открыть MTGame${icon.ext}</a>
        <button class="btn ghost" data-close>Закрыть</button></div>`);
  });
}

// ---------- Правила лиги (F70) ----------
// Короткие ответы по регламенту 2026/27. Перед запуском тексты согласовать с лигой (ABL_request_league.md, вопрос 5).
const RULES_FAQ = [
  ["Сколько нужно игроков, чтобы игра состоялась?", "Минимум 4 игрока на площадке. Если меньше, команде засчитывают техническое поражение 20:0, и она оплачивает издержки за матч.", "ст. 5.4–5.5"],
  ["Когда оплачивать игру?", "За 2 суток до начала матча. Размер взноса лига сообщает руководителям команд до начала чемпионата.", "ст. 12.5"],
  ["Когда отмечать заявку на игру?", "Представитель команды отмечает игроков в заявке не позднее чем за час до игры, в личном кабинете MTGame.", "Прил. 1, ст. 5.3"],
  ["Какую форму надевать?", "Хозяин (слева в расписании) играет в светлой, гость — в тёмной. По договорённости команд хозяин может сыграть в тёмной. Без майки с номером спереди и сзади к игре не допустят.", "ст. 10.3–10.4"],
  ["Кого допустят к плей-офф?", "Тех, кто сыграл не меньше 30% матчей регулярного сезона за эту команду (с округлением вверх) и числится в её заявке в последнем туре перед плей-офф.", "Прил. 1, ст. 3.6"],
  ["Можно ли играть за две команды?", "За две команды одного дивизиона — нет. Перейти в другую команду можно после 5 игровых недель в нынешней.", "Прил. 1, ст. 3.4–3.5"],
  ["Кто такой легионер?", "Игрок из заявки команды одного из двух дивизионов выше. В заявке на игру — не больше двух легионеров, иначе поражение 20:0.", "Прил. 1, ст. 3.7"],
  ["Можно ли перенести игру?", "Команда сама перенести игру не может. Переносить тур или игры может только руководитель лиги — при форс-мажоре или в интересах лиги.", "ст. 13"],
  ["В чём нельзя выходить на площадку?", "В обуви, которая портит паркет, в грязной обуви, в обычных очках, капюшонах, с цепочками, часами и кольцами.", "ст. 10.1"],
  ["Как попасть в заявку команды?", "Капитан передаёт в лигу ФИО, амплуа, дату рождения, фото, игровой номер и e-mail. Фото — цветное, анфас, на белом фоне, в клубной форме, без очков и головных уборов, не вырезанное из общего снимка. Пока данных не хватает, игрока не заявят. Заявлять игроков можно весь турнир, в составе — не больше 25.", "Прил. 1, ст. 2.2–2.4, 3.2–3.3"],
  ["Когда передавать пожелания по времени игры?", "В капитанском чате турнира с 12:00 понедельника до 18:00 вторника. После этого лига утверждает расписание.", "ст. 5.8"],
  ["Как подать протест?", "Если у соперника играл незаявленный или дисквалифицированный игрок — в течение 5 суток после матча. Заявку соперника проверяют в перерыве или сразу после игры при судье.", "Прил. 1, ст. 4.2–4.3"],
];
async function viewRules() {
  $view.innerHTML = `${top("Правила лиги", "#/me")}
    <p class="screen-sub">Коротко о главном из регламента ABL на сезон 2026/27.</p>
    <div class="demo-note">Ответы — пересказ регламента. Перед запуском тексты согласуем с лигой.</div>
    <div class="faq">${RULES_FAQ.map(([q, a, art]) => `<details><summary><span>${esc(q)}</span>${icon.chev}</summary>
      <p>${esc(a)} <span class="art">${esc(art)}</span></p></details>`).join("")}</div>
    <div class="btn-row"><a class="btn ghost" href="${REG_URL}" target="_blank" rel="noopener">Регламент целиком (PDF)${icon.ext}</a></div>`;
}

// ---------- Итоги сезона «ABL Wrapped» ----------
async function wrapBanner() {
  try {
    const p = await getPlayer(me());
    if (!p.wrapped) return "";
    return `<a class="wrap-banner" href="#/wrapped"><span class="wb-t">Твой ${esc(p.wrapped.season.replace(/^Сезон\s*/i, "сезон "))}</span>
      <span class="wb-s">${p.wrapped.games} ${plural(p.wrapped.games, "игра", "игры", "игр")}, ${fmtInt(p.wrapped.points_total)} ${plural(p.wrapped.points_total, "очко", "очка", "очков")}${p.wrapped.titles.length ? ", чемпионство" : ""}. Смотреть итоги</span>${icon.chev}</a>`;
  } catch { return ""; }
}
function wrapSlides(p) {
  const w = p.wrapped, season = w.season.replace(/^Сезон\s*/i, "");
  const winPct = w.games ? Math.round((100 * w.won) / w.games) : 0;
  const slides = [
    { k: "Итоги сезона", big: season, title: `${p.first_name} ${p.last_name}`, sub: "Твой сезон в ABL. Нажимай справа, чтобы листать." },
    { k: "Ты вышел на площадку", big: w.games, title: plural(w.games, "игра", "игры", "игр"), sub: `${w.won} ${plural(w.won, "победа", "победы", "побед")}, это ${winPct}% матчей` },
    { k: "Ты набрал", big: fmtInt(w.points_total), title: plural(w.points_total, "очко", "очка", "очков"), sub: `${fmt1(w.ppg)} за игру, ${w.threes_total} ${plural(w.threes_total, "трёхочковый", "трёхочковых", "трёхочковых")}` },
    { k: "Лучший турнир", big: w.best.name, title: `${fmt1(w.best.ppg)} очка за игру`, sub: `${w.best.games} ${plural(w.best.games, "игра", "игры", "игр")}. Турниры сезона: ${w.tournaments.map((x) => x.name).join(", ")}` },
    { k: `В команде ${w.tournaments[0]?.team || ""}`, big: `${w.team_rank}-й`, title: "по очкам", sub: `из ${w.team_size} ${plural(w.team_size, "игрока", "игроков", "игроков")} команды в этом сезоне` },
  ];
  if (w.titles.length) slides.push({ k: "Главное", big: "№1", title: `Чемпион ${w.titles.join(", ")}`, sub: "Медаль уже в твоём профиле", gold: true });
  else slides.push({ k: "Под щитами и в пасах", big: w.rebounds_total, title: plural(w.rebounds_total, "подбор", "подбора", "подборов"), sub: `и ${w.assists_total} ${plural(w.assists_total, "передача", "передачи", "передач")}` });
  slides.push({ k: "Поделись сезоном", final: true });
  return slides;
}
async function viewWrapped(lp, i = 0) {
  const p = await getPlayer(lp || me());
  if (!p.wrapped) { $view.innerHTML = `${top("Итоги сезона", "#/me")}<p class="empty">У игрока нет завершённого сезона в ABL.</p>`; return; }
  const slides = wrapSlides(p);
  i = Math.max(0, Math.min(i, slides.length - 1));
  const s = slides[i], w = p.wrapped;
  $view.innerHTML = `<div class="wrap" role="region" aria-label="Итоги сезона, экран ${i + 1} из ${slides.length}">
    ${arcSVG("arc wrap-arc")}
    <div class="wrap-bars">${slides.map((_, j) => `<span class="${j <= i ? "on" : ""}"></span>`).join("")}</div>
    <a class="wrap-close" href="#/me" aria-label="Закрыть">✕</a>
    ${s.final ? `<div class="wrap-body"><p class="wk">${esc(w.season)}</p>
        <div class="wrap-sum">
          <div><b class="num">${w.games}</b><span>игр</span></div><div><b class="num">${fmtInt(w.points_total)}</b><span>очков</span></div>
          <div><b class="num">${fmt1(w.ppg)}</b><span>за игру</span></div><div><b class="num">${w.threes_total}</b><span>трёхочковых</span></div>
        </div>
        ${w.titles.length ? `<p class="wrap-gold">${medalSVG("1", true)} Чемпион ${esc(w.titles.join(", "))}</p>` : ""}
        <div class="btn-row" style="padding:28px 0 0"><button class="btn primary" id="wshare">Поделиться итогами</button><a class="btn ghost" href="#/me">Готово</a></div></div>`
      : `<div class="wrap-body"><p class="wk">${esc(s.k)}</p>
        ${s.gold ? `<div class="wrap-medal">${medalSVG("1", true)}</div>` : `<p class="wbig num ${String(s.big).length > 6 ? "long" : ""}">${esc(s.big)}</p>`}
        <p class="wt">${esc(s.title)}</p><p class="ws">${esc(s.sub)}</p></div>`}
    ${s.final ? "" : `<button class="wrap-prev" aria-label="Назад"></button><button class="wrap-next" aria-label="Дальше"></button>`}
  </div>`;
  $tabbar.hidden = true;
  document.querySelector(".wrap-next")?.addEventListener("click", () => viewWrapped(lp, i + 1));
  document.querySelector(".wrap-prev")?.addEventListener("click", () => viewWrapped(lp, i - 1));
  document.getElementById("wshare")?.addEventListener("click", () => shareWrap(p));
}
async function shareWrap(p) {
  const w = p.wrapped;
  await document.fonts.load('800 100px "Tektur"'); await document.fonts.load('600 40px "Inter"');
  const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#111111"; x.fillRect(0, 0, W, H);
  x.strokeStyle = "#ed1c24"; x.lineWidth = 26; x.setLineDash([60, 46]);
  x.beginPath(); x.arc(W, 0, 560, Math.PI * 0.5, Math.PI); x.stroke(); x.setLineDash([]);
  const mark = new Image(); mark.src = "icons/round_mark.svg"; await mark.decode().catch(() => {});
  if (mark.naturalWidth) x.drawImage(mark, 90, 110, 150, 150);
  x.fillStyle = "#a3a3a3"; x.font = '500 40px "Inter"'; x.textAlign = "left";
  x.fillText("Итоги сезона", 90, 380);
  x.fillStyle = "#fff"; x.font = '800 110px "Tektur"'; x.fillText(w.season.replace(/^Сезон\s*/i, ""), 90, 500);
  x.font = '800 64px "Tektur"'; x.fillText(`${p.first_name} ${p.last_name}`.toUpperCase(), 90, 610);
  const cells = [[w.games, plural(w.games, "игра", "игры", "игр")], [fmtInt(w.points_total), plural(w.points_total, "очко", "очка", "очков")],
                 [fmt1(w.ppg), "очков за игру"], [w.threes_total, plural(w.threes_total, "трёхочковый", "трёхочковых", "трёхочковых")]];
  cells.forEach(([v, k], j) => {
    const cx = 90 + (j % 2) * 470, cy = 860 + Math.floor(j / 2) * 330;
    x.fillStyle = "#fff"; x.font = '800 170px "Tektur"'; x.fillText(String(v), cx, cy);
    x.fillStyle = "#a3a3a3"; x.font = '500 40px "Inter"'; x.fillText(k, cx, cy + 62);
  });
  x.fillStyle = "#fff"; x.font = '600 44px "Inter"';
  x.fillText(`${w.team_rank}-й по очкам в ${w.tournaments[0]?.team || "команде"}`, 90, 1560);
  if (w.titles.length) { x.fillStyle = "#ed1c24"; x.font = '800 60px "Tektur"'; x.fillText(`ЧЕМПИОН ${w.titles.join(", ").toUpperCase()}`, 90, 1660); }
  x.fillStyle = "#ed1c24"; x.font = '800 40px "Tektur"'; x.textAlign = "center"; x.fillText("PRO OMNI POPULO", W / 2, 1860);
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  const file = new File([blob], "abl-season.png", { type: "image/png" }), url = URL.createObjectURL(blob);
  const canShare = navigator.canShare?.({ files: [file] });
  openSheet(`<h3>Итоги сезона</h3><div class="preview"><img src="${url}" alt="Карточка итогов сезона"></div>
    <div class="btn-row" style="padding:20px 0 0">${canShare ? `<button class="btn primary" data-act="share">Поделиться</button>` : ""}
    <a class="btn ${canShare ? "ghost" : "primary"}" href="${url}" download="abl-season.png">Сохранить картинку</a><button class="btn ghost" data-close>Закрыть</button></div>`,
    (act) => { if (act === "share") navigator.share({ files: [file], title: "ABL" }).catch(() => {}); });
}

// Режим капитана — кликабельный макет. Состав, заявка и отметки живут в ЛК MTGame, оплата — на сайте ABL:
// приложение ведёт туда. Своё у приложения — цвет формы и напоминание в Telegram.
const ablTeamUrl = (id) => `https://ablforpeople.com/team/${id}`;
async function viewCaptain() {
  const t = await getTeam();
  const next = t.games.find((g) => g.status !== "closed");
  const when = next?.datetime ? dateParts(next.datetime) : null;
  const ext = (href, label, cls = "ghost") => `<a class="btn ${cls}" href="${href}" target="_blank" rel="noopener">${label}${icon.ext}</a>`;
  $view.innerHTML = `
    <h1 class="screen-title">Капитан</h1>
    <p class="screen-sub">${esc(t.team.name)}, ${esc(t.tournaments[0].name)}</p>
    <div class="demo-note">Демо. Состав, заявка и отметки на игру — в личном кабинете MTGame, оплата — на сайте ABL. Приложение ведёт туда в одно касание.</div>
    ${next ? `<section class="section"><div class="section-h"><h2>Оплата игры</h2><span class="aside">тур ${esc(next.tour)}</span></div>
      <div class="pay">
        <div class="k">${esc(next.us.name)} — ${esc(next.them.name)}</div>
        <div class="v">${when ? `${esc(when.day)}, ${esc(when.time)}` : "Дата уточняется"}</div>
        <div class="k" style="margin-top:6px">${next.datetime ? (() => { const d = beforeGame(next, PAY_BEFORE_H); return `Оплатить до ${esc(d.day)}, ${esc(d.time)} — за 2 суток до матча.`; })() : "Срок — за 2 суток до матча, когда лига утвердит расписание."} Каждая игра оплачивается отдельно.</div>
        <div style="margin-top:18px">${ext(ablTeamUrl(t.team.id), "Оплатить на сайте ABL", "primary")}</div>
        <p class="follow-note">Бот напомнит о сроке в Telegram. Статус оплаты видит лига: в приложении он появится, если лига подключит уведомления кассы. ${regLink("ст. 12.5")}</p>
      </div></section>` : ""}
    ${next ? (() => {
      const k = kitOf(next);
      return `<section class="section"><div class="section-h"><h2>Форма на игру</h2><span class="aside">${esc(next.them.name)}, тур ${esc(next.tour)}</span></div>
        <div class="seg kit-seg" role="radiogroup" aria-label="Цвет формы">${Object.entries(KIT).map(([c, v]) => `<button role="radio" data-kit="${c}" aria-checked="${k.color === c}" aria-pressed="${k.color === c}"><span class="swatch ${c}" aria-hidden="true"></span>${v}</button>`).join("")}</div>
        <p class="screen-sub" style="padding:8px 0 0">${k.by === "captain" ? "Цвет изменён тобой. Команда видит его в карточке игры." : `Сейчас по регламенту: ${next.home ? "вы хозяева, хозяева в светлой" : "вы в гостях, гости в тёмной"}. Поменяться можно по договорённости с соперником.`}</p></section>`;
    })() : ""}
    ${next ? (() => {
      const groups = { yes: [], maybe: [], no: [], none: [] };
      for (const p of t.roster) groups[rsvpOf(p.league_player_id, next.id) || "none"].push(p);
      return `<section class="section"><div class="section-h"><h2>Кто будет на игре</h2><span class="aside">отметки из MTGame</span></div>
        <div class="big3" style="margin:0"><div><div class="v">${groups.yes.length}</div><div class="k">будут</div></div>
          <div><div class="v">${groups.maybe.length}</div><div class="k">под вопросом</div></div>
          <div><div class="v">${groups.none.length + groups.no.length}</div><div class="k">не будут или молчат</div></div></div>
        ${groups.yes.length < MIN_PLAYERS ? `<div class="clash" role="note" style="margin:10px 0 0"><b>Точно будут ${groups.yes.length} из ${MIN_PLAYERS} нужных</b><span class="why">Если на площадке меньше 4 игроков, команде засчитают поражение 20:0 и выставят издержки за матч (ст. 5.5).</span></div>` : ""}
        <p class="screen-sub" style="padding:10px 0 0">Не отметились: ${groups.none.map((p) => esc(p.last_name)).join(", ") || "все отметились"}</p>
        <p class="follow-note">Цифры демонстрационные. В рабочей версии — отметки игроков из MTGame, если MTGame отдаст их приложению.</p>
        <div class="btn-row" style="padding:12px 0 0"><button class="btn ghost" id="nudge">Напомнить в Telegram</button></div></section>`;
    })() : ""}
    <section class="section"><div class="section-h"><h2>Состав и заявка</h2><span class="aside">${t.roster.length} ${plural(t.roster.length, "игрок", "игрока", "игроков")}</span></div>
      <p class="screen-sub" style="padding:0 0 12px">Добавить или убрать игрока, собрать заявку на игру — в личном кабинете MTGame. Нужны права модератора команды.</p>
      ${next?.datetime ? (() => { const d = beforeGame(next, APPLY_BEFORE_H); return `<div class="kit" style="margin:0 0 12px"><span class="main"><span class="t">Заявка на игру — до ${esc(d.time)}, ${esc(d.day)}</span><span class="s">Отметить игроков нужно не позднее чем за час до игры. Бот напомнит за 3 часа.</span></span></div>`; })() : ""}
      ${ext(MTGAME_URL, "Изменить состав в MTGame")}
      <p class="follow-note">В составе ${t.roster.length} из 25. При полном составе нового игрока можно заявить только вместо кого-то. ${regLink("Прил. 1, ст. 3.3, 5.3")}</p></section>
    ${(() => { const rule = playoffRule(t); return rule ? captainAdmissionBlock(t, rule) : ""; })()}
    <div class="btn-row"><a class="btn ghost" href="#/rules">Правила лиги</a></div>`;
  $view.querySelectorAll("[data-kit]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.kit;
    if (c === kitOf(next).color) return;
    openSheet(`<h3>${KIT[c]} форма?</h3>
      <p class="rsvp-game">${esc(next.us.name)} — ${esc(next.them.name)}, тур ${esc(next.tour)}</p>
      <p>Вся команда получит уведомление: «Форма на игру — ${KIT[c].toLowerCase()}». Цвет обновится в карточке игры у каждого игрока.</p>
      <div class="btn-row" style="padding:20px 0 0"><button class="btn primary" data-act="ok">Изменить и уведомить</button><button class="btn ghost" data-close>Отмена</button></div>`,
      (act) => { if (act === "ok") { localStorage.setItem(kitKey(next.id), JSON.stringify({ color: c, at: new Date().toISOString() })); viewCaptain(); } });
  }));
  document.getElementById("nudge")?.addEventListener("click", () => openSheet(`
    <h3>Напоминание</h3><p>В рабочей версии игроки без отметки получат сообщение в Telegram: «Капитан ждёт отметку на игру в MTGame» — со ссылкой на личный кабинет.</p>
    <div class="btn-row" style="padding:20px 0 0"><button class="btn ghost" data-close>Понятно</button></div>`));
}

// ---------- Нижний лист ----------
function openSheet(html, onAct) {
  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  $sheet.hidden = false;
  const close = () => { $sheet.hidden = true; $sheet.innerHTML = ""; };
  $sheet.onclick = (e) => {
    if (e.target === $sheet || e.target.closest("[data-close]")) return close();
    const a = e.target.closest("[data-act]");
    if (a) { close(); onAct?.(a.dataset.act); }
  };
  $sheet.querySelector("button")?.focus();
}

// ---------- Карточка для Stories ----------
// Фото матча берём из галереи сайта лиги (i.mtgame.ru). С 11.11.2026 сервер фото отдаёт
// Access-Control-Allow-Origin: *, поэтому сначала грузим фото напрямую: обрезка под 9:16 и ч/б — в canvas.
// Если браузер не пустил (ошибка загрузки или «грязный» canvas), берём открытый прокси wsrv.nl,
// он делает то же на своей стороне. Какой путь сработал — видно в шторке с ?debug в адресе.
const STORY_ALPHAS = [0.1, 0.15, 0.2];
const proxied = (url, retry = 0) =>
  `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1080&h=1920&fit=cover&a=attention&filt=greyscale&output=jpg&q=72${retry ? `&r=${retry}` : ""}`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("фото не загрузилось"));
    img.src = src;
  });
}
const STORY_DEBUG = new URLSearchParams(location.search).has("debug");
let lastBgSource = null; // "напрямую" | "через прокси"
// Напрямую: метка cors=1 в адресе — чтобы Safari не взял из кэша копию того же фото, загруженную без CORS
// (миниатюры в шторке грузятся обычным <img>). getImageData бросает SecurityError, если canvas «грязный».
async function directBackground(url) {
  const img = await loadImage(url + (url.includes("?") ? "&" : "?") + "cors=1");
  const W = 1080, H = 1920, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight); // как fit=cover, кадр по центру
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  const px = x.getImageData(0, 0, W, H), a = px.data;
  for (let i = 0; i < a.length; i += 4) { const l = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = l; } // ч/б, как в брендбуке
  x.putImageData(px, 0, 0);
  return c;
}
async function loadBackground(url) {
  try { const c = await directBackground(url); lastBgSource = "напрямую"; return c; } catch {}
  lastBgSource = "через прокси";
  try { return await loadImage(proxied(url)); } catch { return loadImage(proxied(url, 1)); } // прокси иногда отвечает ошибкой на первый запрос
}

// Медали за матч в карточке Stories — тот же вид, что в профиле.
function drawMedals(x, W, list) {
  const r = 64, gap = 250, y = 1700;
  let cx = W / 2 - ((list.length - 1) * gap) / 2;
  for (const B of list) {
    x.fillStyle = "#1a1a1a"; x.beginPath(); x.arc(cx, y, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#ffffff"; x.lineWidth = 3; x.stroke();
    x.strokeStyle = "#ed1c24"; x.lineWidth = 5; x.setLineDash([12, 10]);
    x.beginPath(); x.arc(cx, y, r - 12, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#fff"; x.textAlign = "center";
    x.font = `800 ${B.g.length <= 2 ? 40 : B.g.length === 3 ? 34 : 28}px "Tektur"`; x.fillText(B.g, cx, y + 12);
    x.font = '600 32px "Inter"'; x.fillStyle = "#d4d4d4"; x.fillText(B.t, cx, y + r + 46);
    cx += gap;
  }
}

// Размер шрифта, при котором текст помещается в maxW (от max до min px).
function fitFont(x, text, maxW, weight, max, min, family) {
  let size = max;
  for (; size > min; size -= 2) { x.font = `${weight} ${size}px "${family}"`; if (x.measureText(text).width <= maxW) break; }
  return `${weight} ${size}px "${family}"`;
}
// Сокращение текста с многоточием до ширины maxW при текущем шрифте.
function clip(x, text, maxW) {
  if (x.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && x.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}
// Строка «Команда vs Соперник»: сначала уменьшаем шрифт (до 60%), потом сокращаем длинное название.
function fitTeamsLine(x, maxW, us, them, usCol, themCol) {
  const make = (k, a, b) => [[a, `700 ${Math.round(50 * k)}px "Inter"`, usCol], ["   vs   ", `500 ${Math.round(40 * k)}px "Inter"`, "#6e6e6e"], [b, `500 ${Math.round(46 * k)}px "Inter"`, themCol]];
  const width = (parts) => parts.reduce((sum, [t, f]) => { x.font = f; return sum + x.measureText(t).width; }, 0);
  let k = 1;
  while (k > 0.6 && width(make(k, us, them)) > maxW) k -= 0.05;
  let parts = make(k, us, them);
  if (width(parts) > maxW) { // всё ещё не помещается — делим остаток места поровну между названиями
    x.font = parts[1][1];
    const half = (maxW - x.measureText(parts[1][0]).width) / 2;
    x.font = parts[0][1]; const a = clip(x, us, half);
    x.font = parts[2][1]; const b = clip(x, them, half);
    parts = make(k, a, b);
  }
  return parts;
}
// Красная пунктирная дуга от верхнего края (трёхочковая линия). Шаг пунктира подгоняется под длину дуги
// так, чтобы на обоих краях картинки были целые штрихи, а не мелкие обрезки-точки.
function drawTopArc(x, W) {
  const cx = W / 2, cy = -250, r = 800, dash = 60, gapBase = 46;
  const t0 = Math.acos(Math.min(1, cx / r));          // угол точки, где дуга выходит за правый край
  const len = r * (Math.PI - 2 * t0);                  // длина видимой части дуги
  const n = Math.max(1, Math.round((len - dash) / (dash + gapBase)));
  const gap = (len - dash * (n + 1)) / n;              // штрих на каждом краю + n промежутков
  x.strokeStyle = "#ed1c24"; x.lineWidth = 26; x.lineCap = "butt"; x.setLineDash([dash, gap]);
  x.beginPath(); x.arc(cx, cy, r, t0, Math.PI - t0); x.stroke();
  x.setLineDash([]);
}

// Лучший игрок команды в матче: больше очков, при равенстве — выше эффективность.
const bestOf = (box) => [...box].sort((a, b) => b.points - a.points || (b.efficiency ?? -99) - (a.efficiency ?? -99))[0];

// Показатели для картинки: очки, подборы и третий — наибольший из передач, перехватов, блок-шотов,
// 3-очковых, 2-очковых и штрафных (при равенстве — по порядку списка). Нули не показываем.
function storyStats(p) {
  const made = (a) => (Array.isArray(a) ? a[0] : 0) || 0;
  const third = [
    [p.assists || 0, ["передача", "передачи", "передач"]],
    [p.steals || 0, ["перехват", "перехвата", "перехватов"]],
    [p.blocks || 0, ["блок-шот", "блок-шота", "блок-шотов"]],
    [made(p.fg3), ["трёхочковый", "трёхочковых", "трёхочковых"]],
    [made(p.fg2), ["двухочковый", "двухочковых", "двухочковых"]],
    [made(p.ft), ["штрафной", "штрафных", "штрафных"]],
  ].reduce((a, b) => (b[0] > a[0] ? b : a));
  return [
    [p.points || 0, ["очко", "очка", "очков"]],
    [p.rebounds || 0, ["подбор", "подбора", "подборов"]],
    third,
  ].filter(([v]) => v > 0).map(([v, f]) => [v, plural(v, ...f)]);
}

async function drawStory(d, bgImg, alpha, who = "me") {
  const g = d.game, r = result(g);
  await document.fonts.load('800 100px "Tektur"');
  await document.fonts.load('600 40px "Inter"');
  const W = 1080, H = 1920, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#111111"; x.fillRect(0, 0, W, H);
  if (bgImg) { // фото матча, приглушённое до 10–20%, чтобы не спорило с цифрами
    x.globalAlpha = alpha;
    x.drawImage(bgImg, 0, 0, W, H);
    x.globalAlpha = 1;
  }
  // Court pattern: линии площадки и пунктирная дуга
  x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 6;
  x.beginPath(); x.arc(W / 2, H + 120, 760, Math.PI, 2 * Math.PI); x.stroke();
  x.beginPath(); x.moveTo(0, 1180); x.lineTo(W, 1180); x.stroke();
  drawTopArc(x, W);
  x.setLineDash([]);

  // Знак ABL Round Mark (минимум 48 px по брендбуку; здесь 150 px) и подпись турнира
  const mark = new Image();
  mark.src = "icons/round_mark.svg";
  await mark.decode().catch(() => {});
  if (mark.complete && mark.naturalWidth) x.drawImage(mark, 90, 110, 150, 150);
  x.textAlign = "left"; x.font = '500 38px "Inter"'; x.fillStyle = "#a3a3a3";
  x.fillText(`${g.tournament_name}${g.tour ? `, тур ${g.tour}` : ""}`, 270, 200);

  x.textAlign = "center"; x.fillStyle = "#fff";
  x.font = '800 120px "Tektur"';
  x.fillText(r === "w" ? "ПОБЕДА" : r === "l" ? "ПОРАЖЕНИЕ" : "НИЧЬЯ", W / 2, 690);
  // Счёт: проигравшая команда приглушена тем же серым, что и название соперника; двоеточие — как «vs»
  x.font = '800 300px "Tektur"';
  const sc = [[String(g.us.score), r === "l" ? "#a3a3a3" : "#ffffff"], [":", "#6e6e6e"], [String(g.them.score), r === "w" ? "#a3a3a3" : "#ffffff"]];
  const sw = sc.map(([t]) => x.measureText(t).width);
  let sx = (W - sw.reduce((a, b) => a + b, 0)) / 2;
  x.textAlign = "left";
  sc.forEach(([t, col], i) => { x.fillStyle = col; x.fillText(t, sx, 970); sx += sw[i]; });
  x.textAlign = "center"; x.fillStyle = "#fff";
  // Строка команд: команда игрока выделена (белый, жирный, красная черта снизу), соперник приглушён
  // Правило: победитель — белым, проигравший — серым (и название, и счёт). Команда игрока всегда жирная
  // и с красной чертой; при поражении черта приглушается до 45%, чтобы метка «моя команда» осталась, но без акцента.
  const WIN = "#ffffff", LOSE = "#a3a3a3";
  const usCol = r === "l" ? LOSE : WIN, themCol = r === "w" ? LOSE : WIN;
  const parts = fitTeamsLine(x, W - 180, g.us.name, g.them.name, usCol, themCol);
  const widths = parts.map(([t, f]) => { x.font = f; return x.measureText(t).width; });
  let px = (W - widths.reduce((a, b) => a + b, 0)) / 2;
  x.textAlign = "left";
  parts.forEach(([t, f, col], i) => {
    x.font = f; x.fillStyle = col; x.fillText(t, px, 1068);
    if (i === 0) { x.fillStyle = r === "l" ? "rgba(237,28,36,.45)" : "#ed1c24"; x.fillRect(px, 1090, widths[0], 8); }
    px += widths[i];
  });

  const myId = me();
  const mine = d.box.us.find((p) => p.league_player_id === myId);
  const best = bestOf(d.box.us);
  const top = who === "best" || !mine ? best : mine;
  if (top) {
    x.textAlign = "center"; x.fillStyle = "#a3a3a3"; x.font = '500 38px "Inter"';
    x.fillText(top === mine ? "Мой матч" : "Лучший в команде", W / 2, 1265);
    x.fillStyle = "#fff";
    x.font = fitFont(x, `${top.first_name} ${top.last_name}`.toUpperCase(), W - 180, 800, 70, 40, "Tektur");
    x.fillText(`${top.first_name} ${top.last_name}`.toUpperCase(), W / 2, 1350);
    const stats = storyStats(top);
    stats.forEach(([v, k], i) => {
      const cx = W / 2 + (i - (stats.length - 1) / 2) * 320; // 1–3 колонки, всегда по центру картинки
      x.fillStyle = "#fff"; x.font = '800 150px "Tektur"'; x.fillText(String(v), cx, 1540);
      x.fillStyle = "#a3a3a3"; x.font = '500 38px "Inter"'; x.fillText(k, cx, 1598);
    });
  }
  // Медали за этот матч — того игрока, чья статистика на картинке
  if (top) {
    const earned = [];
    try { (await getPlayer(top.league_player_id)).badges.season.filter((b) => b.game_id === g.id).forEach((b) => earned.push(BADGES[b.key])); } catch {}
    if (earned.length) drawMedals(x, W, earned);
  }
  x.textAlign = "center"; x.fillStyle = "#ed1c24"; x.font = '800 40px "Tektur"';
  x.fillText("PRO OMNI POPULO", W / 2, 1888);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

async function shareStory(d, preset = {}) {
  const g = d.game;
  const photos = d.photos || [];
  const st = { photo: preset.photo ?? null, alpha: preset.alpha ?? 0.15, bg: null, file: null, url: null, busy: false, who: preset.who || "me" };
  const mine = d.box.us.find((p) => p.league_player_id === me());
  const best = bestOf(d.box.us);
  const canPick = mine && best && best.league_player_id !== mine.league_player_id; // выбор нужен, только если лучший — не я

  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="Итог матча"><div class="grab"></div>
    <h3>Итог матча</h3>
    <div class="preview" id="sp"><img alt="Карточка итога матча для Stories"></div>
    <div class="story-opts">
      ${best ? `<div class="opt-h"><span>Чья статистика</span></div>
      ${canPick ? `<div class="seg who" role="radiogroup" aria-label="Чья статистика на картинке">
        <button data-who="me" aria-pressed="${st.who === "me"}">Моя: ${mine.points} ${plural(mine.points, "очко", "очка", "очков")}</button>
        <button data-who="best" aria-pressed="${st.who === "best"}">${esc(best.last_name)}: ${best.points} ${plural(best.points, "очко", "очка", "очков")}</button></div>`
      : `<p class="opt-note who-note">${mine
          ? `Ты лучший в команде в этом матче: ${mine.points} ${plural(mine.points, "очко", "очка", "очков")}. На картинке твоя статистика.`
          : `Тебя нет в протоколе этого матча, поэтому на картинке лучший игрок команды: ${esc(best.first_name)} ${esc(best.last_name)}, ${best.points} ${plural(best.points, "очко", "очка", "очков")}.`}</p>`}` : ""}
      <div class="opt-h"><span>Фон</span>${photos.length ? `<span class="aside">${photos.length} фото с сайта лиги</span>` : ""}</div>
      ${photos.length ? `<div class="strip" role="radiogroup" aria-label="Фото для фона">
        <button class="ph none" role="radio" data-ph="-1" aria-checked="true">Без фото</button>
        ${photos.map((p, i) => `<button class="ph" role="radio" data-ph="${i}" aria-checked="false" aria-label="Фото ${i + 1}"><img src="${esc(p.thumb)}" loading="lazy" alt=""></button>`).join("")}
      </div>
      <div class="seg alpha" role="group" aria-label="Непрозрачность фото">${STORY_ALPHAS.map((a) => `<button data-alpha="${a}" aria-pressed="${a === st.alpha}">${Math.round(a * 100)}%</button>`).join("")}</div>
      <p class="opt-err" id="serr" hidden></p>` : `<p class="opt-note">Фото с этого матча пока нет на сайте лиги. Обычно их публикуют на следующий день.</p>`}
    </div>
    <div class="btn-row" style="padding:16px 0 0">
      ${navigator.canShare ? `<button class="btn primary" data-share>Поделиться</button>` : ""}
      <a class="btn ${navigator.canShare ? "ghost" : "primary"}" id="ssave" download="abl-${g.id}.png">Сохранить картинку</a>
      <button class="btn ghost" data-close>Закрыть</button></div></div>`;
  $sheet.hidden = false;
  const $p = document.getElementById("sp"), $img = $p.querySelector("img"), $err = document.getElementById("serr");

  async function render() {
    $p.classList.add("busy");
    const blob = await drawStory(d, st.bg, st.alpha, st.who);
    if (st.url) URL.revokeObjectURL(st.url);
    st.url = URL.createObjectURL(blob);
    st.file = new File([blob], `abl-${g.id}.png`, { type: "image/png" });
    $img.src = st.url;
    document.getElementById("ssave").href = st.url;
    $p.classList.remove("busy");
  }
  async function pick(i) {
    $sheet.querySelectorAll(".ph").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.ph) === i)));
    $sheet.querySelector(`.ph[data-ph="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    if ($err) $err.hidden = true;
    st.photo = i;
    if (i < 0) { st.bg = null; return render(); }
    $p.classList.add("busy");
    try {
      const img = await loadBackground(photos[i].full);
      if (st.photo !== i) return; // пока грузилось, выбрали другое фото
      st.bg = img;
      if (STORY_DEBUG) { $err.textContent = `Фото загружено ${lastBgSource}`; $err.hidden = false; }
    } catch {
      $err.textContent = "Не удалось загрузить это фото. Выберите другое.";
      $err.hidden = false;
      st.bg = null;
    }
    return render();
  }

  $sheet.onclick = async (e) => {
    if (e.target === $sheet || e.target.closest("[data-close]")) { $sheet.hidden = true; $sheet.innerHTML = ""; if (st.url) URL.revokeObjectURL(st.url); return; }
    const ph = e.target.closest("[data-ph]");
    if (ph) return pick(Number(ph.dataset.ph));
    const wb = e.target.closest("[data-who]");
    if (wb) {
      st.who = wb.dataset.who;
      $sheet.querySelectorAll("[data-who]").forEach((b) => b.setAttribute("aria-pressed", String(b === wb)));
      return render();
    }
    const a = e.target.closest("[data-alpha]");
    if (a) {
      st.alpha = Number(a.dataset.alpha);
      $sheet.querySelectorAll("[data-alpha]").forEach((b) => b.setAttribute("aria-pressed", String(b === a)));
      if (st.bg) render();
      return;
    }
    if (e.target.closest("[data-share]") && st.file) {
      if (navigator.canShare?.({ files: [st.file] })) navigator.share({ files: [st.file], title: "ABL" }).catch(() => {});
      else document.getElementById("ssave").click();
    }
  };
  if (st.photo != null && st.photo >= 0) await pick(st.photo); else await render();
  $sheet.querySelector("button")?.focus();
}

// ---------- Роутер ----------
async function route() {
  clearInterval(liveTimer);
  await getLeague().catch(() => {});
  const [, name, arg, sub, sub2] = location.hash.split("/");
  // Ссылка #/as/<league_player_id> сразу открывает демо от лица игрока (удобно для показа).
  if (name === "as" && Number(arg)) {
    localStorage.setItem(ME_KEY, arg);
    const tid = teamOfPlayer(Number(arg));
    if (tid) localStorage.setItem(TEAM_KEY, String(tid));
    teamCache.clear(); gameCache.clear();
    return location.replace("#/games");
  }
  const authed = me() !== null && myTeamId() !== null;
  if (!authed && name !== "player" && name !== "pick") return show(viewTeamPicker, null);
  switch (name) {
    case "pick": return show(() => viewOnboarding(Number(arg)), null);
    case "game": return show(() => viewGame(Number(arg), sub || "box"), "games");
    case "g": return show(() => viewGame(Number(sub), sub2 || "box", false, Number(arg)), "team");
    case "team": return show(() => viewTeam(arg ? Number(arg) : null), "team");
    case "player": return show(() => viewPlayer(Number(arg)), "team");
    case "me": return show(() => viewPlayer(me(), true), "me");
    case "captain": return show(viewCaptain, "captain");
    case "rules": return show(viewRules, "me");
    case "wrapped": return show(() => viewWrapped(arg ? Number(arg) : null, Number(sub) || 0), null);
    case "opponent": return show(() => viewOpponent(Number(arg)), "games");
    case "story": return show(async () => { await viewGame(Number(arg)); await shareStory(await getGame(Number(arg)), { photo: sub != null && sub !== "-" ? Number(sub) : null, who: sub2 || "me" }); }, "games");
    default: return show(viewGames, "games");
  }
}
async function show(fn, tab) {
  fromCache = false;
  $tabbar.hidden = !tab;
  $tabbar.querySelectorAll("a").forEach((a) => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  try {
    await fn();
    if (fromCache || !navigator.onLine) $view.insertAdjacentHTML("afterbegin", offlineBar());
  } catch (e) {
    console.error(e);
    $view.innerHTML = `<div class="err">Не удалось загрузить данные: ${esc(e.message)}. Проверьте подключение к интернету и обновите страницу.</div>`;
  }
  window.scrollTo(0, 0);
  document.querySelector(".device").scrollTo?.(0, 0);
  $view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
window.addEventListener("online", () => { teamCache.clear(); gameCache.clear(); route(); }); // связь появилась — подтягиваем свежие данные
route();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
