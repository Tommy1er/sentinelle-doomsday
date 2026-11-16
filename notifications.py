"""Independent Telegram and Gmail SMTP delivery for Pathé Sentinel.

Credentials are loaded exclusively from environment variables on the host.
"""
from email.message import EmailMessage
import json
import os
import smtplib
import ssl
import urllib.parse
import urllib.request


def configuration_errors():
    needed = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GMAIL_USER", "GMAIL_APP_PASSWORD", "GMAIL_TO"]
    return [name for name in needed if not os.environ.get(name, "").strip()]


def send_telegram(message):
    token = os.environ["TELEGRAM_BOT_TOKEN"].strip()
    chat_id = os.environ["TELEGRAM_CHAT_ID"].strip()
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": message[:3900],
        "disable_web_page_preview": "true",
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    with urllib.request.urlopen(req, timeout=25) as response:
        result = json.load(response)
    if not result.get("ok"):
        raise RuntimeError("Telegram a refusé la notification")


def send_gmail(subject, message):
    sender = os.environ["GMAIL_USER"].strip()
    recipient = os.environ["GMAIL_TO"].strip()
    password = os.environ["GMAIL_APP_PASSWORD"].strip().replace(" ", "")
    email = EmailMessage()
    email["From"] = sender
    email["To"] = recipient
    email["Subject"] = subject
    email.set_content(message + "\n\nMessage automatique de Sentinelle Doomsday.\n")
    # Google personal Gmail SMTP with a per-app password. Never log password.
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=25, context=ssl.create_default_context()) as smtp:
        smtp.login(sender, password)
        smtp.send_message(email)
