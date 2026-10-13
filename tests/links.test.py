"""A HEAD error must not classify a working GET destination as a dead link."""
import contextlib
import csv
import io
import pathlib
import runpy
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/check_links.py"


class Response:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class LinkChecks(unittest.TestCase):
    def check(self, responses):
        methods = []

        def request(req, timeout):
            methods.append(req.get_method())
            value = responses[len(methods) - 1]
            if isinstance(value, Exception):
                raise value
            if value >= 400:
                raise urllib.error.HTTPError(req.full_url, value, "test response", {}, None)
            return Response(value)

        with tempfile.TemporaryDirectory() as directory:
            output = pathlib.Path(directory) / "links.csv"
            argv = [str(SCRIPT), "--limit", "1", "--sleep", "0", "--output", str(output)]
            with patch.object(sys, "argv", argv), patch("urllib.request.urlopen", request), contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(SCRIPT), run_name="__main__")
            with output.open(encoding="utf-8-sig", newline="") as file:
                row = next(csv.DictReader(file))
        return row, methods

    def test_head_not_found_get_works(self):
        for status in (404, 410):
            with self.subTest(status=status):
                row, methods = self.check([status, 200])
                self.assertEqual(row["status"], "OK")
                self.assertEqual(methods, ["HEAD", "GET"])

    def test_get_confirms_missing_destination(self):
        row, methods = self.check([404, 404])
        self.assertEqual(row["status"], "POSSIBLY_DEAD")
        self.assertEqual(methods, ["HEAD", "GET"])

    def test_failed_get_is_unknown(self):
        row, _ = self.check([404, urllib.error.URLError("timeout")])
        self.assertEqual(row["status"], "UNKNOWN")

    def test_supported_head_does_not_request_body(self):
        row, methods = self.check([200])
        self.assertEqual(row["status"], "OK")
        self.assertEqual(methods, ["HEAD"])

    def test_throttling_remains_blocked_without_retry(self):
        row, methods = self.check([429])
        self.assertEqual(row["status"], "LOGIN_OR_BLOCKED")
        self.assertEqual(methods, ["HEAD"])

    def test_method_not_allowed_falls_back_to_get(self):
        row, methods = self.check([405, 200])
        self.assertEqual(row["status"], "OK")
        self.assertEqual(methods, ["HEAD", "GET"])


if __name__ == "__main__":
    unittest.main()
