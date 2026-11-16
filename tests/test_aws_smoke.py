"""Offline tests for AWS preflight classification; no Pathé requests."""
import importlib.util
import io
import json
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "aws_smoke.py"
spec = importlib.util.spec_from_file_location("aws_smoke", MODULE_PATH)
aws_smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aws_smoke)


class SmokeTests(unittest.TestCase):
    def test_empty_403_not_usable(self):
        r = aws_smoke.signals(403, "")
        self.assertFalse(r["usable"])
        self.assertFalse(r["film_name_seen"])

    def test_http_200_without_movie_not_usable(self):
        self.assertFalse(aws_smoke.signals(200, "Access denied")["usable"])

    def test_movie_visible_without_sessions(self):
        r = aws_smoke.signals(200, "Avengers : Doomsday. Il n'y a pas de séance programmée pour ce film")
        self.assertTrue(r["usable"])
        self.assertTrue(r["explicit_no_sessions"])

    def test_movie_visible_with_schedules_does_not_claim_booking(self):
        r = aws_smoke.signals(200, "Avengers: Doomsday — 16 décembre 20h IMAX Réserver")
        self.assertTrue(r["usable"])
        self.assertFalse(r["explicit_no_sessions"])
        self.assertNotIn("booking_open", r)

    def test_200_no_film_without_sessions_not_usable(self):
        r = aws_smoke.signals(200, "Il n'y a pas de séance programmée pour ce film")
        self.assertFalse(r["usable"])

    def test_main_http_success(self):
        with patch.object(aws_smoke, "http_probe", return_value={"mode": "http", **aws_smoke.signals(200, "Avengers: Doomsday")}):
            with redirect_stdout(io.StringIO()) as output:
                status = aws_smoke.main(["--mode", "http"])
        self.assertEqual(status, 0)
        self.assertTrue(json.loads(output.getvalue())["any_usable"])

    def test_main_http_failure(self):
        with patch.object(aws_smoke, "http_probe", return_value={"mode": "http", **aws_smoke.signals(403, "")}):
            with redirect_stdout(io.StringIO()) as output:
                status = aws_smoke.main(["--mode", "http"])
        self.assertEqual(status, 1)
        self.assertFalse(json.loads(output.getvalue())["any_usable"])

    def test_both_probes_run(self):
        with patch.object(aws_smoke, "http_probe", return_value={"mode": "http", **aws_smoke.signals(403, "")}), \
             patch.object(aws_smoke, "browser_probe", return_value={"mode": "browser", **aws_smoke.signals(200, "Avengers : Doomsday")}):
            with redirect_stdout(io.StringIO()) as output:
                status = aws_smoke.main(["--mode", "both"])
        self.assertEqual(status, 0)
        self.assertEqual(len(json.loads(output.getvalue())["results"]), 2)


if __name__ == "__main__":
    unittest.main()
