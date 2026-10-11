#!/usr/bin/env python3
"""Low-rate public-source change detector; fingerprints only, never republication.
The machine baseline means 'previous successful fetch', NOT reviewed/approved content.
First run establishes a baseline. Failures never count as unchanged or reviewed.
"""
import argparse
import hashlib
import html.parser
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ALLOWED_HOSTS = {'www.cit.tum.de', 'www.tum.de'}
AGENT = 'TUM-RCI-All-in-One-SourceCheck/2.0'
MAX_BYTES = 2_000_000

def safe_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.hostname not in ALLOWED_HOSTS or p.username or p.password or p.port not in (None, 443):
        raise ValueError('URL outside the public-source allowlist')
    if any(x in p.path.lower() for x in ('login', 'moodle', 'auth', 'account')):
        raise ValueError('Authenticated endpoints are not monitored')
    return url

class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl)
        if urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            raise ValueError('Cross-origin redirect requires manual review')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(SameOriginRedirect())

def fetch(url, cap=MAX_BYTES):
    safe_url(url)
    request = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
    with OPENER.open(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError(f'Unexpected HTTP {response.status}')
        body = response.read(cap + 1)
        if len(body) > cap:
            raise ValueError('Response exceeds size limit')
        if response.headers.get_content_type() not in ('text/html', 'text/plain'):
            raise ValueError('Non-text response: requires manual review')
        return body.decode(response.headers.get_content_charset() or 'utf-8', errors='replace')

class VisibleText(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.main_depth = 0; self.all_text = []; self.main_text = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'header', 'footer'):
            self.skip += 1
        if tag == 'main':
            self.main_depth += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'header', 'footer'):
            self.skip = max(0, self.skip - 1)
        if tag == 'main':
            self.main_depth = max(0, self.main_depth - 1)
    def handle_data(self, data):
        if not self.skip and data.strip():
            self.all_text.append(data)
            if self.main_depth:
                self.main_text.append(data)

def fingerprint(raw):
    parser = VisibleText(); parser.feed(raw)
    normalized = ' '.join(' '.join(parser.main_text or parser.all_text).split())
    if len(normalized) < 100:
        raise ValueError('Page too short; possibly login, blocking, or an error page')
    return hashlib.sha256(normalized.encode()).hexdigest()

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline', default='.cache/source-fingerprints.json')
    ap.add_argument('--out', default='reports')
    args = ap.parse_args()
    baseline_path = ROOT / args.baseline
    if baseline_path.exists():
        previous = json.loads(baseline_path.read_text())
        if not isinstance(previous, dict):
            raise ValueError('Invalid fingerprint cache')
    else:
        previous = {}
    latest = dict(previous)
    sources = json.loads((ROOT / 'content/editorial.json').read_text())['sources']
    checked_at = datetime.now(timezone.utc).isoformat()
    robots_cache = {}; results = []
    for source in (s for s in sources if s.get('watch')):
        url = source['url']; item = {'id': source['id'], 'url': url, 'checked_at': checked_at, 'human_review': 'pending'}
        try:
            safe_url(url)
            p = urllib.parse.urlsplit(url); origin = f'{p.scheme}://{p.netloc}'
            if origin not in robots_cache:
                robots = urllib.robotparser.RobotFileParser()
                try:
                    raw = fetch(origin + '/robots.txt', 256_000)
                    robots.parse(raw.splitlines())
                    robots_cache[origin] = robots
                except Exception:
                    robots_cache[origin] = None
            robots = robots_cache[origin]
            if robots is None:
                item['status'] = 'robots_unavailable'; item['note'] = 'Skipped conservatively; no permission inferred.'
            elif not robots.can_fetch(AGENT, url):
                item['status'] = 'robots_disallowed'
            else:
                delay = max(3, robots.crawl_delay(AGENT) or robots.crawl_delay('*') or 0)
                rate = robots.request_rate(AGENT) or robots.request_rate('*')
                if rate:
                    delay = max(delay, rate.seconds / max(rate.requests, 1))
                if delay > 60:
                    raise ValueError('Long crawl delay: defer to manual checking')
                time.sleep(delay)
                digest = fingerprint(fetch(url))
                before = previous.get(source['id'], {})
                old = before.get('sha256') if before.get('url') == url else None
                item.update(status='baseline_created' if not old else ('unchanged' if old == digest else 'changed'), sha256=digest, previous_sha256=old)
                latest[source['id']] = {'url': url, 'sha256': digest, 'fetched_at': checked_at}
        except Exception as exc:
            item.update(status='error', note=str(exc)[:250])
        results.append(item)
    out = ROOT / args.out; out.mkdir(parents=True, exist_ok=True)
    (out / 'source-check.json').write_text(json.dumps({'checked_at':checked_at,'meaning':'Machine comparison only; never approval. No source text stored.','results':results}, indent=2, ensure_ascii=False) + '\n')
    lines = ['# Public-source fingerprint check', '', 'Machine metadata only. A change is not a confirmed rule change; unchanged is not human approval.', '', '| Source | Status |', '|---|---|']
    lines += [f'| {x["id"]} | {x["status"]} |' for x in results]
    lines += ['', 'First run establishes a machine baseline. Review changed sources manually before editing CSV or Chinese explanations.', 'No reviewed dates, source text, or website content are automatically published.']
    (out / 'source-check.md').write_text('\n'.join(lines) + '\n')
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_path.write_text(json.dumps(latest, indent=2) + '\n')
    print('\n'.join(lines))
    if any(x['status'] in ('error', 'robots_unavailable') for x in results):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
