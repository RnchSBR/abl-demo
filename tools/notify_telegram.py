"""Уведомления команды ABL в Telegram: сравнивает прошлый и новый снимок данных и пишет о событиях.

События:
  - расписание утверждено: у игры появилась дата (администратор утвердил расписание тура);
  - игра перенесена: изменились дата, время или площадка. После утверждения расписания переносов нет —
    это тихий фолбэк на редкую договорённость двух команд (F18), в подключающем сообщении его не упоминаем;
  - матч начался / финальный счёт.

С 12.11.2026 — по регламенту ABL 2026/27 (https://i.mtgame.ru/Reglament_yYArJ.pdf):
  - опрос «Будешь на игре?» сразу после «Расписание утверждено» (F73). Меньше 4 игроков —
    поражение 20:0 (ст. 5.5). Официальная отметка остаётся в ЛК MTGame, опрос заменяет ручное «кто будет?»;
  - напоминание капитану об оплате: срок — за 2 суток до матча (ст. 12.5), напоминаем за 3 суток (F74);
  - напоминание капитану о заявке на игру: отметить не позднее чем за час (Прил. 1, ст. 5.3), напоминаем за 3 часа (F72);
  - напоминание капитану об окне пожеланий по времени: капитанский чат, пн 12:00 — вт 18:00 (ст. 5.8), раз в неделю,
    пока у команды есть игры без даты (F81).
  Напоминания зависят от времени, а не от изменений данных, поэтому отправленные запоминаются
  в файле состояния (--state). В Actions он переживает запуски через actions/cache.

Запуск (в GitHub Actions после fetch_abl_data.py):
  python notify_telegram.py --prev .tmp/prev_team.json --new data/team.json --state .tmp/notify_state.json
Проверка напоминаний на другой момент времени: --now 2026-11-13T15:00:00+03:00 --dry-run
Переменные окружения:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — бот и чат/канал (секреты репозитория);
  SITE_URL — адрес демо для ссылок, например https://rnchsbr.github.io/abl-demo/
Без токена или с флагом --dry-run сообщения только печатаются.
"""
import argparse
import html
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

MSK = ZoneInfo("Europe/Moscow")
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
MTGAME_URL = "https://mtgame.ru/"
ABL_TEAM_URL = "https://ablforpeople.com/team/{}"
PAY_BEFORE, PAY_REMIND = timedelta(hours=48), timedelta(hours=72)      # ст. 12.5
APPLY_BEFORE, APPLY_REMIND = timedelta(hours=1), timedelta(hours=3)    # Прил. 1, ст. 5.3
POLL_OPTIONS = ["Буду", "Под вопросом", "Не буду"]


def parse(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def when(iso):
    if not iso:
        return "дата уточняется"
    d = (iso if isinstance(iso, datetime) else parse(iso)).astimezone(MSK)
    return f"{d.day} {MONTHS[d.month - 1]}, {WEEKDAYS[d.weekday()]}, {d:%H:%M}"


def e(s):
    return html.escape(str(s or ""))


def events(prev: dict, new: dict, site: str) -> list:
    """Список текстов сообщений (HTML) по изменениям между снимками."""
    before = {g["id"]: g for g in prev.get("games", [])}
    team = new["team"]["name"]
    out = []
    for g in new.get("games", []):
        p = before.get(g["id"])
        if not p:
            continue  # новая игра в расписании без даты — ещё не новость
        vs = f"{e(g['us']['name'])} — {e(g['them']['name'])}"
        where = f", {e(g['venue'])}" if g.get("venue") else ""
        head = f"{e(g['tournament_name'])}, тур {e(g['tour'])}"
        link = f'\n<a href="{site}#/game/{g["id"]}">Открыть в приложении</a>' if site and g["status"] != "draft" else ""
        opp = f'\n<a href="{site}#/opponent/{g["them"]["id"]}">Разбор соперника</a>' if site and g["status"] not in ("closed", "in_progress") else ""

        if g["status"] == "closed" and p["status"] != "closed":
            us, them = g["us"]["score"], g["them"]["score"]
            verdict = "Победа" if us > them else "Поражение" if us < them else "Ничья"
            out.append(f"🏁 <b>{verdict} {us}:{them}</b>\n{vs}\n{head}{link}")
        elif g["status"] == "in_progress" and p["status"] != "in_progress":
            out.append(f"🔴 <b>Матч начался</b>\n{vs}\n{head}{where}{link}")
        elif g["datetime"] and not p.get("datetime"):
            out.append(f"📅 <b>Расписание утверждено</b>\n{vs}\n{when(g['datetime'])}{where}\n{head}{opp}"
                       f"\n\nОтветьте в опросе ниже, будете ли на игре. Меньше 4 игроков — поражение 20:0."
                       f" Официальная отметка — в ЛК MTGame.")
        elif p.get("datetime") and (g["datetime"] != p["datetime"] or g.get("venue") != p.get("venue")) and g["status"] != "closed":
            old_where = f", {e(p['venue'])}" if p.get("venue") else ""
            out.append(f"⚠️ <b>Игра перенесена</b>\n{vs}\nБыло: {when(p['datetime'])}{old_where}\nСтало: <b>{when(g['datetime'])}{where}</b>\n{head}{opp}")
    if out:
        out = [f"<b>ABL · {e(team)}</b>\n\n" + m for m in out]
    return out


def approved(prev: dict, new: dict) -> list:
    """Игры, у которых в этом обновлении появилась дата: для них публикуем опрос «Будешь на игре?»."""
    before = {g["id"]: g for g in prev.get("games", [])}
    return [g for g in new.get("games", [])
            if g["id"] in before and g.get("datetime") and not before[g["id"]].get("datetime")
            and g["status"] not in ("closed", "in_progress")]


def poll_question(g) -> str:
    return f"Будешь на игре? {g['us']['name']} — {g['them']['name']}, {when(g['datetime'])}"[:300]


def reminders(new: dict, now: datetime, state: dict) -> list:
    """Напоминания капитану по срокам из регламента. Возвращает [(ключ, текст)] ещё не отправленных."""
    team = new["team"]
    out = []
    for g in new.get("games", []):
        if not g.get("datetime") or g["status"] in ("closed", "in_progress"):
            continue
        t = parse(g["datetime"])
        if now >= t:
            continue
        vs = f"{e(g['us']['name'])} — {e(g['them']['name'])}"
        game = f"{vs}\n{when(t)}" + (f", {e(g['venue'])}" if g.get("venue") else "")
        key = f"pay:{g['id']}"
        if key not in state and now >= t - PAY_REMIND:
            deadline = t - PAY_BEFORE
            term = (f"Оплатить до <b>{when(deadline)}</b> — за 2 суток до матча." if now < deadline
                    else f"Срок по регламенту — {when(deadline)}. Если игра ещё не оплачена, оплатите сейчас.")
            out.append((key, f"💳 <b>Капитану: оплата игры</b>\n{game}\n{term}\n"
                             f'<a href="{ABL_TEAM_URL.format(team["id"])}">Оплатить на сайте ABL</a>'))
        key = f"apply:{g['id']}"
        if key not in state and t - APPLY_REMIND <= now < t - APPLY_BEFORE:
            out.append((key, f"📝 <b>Капитану: заявка на игру</b>\n{game}\n"
                             f"Отметьте игроков в заявке до <b>{when(t - APPLY_BEFORE)}</b> — не позднее чем за час до игры.\n"
                             f'<a href="{MTGAME_URL}">Открыть ЛК MTGame</a>'))
    # Окно пожеланий по времени (ст. 5.8): с 12:00 пн до 18:00 вт по Москве, раз в неделю, если есть игры без даты.
    msk = now.astimezone(MSK)
    in_window = (msk.weekday() == 0 and msk.hour >= 12) or (msk.weekday() == 1 and msk.hour < 18)
    undated = [g for g in new.get("games", []) if g["status"] == "draft" and not g.get("datetime")]
    week = msk.isocalendar()
    key = f"wish:{week[0]}-{week[1]}"
    if in_window and undated and key not in state:
        out.append((key, "🗓 <b>Капитану: пожелания по времени</b>\n"
                         "Окно открыто до <b>вторника, 18:00</b>. Напишите в капитанском чате турнира, когда команде удобно играть. "
                         "Потом лига утвердит расписание, и игры тура придут сюда."))
    return [(k, f"<b>ABL · {e(team['name'])}</b>\n\n" + m) for k, m in out]


def send_poll(token: str, chat: str, question: str):
    """Неанонимный опрос (видно, кто ответил). В канале Telegram разрешает только анонимные — тогда повторяем анонимно."""
    url = f"https://api.telegram.org/bot{token}/sendPoll"
    body = {"chat_id": chat, "question": question, "options": POLL_OPTIONS, "is_anonymous": False}
    r = requests.post(url, json=body, timeout=30)
    if not r.ok and "anonymous" in r.text.lower():
        r = requests.post(url, json={**body, "is_anonymous": True}, timeout=30)
    if not r.ok:
        raise RuntimeError(f"Telegram ответил {r.status_code}: {r.text[:200]}")


def send(token: str, chat: str, text: str):
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=30)
    if not r.ok:
        raise RuntimeError(f"Telegram ответил {r.status_code}: {r.text[:200]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prev", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--test", action="store_true", help="отправить тестовое сообщение со следующей игрой")
    ap.add_argument("--state", help="файл с уже отправленными напоминаниями (JSON)")
    ap.add_argument("--now", help="момент времени для проверки напоминаний, ISO 8601")
    args = ap.parse_args()
    if args.test:
        new = json.loads(Path(args.new).read_text())
        nxt = next((g for g in new["games"] if g["status"] != "closed"), None)
        site = os.environ.get("SITE_URL", "")
        text = (f"<b>ABL · {e(new['team']['name'])}</b>\n\n✅ <b>Бот подключён</b>\nСюда будут приходить: утверждённое расписание тура с опросом «Будешь на игре?», "
                f"напоминания капитану об оплате и заявке, начало матча и финальный счёт."
                + (f"\n\nСледующая игра: {e(nxt['us']['name'])} — {e(nxt['them']['name'])}, {when(nxt['datetime'])}" if nxt else "")
                + (f'\n<a href="{site}">Открыть приложение</a>' if site else ""))
        token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
        if not (token and chat):
            sys.exit("Нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID — добавьте секреты в репозиторий")
        send(token, chat, text)
        print("Тестовое сообщение отправлено")
        return
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    live = bool(token and chat) and not args.dry_run
    site = os.environ.get("SITE_URL", "")
    new = json.loads(Path(args.new).read_text())

    def deliver(text=None, poll=None):
        if not live:
            print("--- (не отправлено)\n" + (text or f"[опрос] {poll} — {' / '.join(POLL_OPTIONS)}"))
        elif poll:
            send_poll(token, chat, poll)
            print("Опрос:", poll)
        else:
            send(token, chat, text)
            print("Отправлено:", text.splitlines()[2] if len(text.splitlines()) > 2 else text)

    # 1. События по изменениям данных (нужен прошлый снимок).
    prev_path = Path(args.prev)
    if prev_path.exists():
        prev = json.loads(prev_path.read_text())
        msgs = events(prev, new, site)
        for m in msgs:
            deliver(text=m)
        for g in approved(prev, new):
            deliver(poll=poll_question(g))
        if not msgs:
            print("Событий нет")
    else:
        print("Прошлого снимка нет — события пропускаем (первый запуск)")

    # 2. Напоминания по срокам регламента (не зависят от изменений данных).
    now = parse(args.now) if args.now else datetime.now(timezone.utc)
    state_path = Path(args.state) if args.state else None
    state = json.loads(state_path.read_text()) if state_path and state_path.exists() else {}
    due = reminders(new, now, state)
    for key, text in due:
        deliver(text=text)
        state[key] = now.isoformat()
    if not due:
        print("Напоминаний нет")
    # Состояние сохраняем только после настоящей отправки: иначе пробный запуск «съест» напоминания.
    if state_path and live and due:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
