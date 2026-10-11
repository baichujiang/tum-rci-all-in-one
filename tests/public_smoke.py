#!/usr/bin/env python3
"""Read-only anonymous HTTP checks against this project's public production domain.
No auth headers, cookies, bypass links or personal data are used.
These checks do not execute browser JavaScript or replace a student usability test.
"""
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORIGIN = "https://tum-rci-all-in-one.vercel.app"
RESULTS = []

class SameOrigin(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).netloc != urllib.parse.urlsplit(ORIGIN).netloc:
            raise RuntimeError("Unexpected cross-origin redirect; public site may require login")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

opener = urllib.request.build_opener(SameOrigin())

def get(path, expected=200):
    req = urllib.request.Request(ORIGIN + path, headers={"User-Agent": "RCI-Public-Smoke/1.0"})
    try:
        response = opener.open(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status = response.code
        text = response.read(2_000_000).decode("utf-8")
        assert status == expected, f"{path}: HTTP {status}, wanted {expected}"
        assert "Authentication Required" not in text, f"{path}: authentication page"
        return text

def check(name, fn):
    try:
        fn()
        RESULTS.append({"check": name, "passed": True})
        print("PASS", name, flush=True)
    except Exception as error:
        RESULTS.append({"check": name, "passed": False, "error": str(error)})
        print("FAIL", name, str(error), flush=True)

def contains(path, expected):
    body = get(path)
    assert expected in body, f"{path}: expected page content missing"

for route, marker in [
    ("/", "你想查什么？"),
    ("/guides/matching/", "实验课、研讨课怎么选？"),
    ("/guides/exams/", "选了课，还需要报名考试吗？"),
    ("/courses/IN2067/", "IN2067"),
    ("/search/", 'id="search-app"'),
    ("/planner/", 'id="planner"'),
    ("/assets/site.js", "RCISearch.search"),
    ("/assets/site.css", ".task-grid"),
]:
    check("anonymous 200 " + route, lambda route=route, marker=marker: contains(route, marker))

def index_check():
    data = json.loads(get("/assets/search-index.json"))
    assert len(data["docs"]) == 229
    assert any(d.get("code") == "IN2067" for d in data["docs"])
check("anonymous search data: 229 records", index_check)

def build_check():
    info = json.loads(get("/build-info.json"))
    assert info["version"] == "3.0.0"
    assert info["pages"] == 75
    assert info["searchRecords"] == 229
    assert info["origin"] == ORIGIN, "Production origin not reflected in build"
check("production build and canonical origin", build_check)
check("anonymous sitemap", lambda: contains("/sitemap.xml", ORIGIN + "/guides/matching/"))
check("missing path returns 404", lambda: get("/rci-smoke-missing-page/", 404))

report = {"origin": ORIGIN, "checked_at": datetime.now(timezone.utc).isoformat(),
          "mode": "anonymous HTTP; no cookies or credentials; not browser E2E",
          "results": RESULTS}
pathlib.Path("reports").mkdir(exist_ok=True)
pathlib.Path("reports/public-smoke.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
assert all(r["passed"] for r in RESULTS), "Public HTTP checks failed; inspect the report"
print(f"{len(RESULTS)} public HTTP checks passed", flush=True)
