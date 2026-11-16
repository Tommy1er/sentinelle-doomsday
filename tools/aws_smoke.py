#!/usr/bin/env python3
"""One-shot, read-only connectivity check for the official Pathé film page.

No proxy, CAPTCHA handling, authentication, persistence or notification.
The result is a diagnostic, not a ticket availability guarantee.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

TARGET = "https://www.pathe.ma/fr/films/avengers-doomsday-55389"
NO_SESSION_RX = re.compile(r"il n.y a pas de s[eé]ance programm[eé]e pour ce film", re.I)
FILM_RX = re.compile(r"avengers\s*[:\-]?\s*doomsday", re.I)


def signals(status, content):
    """Return only high-level observations, never a 'booking open' claim."""
    return {
        "http_status": status,
        "film_name_seen": bool(FILM_RX.search(content)),
        "explicit_no_sessions": bool(NO_SESSION_RX.search(content)),
        "usable": bool(status == 200 and FILM_RX.search(content)),
    }


def http_probe():
    # Simple HTTP control probe. A 403 does NOT prove the same host blocks a real browser.
    req = Request(TARGET, headers={"User-Agent": "SentinelleDoomsday/diagnostic (+read-only)"})
    try:
        with urlopen(req, timeout=20) as response:
            data = response.read(1_000_000)
            status = response.status
            encoding = response.headers.get_content_charset() or "utf-8"
        text = data.decode(encoding, errors="replace")
        return {"mode": "http", **signals(status, text)}
    except HTTPError as exc:
        return {"mode": "http", **signals(exc.code, ""), "error_type": "HTTPError"}
    except (URLError, TimeoutError, OSError) as exc:
        return {"mode": "http", **signals(None, ""), "error_type": type(exc).__name__}


def browser_probe():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"mode": "browser", **signals(None, ""),
                "error_type": "PlaywrightNotInstalled"}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            try:
                page = browser.new_page(locale="fr-FR", timezone_id="Africa/Casablanca")
                response = page.goto(TARGET, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(3000)
                status = response.status if response else None
                text = page.locator("body").inner_text(timeout=15000)
                return {"mode": "browser", **signals(status, text)}
            finally:
                browser.close()
    except Exception as exc:
        return {"mode": "browser", **signals(None, ""),
                "error_type": type(exc).__name__}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pathé AWS smoke test (read-only)")
    parser.add_argument("--mode", choices=["http", "browser", "both"], default="http")
    args = parser.parse_args(argv)
    results = []
    if args.mode in ("http", "both"):
        results.append(http_probe())
    if args.mode in ("browser", "both"):
        results.append(browser_probe())
    report = {"at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "target": TARGET, "results": results,
              "any_usable": any(r["usable"] for r in results)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["any_usable"] else 1


if __name__ == "__main__":
    sys.exit(main())
