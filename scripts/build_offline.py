#!/usr/bin/env python3
"""Build optional offline viewer from canonical CSV/JSON/Markdown. Python stdlib only."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def main():
    paths = [*sorted((ROOT / 'data').glob('*.csv')), ROOT / 'content/editorial.json', *sorted((ROOT / 'guides').glob('*.md'))]
    data = {p.relative_to(ROOT).as_posix(): p.read_text(encoding='utf-8-sig') for p in paths}
    (ROOT / 'assets/offline-data.js').write_text('/* Generated snapshot. Rebuild after editing source data. */\nwindow.RCI_OFFLINE = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<script defer src="assets/app.js"></script>', '<script defer src="assets/offline-data.js"></script><script defer src="assets/app.js"></script>')
    (ROOT / 'offline.html').write_text(html, encoding='utf-8')
    print(f'Offline viewer built from {len(paths)} canonical files. Open offline.html; do not edit generated files.')
if __name__ == '__main__':
    main()
