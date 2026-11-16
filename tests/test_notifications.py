import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sentinel
from notifications import configuration_errors, send_gmail


class DualChannelTest(unittest.TestCase):
    def test_enqueue_deduplicates_same_alert(self):
        state = {}
        a = sentinel.enqueue(state, "subject", "message")
        b = sentinel.enqueue(state, "subject", "message")
        self.assertEqual(a, b)
        self.assertEqual(len(state["outbox"]), 1)
        self.assertEqual(state["outbox"][0]["pending"], ["telegram", "gmail"])

    def test_failed_gmail_does_not_resend_telegram(self):
        state = {}
        sentinel.enqueue(state, "subject", "message")
        with patch.object(sentinel, "persist") as store, \
             patch.object(sentinel, "send_telegram") as tg, \
             patch.object(sentinel, "send_gmail", side_effect=[RuntimeError("smtp down"), None]) as gm:
            sentinel.deliver(state)
            tg.assert_called_once_with("message")
            self.assertEqual(gm.call_count, 1)
            self.assertEqual(state["outbox"][0]["pending"], ["gmail"])
            sentinel.deliver(state)
            tg.assert_called_once_with("message")
            self.assertEqual(gm.call_count, 2)
            self.assertEqual(state["outbox"], [])
            self.assertGreaterEqual(store.call_count, 1)

    def test_gmail_message_uses_tls(self):
        env = {"GMAIL_USER": "sender@example.com", "GMAIL_TO": "recipient@gmail.com",
               "GMAIL_APP_PASSWORD": "abcd efgh ijkl mnop"}
        with patch.dict(os.environ, env, clear=True), patch("notifications.smtplib.SMTP_SSL") as cls:
            smtp = cls.return_value.__enter__.return_value
            send_gmail("[PATHÉ] test", "Ceci est un test")
            cls.assert_called_once()
            self.assertEqual(cls.call_args.args[:2], ("smtp.gmail.com", 465))
            smtp.login.assert_called_once_with("sender@example.com", "abcdefghijklmnop")
            message = smtp.send_message.call_args.args[0]
            self.assertEqual(message["To"], "recipient@gmail.com")
            self.assertIn("test", message["Subject"])

    def test_requires_both_channels_configured(self):
        with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "xyz"}, clear=True):
            self.assertIn("GMAIL_TO", configuration_errors())
            self.assertIn("TELEGRAM_CHAT_ID", configuration_errors())


if __name__ == "__main__":
    unittest.main()
