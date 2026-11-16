#!/usr/bin/env python3
"""Surveillance Pathé Casablanca — no booking, no CAPTCHA bypass.

Runs a single check; designed for systemd timer or cron. Requires Playwright Chromium.
"""
import argparse
import difflib
import hashlib
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
from notifications import configuration_errors, send_gmail, send_telegram

URL = "https://www.pathe.ma/fr/films/avengers-doomsday-55389"
DATA = Path(os.environ.get("SENTINEL_DATA", "./data"))
STATE = DATA / "last_state.json"
EVENTS = DATA / "events.jsonl"
MAX_TEXT = 10000

# These counters change regularly and are irrelevant to ticket sales.
NOISE = [
    r"^\s*\d+[,.]?\d*\s*[kK]?\s*(?:ont aimé|veulent le voir|avis au total|avis)\s*$",
    r"^\s*\d+[,.]?\d*\s*$",
    r"^\s*(?:J'ai été déçu|J'ai aimé|J'ai adoré)\s*$",
    r"^\s*(?:Noter le film|Ma liste|Avis des utilisateurs|Se connecter|Créer mon compte)\s*$",
]
BUY_RX = re.compile(r"\b(r[eé]server|billetterie|acheter|places|s[eé]ances?|horaires)\b", re.I)
OPEN_SIGNAL_RX = re.compile(r"\b(r[eé]server|choisir (?:une? )?s[eé]ance|acheter (?:mes? )?(?:billets?|places?)|s[eé]lectionner (?:une? )?s[eé]ance)\b", re.I)
EMPTY_RX = re.compile(r"il n.y a pas de s[eé]ance programm[eé]e pour ce film", re.I)
TIME_RX = re.compile(r"\b(?:[01]?\d|2[0-3])\s*[h:]\s*[0-5]\d\b", re.I)
DATE_RX = re.compile(r"\b(?:1[6-9]|2\d|3[01])\s+(?:d[eé]cembre|december)\b|\b2026-12-(?:1[6-9]|2\d|3[01])\b", re.I)
FILM_RX = re.compile(r"avengers\s*[:\-]?\s*doomsday", re.I)


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean(text):
    """Return a stable movie-related slice with volatile counters removed."""
    lines = [re.sub(r"\s+", " ", s).strip() for s in text.splitlines()]
    lines = [x for x in lines if x and not any(re.match(rx, x, re.I) for rx in NOISE)]
    combined = "\n".join(lines)
    # Remove common changing feedback/statistics, retaining the film synopsis/schedule.
    combined = re.sub(r"\b\d+[,.]?\d*\s*[kK]?\s*(?=veulent le voir|ont aimé|avis au total)", "", combined, flags=re.I)
    return combined[:MAX_TEXT]


def classify(text, controls):
    """Do not claim booking OPEN solely because the word 'réserver' appears.

    In addition to availability CTA, require an identified session/date/time
    and disappearance of the explicit 'no session' warning.
    """
    no_session = bool(EMPTY_RX.search(text))
    qualified = [x for x in controls if BUY_RX.search(x.get("text", "")) and x.get("href")]
    cta = bool(OPEN_SIGNAL_RX.search(text) or any(OPEN_SIGNAL_RX.search(x.get("text", "")) for x in qualified))
    dated = bool(DATE_RX.search(text))
    timed = bool(TIME_RX.search(text))
    # A film's release date does not establish a bookable session.
    session_word = bool(re.search(r"\b(s[eé]ances?|horaires|VO|VOST|IMAX)\b", text, re.I))
    critical = bool(not no_session and dated and timed and session_word and cta)
    if critical:
        return "BOOKING_POSSIBLE"
    if no_session:
        return "NO_SESSIONS"
    if cta and session_word:
        return "SCHEDULE_OR_CTA_CHANGED"
    if dated and timed and session_word:
        return "SESSIONS_LISTED"
    return "INFO_ONLY"


def fetch():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(locale="fr-FR", timezone_id="Africa/Casablanca", viewport={"width": 1365, "height": 900})
        resp = page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3500)
        page.locator("body").wait_for(timeout=10000)
        # Site may render schedules later than the initial DOM.
        raw = page.locator("body").inner_text(timeout=10000)
        controls = page.evaluate("""() => [...document.querySelectorAll('a,button')].map(x => ({
          text: (x.innerText||x.getAttribute('aria-label')||'').trim().slice(0,90),
          href: x.href||'', disabled: !!x.disabled
        })).filter(x=>x.text).slice(0,300)""")
        status = resp.status if resp else None
        html_title = page.title()
        browser.close()
        logging.info("Page Pathé : HTTP=%s titre=%r film_présent=%s", status, html_title, bool(FILM_RX.search(raw)))
        if status and status >= 400:
            raise RuntimeError(f"HTTP {status}")
        if not FILM_RX.search(raw):
            raise RuntimeError("Page chargée mais nom de film absent (blocage ou refonte possible)")
        return {"text": clean(raw), "controls": controls, "http_status": status, "page_title": html_title}


def read_state():
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf8"))
    return {}


def persist(state, event=None):
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf8")
    tmp.replace(STATE)
    if event:
        with EVENTS.open("a", encoding="utf8") as fh:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def diff_preview(old, new):
    lines = list(difflib.unified_diff(old.splitlines(), new.splitlines(), n=1))
    return "\n".join(lines[2:40])[:1800]


CHANNELS = ("telegram", "gmail")


def enqueue(state, subject, message):
    """Persist a pending alert before attempting either independent channel."""
    eid = hashlib.sha256((subject + "\n" + message).encode("utf8")).hexdigest()[:20]
    items = state.setdefault("outbox", [])
    if not any(item["id"] == eid for item in items):
        items.append({"id": eid, "subject": subject, "message": message,
                      "pending": list(CHANNELS), "created_at": utcnow()})
    return eid


def deliver(state):
    """Retry only failed channels. Successful deliveries are never repeated."""
    pending = state.get("outbox", [])
    for item in list(pending):
        for channel in list(item["pending"]):
            try:
                if channel == "telegram":
                    send_telegram(item["message"])
                elif channel == "gmail":
                    send_gmail(item["subject"], item["message"])
                else:
                    raise RuntimeError("Canal de notification inconnu")
                item["pending"].remove(channel)
                persist(state, {"at": utcnow(), "alert_id": item["id"],
                                "delivered_to": channel})
                logging.info("Alerte %s livrée à %s", item["id"], channel)
            except Exception as exc:
                # No secrets in error logging. Keep the channel pending for next run.
                logging.error("Notification %s impossible via %s : %s", item["id"], channel, type(exc).__name__)
        if not item["pending"]:
            pending.remove(item)
            persist(state, {"at": utcnow(), "alert_id": item["id"], "delivered_all": True})


def check(dry_run=False):
    if not dry_run:
        missing = configuration_errors()
        if missing:
            logging.error("Configuration incomplète, valeurs manquantes : %s", ", ".join(missing))
            return 2
    prior = read_state()
    now = utcnow()
    try:
        snapshot = fetch()
        text = snapshot["text"]
        relevant = sorted({(x["text"], x["href"]) for x in snapshot["controls"]
                           if BUY_RX.search(x["text"]) and x.get("href")})
        digest = hashlib.sha256((text + repr(relevant)).encode("utf8")).hexdigest()
        status = classify(text, snapshot["controls"])
        old_status = prior.get("status")
        changed = bool(prior.get("sha256") and digest != prior["sha256"])
        first = not prior.get("sha256")
        recovered = int(prior.get("failures", 0)) >= 3
        event = {"at": now, "status": status, "was": old_status,
                 "changed": changed, "http_status": snapshot["http_status"]}
        potential_open = status == "BOOKING_POSSIBLE" and old_status != "BOOKING_POSSIBLE"
        if potential_open or (not first and changed) or recovered:
            if potential_open:
                subject, heading = "🚨 [PATHÉ] Prévente Doomsday potentiellement ouverte", "🚨 BILLETTERIE POTENTIELLEMENT OUVERTE"
            elif recovered:
                subject, heading = "✅ [PATHÉ] Sentinelle rétablie", "✅ REPRISE DE LA SURVEILLANCE"
            else:
                subject, heading = "🔎 [PATHÉ] Changement sur Doomsday", "🔎 CHANGEMENT DE LA PAGE DOOMSDAY"
            change = diff_preview(prior.get("text", ""), text)
            message = (f"{heading}\nStatut : {status}\nDate du contrôle (UTC) : {now}\n"
                       "Cinéma prioritaire : Pathé Californie, Casablanca — IMAX si proposé.\n"
                       "Attention : une réservation réellement achetable n'est pas garantie par le seul texte.\n"
                       "Vérifier le parcours d'achat et choisir manuellement la dernière rangée au centre.\n"
                       f"{URL}\n\nChangements (extrait) :\n{change or 'Nouvel état détecté'}")
            if not dry_run:
                enqueue(prior, subject, message)
            event["subject"] = subject
        prior.update({"sha256": digest, "status": status, "text": text, "last_ok": now,
                      "failures": 0, "http_status": snapshot["http_status"]})
        if not dry_run:
            persist(prior, event if changed or first or recovered or potential_open else None)
            deliver(prior)
        logging.info("statut=%s modifié=%s première_lecture=%s", status, changed, first)
        return 0
    except Exception as exc:
        failures = int(prior.get("failures", 0)) + 1
        logging.error("Contrôle web échoué n=%s : %s", failures, type(exc).__name__)
        if dry_run and isinstance(exc, RuntimeError):
            logging.error("Diagnostic du contrôle public : %s", str(exc)[:300])
        event = {"at": now, "error_type": type(exc).__name__, "consecutive_failures": failures}
        prior["failures"] = failures
        if failures in (3, 12) and not dry_run:
            subject = f"⚠️ [PATHÉ] Surveillance en panne ({failures} échecs)"
            enqueue(prior, subject, (f"⚠️ SENTINELLE PATHÉ EN PANNE — {failures} contrôles consécutifs échoués.\n"
                                     f"Dernière réussite : {prior.get('last_ok', 'inconnue')}\n"
                                     f"Catégorie d'erreur : {type(exc).__name__}\n{URL}"))
        if not dry_run:
            persist(prior, event)
            deliver(prior)
        return 1


def test_alert():
    missing = configuration_errors()
    if missing:
        logging.error("Configuration incomplète, valeurs manquantes : %s", ", ".join(missing))
        return 2
    prior = read_state()
    enqueue(prior, "🧪 [PATHÉ] Test des notifications", "🧪 TEST Sentinelle Doomsday : Telegram et Gmail. Ceci n'est PAS une ouverture de billetterie.\n" + URL)
    persist(prior, {"at": utcnow(), "test_alert_queued": True})
    deliver(prior)
    return 0 if not prior.get("outbox") else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="Page check without state/notifications")
    group.add_argument("--test-alert", action="store_true", help="Send a clearly labeled test to BOTH channels")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(test_alert() if args.test_alert else check(args.dry_run))
