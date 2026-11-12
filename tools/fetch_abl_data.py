"""Выгружает снимок данных ABL из публичного API MTGame для демо-приложения.

Что делает:
  1. Находит все текущие турниры (дивизионы) лиги, где играет команда.
  2. Сохраняет игры команды, турнирные таблицы и состав.
  3. По каждой сыгранной/идущей игре сохраняет счёт по четвертям, протокол
     и ход игры (журнал событий с подсчитанным текущим счётом).
  4. По каждому игроку состава сохраняет статистику по сезонам и за карьеру.

Результат — нормализованные JSON-файлы в app/data/, которые читает PWA.
Сырые ответы API кэшируются в .tmp/mtgame_cache/ (можно удалить в любой момент).

Запуск:
  .venv/bin/python execution/fetch_abl_data.py                # команда по умолчанию (946, KB Magic)
  .venv/bin/python execution/fetch_abl_data.py --team 946 --no-cache
"""
import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _utils import ROOT, tmp_path  # noqa: E402

API = "https://mtgame.ru/api/v1"
LEAGUE_ID = 2  # ABL Москва (ablforpeople.com)
DEFAULT_TEAM_ID = 946  # KB Magic
OUT_DIR = Path(os.environ["ABL_OUT_DIR"]).resolve() if os.environ.get("ABL_OUT_DIR") else ROOT / "app" / "data"
CACHE_DIR = tmp_path("mtgame_cache")
CACHE_DIR.mkdir(exist_ok=True)
UA = {"User-Agent": "abl-demo-app/0.1"}

# Типы событий в журнале игры, которые показываем в «Ходе игры».
POINTS = {"one_point_made": 1, "free_throw_made": 1, "two_point_made": 2, "three_point_made": 3, "four_point_made": 4}
SHOWN_EVENTS = set(POINTS) | {
    "personal_foul", "technical_foul", "unsportsmanlike_foul", "disqualification_foul",
    "flagrant_foul", "timeout", "block", "steal",
}

session = requests.Session()
session.headers.update(UA)
use_cache = True


def get(path: str, ttl: int = 600):
    """GET к API с кэшем в .tmp и повторами при обрывах соединения.

    ttl — сколько секунд кэш считается свежим (история прошлых сезонов кэшируется надолго).
    """
    key = hashlib.md5(path.encode()).hexdigest()
    cache_file = CACHE_DIR / f"{key}.json"
    if use_cache and cache_file.exists() and time.time() - cache_file.stat().st_mtime < ttl:
        return json.loads(cache_file.read_text())
    last_err = None
    for attempt in range(4):
        try:
            r = session.get(API + path, timeout=90)
            r.raise_for_status()
            data = r.json()
            cache_file.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except (requests.RequestException, ValueError) as e:  # ValueError: обрезанный JSON
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"API недоступен: {path}: {last_err}")


def logo(obj):
    return ((obj or {}).get("logo") or {}).get("path")


def form(team_id, last_games):
    """Последние игры команды в таблице → строка вида «WLW» (W — победа, L — поражение)."""
    out = ""
    for g in last_games or []:
        rt = g.get("result_type") or ""
        home = g.get("team_id") == team_id
        if rt in ("team_won", "competitor_team_won"):
            out += "W" if (rt == "team_won") == home else "L"
    return out


def num(v, default=0):
    """API отдаёт часть чисел строками (например, plus_minus) — приводим к числу."""
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return default


def player_name(lp: dict) -> dict:
    return {"first_name": (lp or {}).get("first_name") or "", "last_name": (lp or {}).get("last_name") or ""}


def norm_game(g: dict, team_id: int) -> dict:
    """Игра в виде, удобном приложению: «мы» и «соперник» вместо team/competitor_team."""
    home = g["team_id"] == team_id
    us, them = ("team", "competitor_team") if home else ("competitor_team", "team")
    court = g.get("tournament_court") or {}
    return {
        "id": g["id"],
        "datetime": g.get("datetime"),  # UTC; у будущих игр без расписания — null
        "status": g.get("status"),  # draft (дата не назначена) / open / in_progress / closed
        "tour": g.get("tournament_tour"),
        "tournament_id": g.get("tournament_id"),
        "tournament_name": (g.get("tournament") or {}).get("name"),
        "group": (g.get("tournament_group") or {}).get("name"),
        "playoff_stage": g.get("playoff_stage"),
        "venue": court.get("name") or g.get("location"),
        "address": court.get("address") or g.get("location"),
        "home": home,
        "us": {"id": g[f"{us}_id"], "name": g[us]["name"], "logo": logo(g[us]), "score": g[f"{us}_score"]},
        "them": {"id": g[f"{them}_id"], "name": g[them]["name"], "logo": logo(g[them]), "score": g[f"{them}_score"]},
        "periods": [[p[0], p[1]] if home else [p[1], p[0]] for _, p in sorted((g.get("score_by_period") or {}).items(), key=lambda kv: int(kv[0]))],
    }


def box_badges(p: dict) -> list:
    """Бейджи за одну игру по строке протокола. Тексты бейджей — в приложении (app.js, BADGES)."""
    cats = [p["points"], p["rebounds"], p["assists"], p["steals"], p["blocks"]]
    tens = sum(1 for v in cats if (v or 0) >= 10)
    out = []
    if tens >= 3:
        out.append("triple_double")
    elif tens == 2:
        out.append("double_double")
    if p["points"] >= 30:
        out.append("pts30")
    elif p["points"] >= 20:
        out.append("pts20")
    if p["fg3"][0] >= 4:
        out.append("sniper")
    if p["rebounds"] >= 10:
        out.append("boards")
    if p["assists"] >= 10:
        out.append("dimes")
    if p.get("mvp"):
        out.append("mvp")
    return out


def career_badges(career: dict, seasons: list, history: dict) -> list:
    """Бейджи за карьеру в лиге: вехи по играм и очкам, чемпионства, стаж."""
    out = []
    games, pts = num(career.get("games")), num(career.get("points_total"))
    for n in (300, 200, 100, 50):
        if games >= n:
            out.append({"key": f"games{n}", "value": games}); break
    for n in (3000, 2000, 1000, 500):
        if pts >= n:
            out.append({"key": f"pts{n}", "value": pts}); break
    for r in seasons:
        t = history.get(r["tournament_id"]) or {}
        # Призовые места турнира: team_winner / team_second / team_third (id — это tournament_team_id)
        for place, field in ((1, "team_winner"), (2, "team_second"), (3, "team_third")):
            team = t.get(field) or {}
            if team.get("id") and team["id"] == r.get("tournament_team_id"):
                out.append({"key": "champion" if place == 1 else f"place{place}", "place": place,
                            "tournament": r["tournament"], "season": r["season"], "date": r["date"]})
    years = [int(r["date"][:4]) for r in seasons if r.get("date")]
    if years:
        out.append({"key": "since", "value": min(years)})
    return out


def game_details(game: dict, team_id: int) -> dict:
    """Протокол и ход игры для одной игры."""
    gid = game["id"]
    ttl = 30 if game["status"] == "in_progress" else 7 * 86400
    users = get(f"/tournament_game/{gid}/users/", ttl)
    stats = {s["game_user_id"]: s for s in get(f"/tournament_basketball_game/{gid}/user_statistic/", ttl)}
    logs = get(f"/tournament_basketball_game/{gid}/logs/", ttl)

    people = {}
    box = {"us": [], "them": []}
    for u in users:
        side = "us" if u["team_user"]["team_id"] == team_id else "them"
        lp = (u.get("tournament_team_user") or {}).get("league_player") or {}
        name = player_name(lp)
        people[u["id"]] = {"side": side, "number": u.get("number"), **name}
        s = stats.get(u["id"], {})
        box[side].append({
            "league_player_id": lp.get("id"),
            "number": u.get("number"),
            **name,
            "mvp": u.get("is_mvp", False),
            "points": s.get("points", 0), "rebounds": s.get("rebounds", 0), "assists": s.get("assists", 0),
            "steals": s.get("steals", 0), "blocks": s.get("blocks", 0), "turnovers": s.get("turnovers", 0),
            "fouls": s.get("personal_fouls", 0), "plus_minus": s.get("plus_minus"),
            "efficiency": s.get("player_efficiency"), "game_time": s.get("game_time"),
            "fg2": [s.get("two_points_made", 0), s.get("two_point_attempts", 0)],
            "fg3": [s.get("three_points_made", 0), s.get("three_point_attempts", 0)],
            "ft": [s.get("free_throws_made", 0), s.get("free_throw_attempts", 0)],
        })
    for side in box:
        box[side].sort(key=lambda p: -(p["points"] or 0))

    # Ход игры: события по порядку с текущим счётом «мы : соперник».
    events, score = [], {"us": 0, "them": 0}
    for e in sorted(logs, key=lambda e: (e.get("period") or 0, e.get("time") or 0, e.get("id"))):
        t = e["log_type"]
        if t not in SHOWN_EVENTS:
            continue
        who = people.get(e.get("game_user_id"))
        side = who["side"] if who else ("us" if e.get("team_id") == team_id else "them")
        if t in POINTS:
            score[side] += POINTS[t]
        events.append({
            "period": e.get("period"), "time": e.get("time"), "type": t, "side": side,
            "player": f'{who["first_name"]} {who["last_name"]}'.strip() if who else None,
            "number": who["number"] if who else None,
            "score": [score["us"], score["them"]],
        })
    # Галерея матча с сайта лиги: превью 500×500 и кадр 1920×1080 (фон для карточки Stories).
    media = get(f"/tournament_game/{gid}/media/", 600 if game["status"] == "in_progress" else 86400)
    photos = [{"thumb": m["list_photo"]["path"], "full": (m.get("detail_photo") or m["original_photo"])["path"]}
              for m in media if m.get("list_photo") and m.get("original_photo")]
    video = next((m["video_url"] for m in media if m.get("video_url")), None)
    return {"game": game, "box": box, "events": events, "photos": photos, "video": video}


def season_wrap(doc: dict, cur_season: str):
    """Итоги последнего завершённого сезона игрока (сезон до текущего) — данные для «ABL Wrapped»."""
    rows = [r for r in doc["seasons"] if r.get("season") and r["season"] != cur_season and num(r.get("games"))]
    if not rows:
        return None
    season = max(rows, key=lambda r: r["date"] or "")["season"]
    rows = [r for r in rows if r["season"] == season]
    games = sum(num(r["games"]) for r in rows)
    tot = lambda k: round(sum(num(r.get(k)) * num(r["games"]) for r in rows))
    best = max(rows, key=lambda r: (num(r["games"]) >= 3, num(r.get("points"))))
    return {
        "season": season, "games": games, "won": sum(num(r.get("won")) for r in rows),
        "points_total": tot("points"), "rebounds_total": tot("rebounds"), "assists_total": tot("assists"), "threes_total": tot("threes"),
        "ppg": round(tot("points") / games, 1) if games else 0,
        "tournaments": [{"name": r["tournament"], "team": r["team"], "games": num(r["games"]), "ppg": num(r.get("points"))} for r in rows],
        "best": {"name": best["tournament"], "ppg": num(best.get("points")), "games": num(best["games"])},
        "titles": [b["tournament"] for b in doc["badges"]["career"] if b["key"] == "champion" and b.get("season") == season],
    }


def build_team(team_id: int, league: int, light: bool = False) -> dict:
    """Полный снимок одной команды в data/t/<team_id>/ + общие файлы игроков в data/players/.
    light=True — «вторая» команда игрока из другого дивизиона: расписание, таблица, протоколы и состав,
    без статистики игроков, лидеров и разбора соперников (так автообновление укладывается по времени).
    Возвращает краткую карточку команды для индекса league.json."""
    team_dir = OUT_DIR / "t" / str(team_id)
    (team_dir / "games").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "players").mkdir(parents=True, exist_ok=True)

    # 1. Текущие турниры лиги, где играет команда.
    current = get(f"/league/{league}/tournaments/?statuses=in_progress")
    tournaments, team_info = [], None
    for t in current:
        for tt in get(f"/tournament/{t['id']}/teams/"):
            if tt.get("team_id") == team_id:
                tournaments.append({"t": t, "tt": tt})
                team_info = team_info or tt
    if not tournaments:
        raise RuntimeError(f"Команда {team_id} не найдена в текущих турнирах лиги {league}")
    # Основной турнир — с самой поздней датой окончания (регулярный сезон дивизиона).
    tournaments.sort(key=lambda x: x["t"].get("date_end") or "", reverse=True)
    print(f"Команда: {team_info['name']}; турниры: {', '.join(x['t']['name'] for x in tournaments)}")

    # 2. Игры, таблицы.
    games, standings = [], []
    for x in tournaments:
        t = x["t"]
        games += [norm_game(g, team_id) for g in get(f"/tournament/{t['id']}/games/?team_id={team_id}", 120)]
        table = sorted(get(f"/tournament/{t['id']}/teams/", 300),
                       key=lambda r: (-num(r.get("points")), -num(r.get("plus_minus"))))
        standings.append({
            "tournament_id": t["id"], "name": t["name"],
            "rows": [{
                "team_id": r["team_id"], "name": r["name"], "logo": logo(r) or logo(r.get("team")),
                "games": num(r.get("games_count")), "won": num(r.get("won_games_count")),
                "lost": num(r.get("lose_games_count")), "points": num(r.get("points")),
                "plus_minus": num(r.get("plus_minus")), "last_five": form(r["team_id"], r.get("last_five_games")),
            } for r in table],
        })
    # Ожидаемая площадка для игр без назначенного зала: самый частый зал этого турнира среди сыгранных игр,
    # иначе поле location турнира. В приложении помечается как «обычный зал дивизиона», не как факт.
    from collections import Counter
    for x in tournaments:
        tid = x["t"]["id"]
        seen = Counter((g["venue"], g["address"]) for g in games if g["tournament_id"] == tid and g["venue"])
        venue, address = seen.most_common(1)[0][0] if seen else (x["t"].get("location"), x["t"].get("location"))
        for g in games:
            if g["tournament_id"] == tid and not g["venue"] and venue:
                g["venue_expected"], g["address_expected"] = venue, address
    # Сортировка: идущие и запланированные по дате, черновики (без даты) — в конце по номеру тура.
    games.sort(key=lambda g: (g["datetime"] is None, g["datetime"] or "", g["tour"] or 0))

    # 3. Детали игр (протокол, ход игры).
    played = [g for g in games if g["status"] in ("closed", "in_progress")]
    details = {}
    for g in played:
        details[g["id"]] = game_details(g, team_id)
        (team_dir / "games" / f"{g['id']}.json").write_text(json.dumps(details[g["id"]], ensure_ascii=False))
    # Бейджи за игры сезона: league_player_id -> [{key, game_id, date, opponent, ...}]
    game_badges, season_best, season_shooting = {}, {}, {}
    for gid, d in details.items():
        g = d["game"]
        for p in d["box"]["us"]:
            lp = p["league_player_id"]
            ctx = {"game_id": gid, "date": g["datetime"], "opponent": g["them"]["name"],
                   "points": p["points"], "rebounds": p["rebounds"], "assists": p["assists"]}
            for key in box_badges(p):
                game_badges.setdefault(lp, []).append({"key": key, **ctx})
            if p["points"] > (season_best.get(lp) or {}).get("points", -1):
                season_best[lp] = ctx
            sh = season_shooting.setdefault(lp, {"fg2": [0, 0], "fg3": [0, 0], "ft": [0, 0], "games": 0})
            sh["games"] += 1
            for k in ("fg2", "fg3", "ft"):
                sh[k][0] += p[k][0]; sh[k][1] += p[k][1]
    print(f"Игр всего: {len(games)}, с протоколом: {len(played)}")

    # 4. Состав основного турнира + статистика игроков.
    main_t = tournaments[0]
    roster_raw = get(f"/tournament_team/{main_t['tt']['id']}/users/", 300)
    history = {}  # tournament_id -> турнир (для названий сезонов)
    for st in ("closed", "in_progress", "open"):
        for t in get(f"/league/{league}/tournaments/?statuses={st}", 86400):
            history[t["id"]] = t
    roster, docs = [], {}
    for r in roster_raw:
        lp, tu = r["league_player"], r["team_user"]
        user = tu.get("user") or {}
        profile = user.get("basketball_profile") or {}
        p = {
            "league_player_id": lp["id"], **player_name(lp),
            "number": tu.get("number"), "photo": (lp.get("photo") or user.get("photo") or {}).get("path"),
            "position": profile.get("position"),
            # В данных ABL отдельного признака капитана нет; moderator = управляет командой на MTGame.
            "captain": tu.get("permission_role") == "moderator" or tu.get("role") == "moderator",
        }
        roster.append(p)
        if light:
            continue
        seasons = get(f"/basketball_statistic/?group_by=tournament_team_user&league_player_id={lp['id']}&per_game=1", 86400)
        career = get(f"/basketball_statistic/?group_by=league_player&league_player_id={lp['id']}&per_game=1", 86400)
        totals = get(f"/basketball_statistic/?group_by=league_player&league_player_id={lp['id']}&per_game=0", 86400)
        rows = []
        for s in seasons:
            ttu = s.get("tournament_team_user") or {}
            tid = (ttu.get("tournament_team") or {}).get("tournament_id")
            t = history.get(tid) or {}
            rows.append({
                "tournament_id": tid, "tournament": t.get("name"),
                "season": (t.get("season") or {}).get("name"), "date": t.get("date"),
                "team": (ttu.get("tournament_team") or {}).get("name"),
                "tournament_team_id": (ttu.get("tournament_team") or {}).get("id"),
                "games": s.get("games_count"), "won": s.get("won_games_count"),
                "points": s.get("points"), "rebounds": s.get("rebounds"), "assists": s.get("assists"),
                "steals": s.get("steals"), "blocks": s.get("blocks"), "efficiency": s.get("player_efficiency"),
                "fg3_pct": s.get("three_point_percent"), "ft_pct": s.get("free_throw_percent"),
                "threes": s.get("three_points_made"),
            })
        rows.sort(key=lambda r: r["date"] or "", reverse=True)
        c, tot = (career or [{}])[0], (totals or [{}])[0]
        career_row = {"games": tot.get("games_count"), "points_total": tot.get("points")}
        docs[lp["id"]] = {
            **p,
            "badges": {
                "season": sorted(game_badges.get(lp["id"], []), key=lambda b: b["date"] or "", reverse=True),
                "career": career_badges(career_row, rows, history),
            },
            "season_best": season_best.get(lp["id"]),
            "shooting": {
                "season": season_shooting.get(lp["id"]),
                "career": {"fg2": [num(tot.get("two_points_made")), num(tot.get("two_point_attempts"))],
                           "fg3": [num(tot.get("three_points_made")), num(tot.get("three_point_attempts"))],
                           "ft": [num(tot.get("free_throws_made")), num(tot.get("free_throw_attempts"))],
                           "games": num(tot.get("games_count"))},
            },
            "career": {
                "games": tot.get("games_count"), "won": tot.get("won_games_count"),
                "points_total": tot.get("points"), "rebounds_total": tot.get("rebounds"),
                "assists_total": tot.get("assists"), "three_made_total": tot.get("three_points_made"),
                "ppg": c.get("points"), "rpg": c.get("rebounds"), "apg": c.get("assists"),
                "efficiency": c.get("player_efficiency"),
            },
            "seasons": rows,
        }
    # Итоги прошлого сезона («ABL Wrapped»): суммы по всем турнирам сезона и место в команде по очкам.
    cur_season = (tournaments[0]["t"].get("season") or {}).get("name")
    for d in docs.values():
        d["wrapped"] = season_wrap(d, cur_season)
    by_season = {}
    for lp_id, d in docs.items():
        w = d["wrapped"]
        if w:
            by_season.setdefault(w["season"], []).append((w["points_total"], lp_id))
    for season, lst in by_season.items():
        lst.sort(reverse=True)
        for i, (_, lp_id) in enumerate(lst):
            docs[lp_id]["wrapped"].update(team_rank=i + 1, team_size=len(lst))
    for lp_id, d in docs.items():
        d["teams"] = []  # заполняется в main(): все текущие команды игрока
        (OUT_DIR / "players" / f"{lp_id}.json").write_text(json.dumps(d, ensure_ascii=False))
    roster.sort(key=lambda p: (p["last_name"], p["first_name"]))
    print(f"Игроков в составе: {len(roster)}")

    # 5. Лидеры дивизионов: вся статистика игроков турнира одним запросом, сортировка — в приложении.
    leaders = []
    for x in ([] if light else tournaments):
        t = x["t"]
        rows = get(f"/basketball_statistic/?group_by=tournament_team_user&tournament_id={t['id']}&per_game=1&size=1000", 600)
        players = []
        for s in rows:
            ttu = s.get("tournament_team_user") or {}
            lpd = ttu.get("league_player") or {}
            players.append({
                "league_player_id": lpd.get("id"), **player_name(lpd),
                "team_id": s.get("team_id"), "team": (ttu.get("tournament_team") or {}).get("name"),
                "games": num(s.get("games_count")),
                **{k: num(s.get(src)) for k, src in (("points", "points"), ("rebounds", "rebounds"), ("assists", "assists"),
                                                     ("steals", "steals"), ("blocks", "blocks"), ("efficiency", "player_efficiency"),
                                                     ("threes", "three_points_made"))},
            })
        avg = {}
        for k, made, att in (("fg2", "two_points_made", "two_point_attempts"), ("fg3", "three_points_made", "three_point_attempts"),
                             ("ft", "free_throws_made", "free_throw_attempts")):
            m = sum(num(r.get(made)) * num(r.get("games_count")) for r in rows)
            a_ = sum(num(r.get(att)) * num(r.get("games_count")) for r in rows)
            avg[k] = round(100 * m / a_, 1) if a_ else None
        max_games = max((p["games"] for p in players), default=0)
        leaders.append({"tournament_id": t["id"], "name": t["name"], "avg_pct": avg,
                        "min_games": max(1, -(-max_games // 2)),  # не меньше половины игр лидера по числу матчей
                        "players": players})
    print("Лидеры:", ", ".join("%s (%d)" % (l["name"], len(l["players"])) for l in leaders))

    # 6. Разбор соперников: форма, последние игры, личные встречи за всю историю.
    history_games = [norm_game(g, team_id) for g in get(f"/league/{league}/games/?team_id={team_id}", 600)]
    history_games = [g for g in history_games if g["status"] == "closed"]
    opponents = {}
    # Сначала будущие игры: разбор соперника строим по турниру ближайшей встречи.
    for g in ([] if light else sorted(games, key=lambda x: x["status"] == "closed")):
        oid = g["them"]["id"]
        if oid in opponents:
            continue
        their = get(f"/tournament/{g['tournament_id']}/games/?team_id={oid}&status=closed", 600)
        their = sorted([norm_game(x, oid) for x in their], key=lambda x: x["datetime"] or "", reverse=True)[:5]
        h2h = sorted([x for x in history_games if x["them"]["id"] == oid], key=lambda x: x["datetime"] or "", reverse=True)
        opponents[oid] = {
            "id": oid, "name": g["them"]["name"], "logo": g["them"]["logo"], "tournament_id": g["tournament_id"],
            "recent": [{"id": x["id"], "datetime": x["datetime"], "opponent": x["them"]["name"], "opponent_logo": x["them"]["logo"],
                        "score": [x["us"]["score"], x["them"]["score"]]} for x in their],
            "h2h": [{"id": x["id"], "datetime": x["datetime"], "tournament": x["tournament_name"],
                     "score": [x["us"]["score"], x["them"]["score"]]} for x in h2h],
        }
    print(f"Соперников: {len(opponents)}; игр в истории команды: {len(history_games)}")

    # 7. Календарь команды для подписки (webcal).
    write_ics(team_dir / "team.ics", "ABL — " + team_info["name"], games)

    # 8. Общий файл.
    team_doc = {
        "generated_at": None,
        "league_id": league,
        "team": {"id": team_id, "name": team_info["name"], "logo": logo(team_info) or logo(team_info.get("team")),
                 "tournament_team_id": main_t["tt"]["id"]},
        "tournaments": [{"id": x["t"]["id"], "name": x["t"]["name"], "season": (x["t"].get("season") or {}).get("name"),
                         "date": x["t"].get("date"), "date_end": x["t"].get("date_end")} for x in tournaments],
        "games": games,
        "standings": standings,
        "roster": roster,
        "leaders": leaders,
        "opponents": opponents,
        "light": light,
    }
    # generated_at — время последнего изменения данных: если всё совпадает с прошлой выгрузкой,
    # оставляем старое время, чтобы автообновление не создавало пустых коммитов.
    out = team_dir / "team.json"
    prev = json.loads(out.read_text()) if out.exists() else {}
    prev_time = prev.pop("generated_at", None)
    # Сравниваем после круга через JSON: ключи словарей в файле — строки, в памяти — числа.
    fresh = json.loads(json.dumps({k: v for k, v in team_doc.items() if k != "generated_at"}, ensure_ascii=False))
    team_doc["generated_at"] = prev_time if prev == fresh and prev_time \
        else datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.write_text(json.dumps(team_doc, ensure_ascii=False))
    print(f"  готово: {team_dir}")
    return {"id": team_id, "name": team_info["name"], "logo": team_doc["team"]["logo"],
            "tournament": tournaments[0]["t"]["name"], "roster": [p["league_player_id"] for p in roster]}


def write_ics(path: Path, calname: str, games: list):
    """Календарь игр для подписки (webcal). UID стабилен — перенос игры обновит событие в календаре."""
    from datetime import timedelta
    def ics_text(v):
        return str(v or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    def ics_dt(iso, plus_min=0):
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")) + timedelta(minutes=plus_min)
        return dt.strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ABL demo//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             f"X-WR-CALNAME:{ics_text(calname)}", "X-WR-TIMEZONE:Europe/Moscow",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for g in games:
        if not g["datetime"]:
            continue
        done = g["status"] == "closed"
        title = f"{g['us']['name']} — {g['them']['name']}" + (f" {g['us']['score']}:{g['them']['score']}" if done else "")
        lines += ["BEGIN:VEVENT", f"UID:abl-game-{g['id']}@abl-demo", f"DTSTAMP:{ics_dt(g['datetime'])}",  # детерминированно: иначе файл менялся бы при каждом запуске
                  f"DTSTART:{ics_dt(g['datetime'])}", f"DTEND:{ics_dt(g['datetime'], 90)}",
                  f"SUMMARY:{ics_text(title)}",
                  "DESCRIPTION:" + ics_text("%s, тур %s" % (g["tournament_name"], g["tour"]))]
        if g["address"]:
            lines.append(f"LOCATION:{ics_text(g['address'])}")
        if not done:
            lines += ["BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Игра ABL через 2 часа", "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    path.write_text("\r\n".join(lines) + "\r\n")


def player_teams(league: int, lps: set) -> dict:
    """Текущие команды игроков: league_player_id -> [team_id]. Берём строки статистики игрока по турнирам,
    которые сейчас идут. Команда, где игрок заявлен, но ещё не сыграл ни одной игры, сюда не попадёт."""
    current = get(f"/league/{league}/tournaments/?statuses=in_progress")
    cur_ids = {t["id"] for t in current}
    tt2team = {tt["id"]: tt["team_id"] for t in current for tt in get(f"/tournament/{t['id']}/teams/")}
    out = {}
    for lp in lps:
        f = OUT_DIR / "players" / f"{lp}.json"
        if not f.exists():
            continue
        rows = json.loads(f.read_text()).get("seasons") or []
        ids = []
        for r in rows:  # строки уже отсортированы от новых к старым
            tid = tt2team.get(r.get("tournament_team_id")) if r.get("tournament_id") in cur_ids else None
            if tid and tid not in ids:
                ids.append(tid)
        out[lp] = ids
    return out


def main():
    global use_cache
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--team", type=int, default=DEFAULT_TEAM_ID, help="команда по умолчанию (team_id MTGame)")
    ap.add_argument("--league", type=int, default=LEAGUE_ID)
    ap.add_argument("--only-team", action="store_true", help="выгрузить только команду по умолчанию, без остальных команд дивизиона")
    ap.add_argument("--no-cache", action="store_true", help="игнорировать кэш .tmp")
    args = ap.parse_args()
    use_cache = not args.no_cache

    # Все команды основного дивизиона команды по умолчанию (для демо — 8 команд HIGH).
    current = get(f"/league/{args.league}/tournaments/?statuses=in_progress")
    mine = [(t, tt) for t in current for tt in get(f"/tournament/{t['id']}/teams/") if tt.get("team_id") == args.team]
    if not mine:
        sys.exit(f"Команда {args.team} не найдена в текущих турнирах лиги {args.league}")
    division = max(mine, key=lambda x: x[0].get("date_end") or "")[0]
    team_ids = [args.team] + ([] if args.only_team else
                              [tt["team_id"] for tt in get(f"/tournament/{division['id']}/teams/") if tt["team_id"] != args.team])
    teams = []
    for tid in team_ids:
        print(f"Команда {tid}:")
        teams.append(build_team(tid, args.league))

    # «Мои игры» по всем командам: у игроков дивизиона находим остальные текущие команды
    # и выгружаем их облегчённо (light). У каждого игрока — список команд и общий календарь.
    lps = {lp for t in teams for lp in t["roster"]}
    by_player = player_teams(args.league, lps)
    for t in teams:  # команда дивизиона, где игрок в составе, всегда в списке — даже без сыгранных игр
        for lp in t["roster"]:
            ids = by_player.setdefault(lp, [])
            if t["id"] not in ids:
                ids.insert(0, t["id"])
    built = {t["id"] for t in teams}
    extra_ids = sorted({tid for ids in by_player.values() for tid in ids} - built) if not args.only_team else []
    extra = []
    for tid in extra_ids:
        print(f"Вторая команда {tid}:")
        try:
            extra.append(build_team(tid, args.league, light=True))
        except Exception as e:  # одна недоступная команда не должна ломать всю выгрузку
            print(f"  пропущена: {e}")
    known = built | {t["id"] for t in extra}
    team_games = {tid: json.loads((OUT_DIR / "t" / str(tid) / "team.json").read_text())["games"] for tid in known}
    for lp, ids in by_player.items():
        ids = [i for i in ids if i in known]
        f = OUT_DIR / "players" / f"{lp}.json"
        doc = json.loads(f.read_text())
        doc["teams"] = ids
        f.write_text(json.dumps(doc, ensure_ascii=False))
        seen, games = set(), []
        for i in ids:
            for g in team_games[i]:
                if g["id"] not in seen:
                    seen.add(g["id"]); games.append(g)
        games.sort(key=lambda g: g["datetime"] or "9999")
        write_ics(OUT_DIR / "players" / f"{lp}.ics", f"ABL — {doc['first_name']} {doc['last_name']}", games)
    print(f"Игроков в нескольких командах: {sum(len(v) > 1 for v in by_player.values())}; вторых команд: {len(extra)}")
    (OUT_DIR / "league.json").write_text(json.dumps({
        "league_id": args.league, "division": {"id": division["id"], "name": division["name"]},
        "default_team_id": args.team, "teams": teams,
        "extra_teams": [{k: t[k] for k in ("id", "name", "logo", "tournament")} for t in extra],
    }, ensure_ascii=False))
    print(f"Готово: {OUT_DIR} ({len(teams)} команд)")


if __name__ == "__main__":
    main()
