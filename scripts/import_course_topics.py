#!/usr/bin/env python3
"""Import explicit IN2106/IN2107 entries from a saved official remaining-spots page.

Download the public source first; this importer never guesses missing course facts.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from datetime import date

SOURCE = 'https://www.cit.tum.de/en/cit/studies/students/examination-matters-modules/informatics/practical-courses-seminar-courses/'
SECTIONS = {'sec5153': 'IN2107', 'sec5152': 'IN2106'}


class TopicsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.module = None
        self.parts = {code: [] for code in SECTIONS.values()}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div':
            if self.depth:
                self.depth += 1
            elif attrs.get('id') in SECTIONS:
                self.module = SECTIONS[attrs['id']]
                self.depth = 1
        if self.depth and tag in ('br', 'p'):
            self.parts[self.module].append('\n')

    def handle_endtag(self, tag):
        if self.depth and tag == 'div':
            self.depth -= 1

    def handle_data(self, text):
        if self.depth:
            self.parts[self.module].append(text)


def import_topics(source, term, checked_on):
    if not re.fullmatch(r'\d{4}[WS]', term):
        raise ValueError('Expected an academic term such as 2026W')
    date.fromisoformat(checked_on)
    text = source.decode('utf-8')
    label = f'{term[:4]}/{str(int(term[:4]) + 1)[2:]}' if term.endswith('W') else term[:4]
    season = 'Wintersemester' if term.endswith('W') else 'Sommersemester'
    if f'{season} {label}' not in text:
        raise ValueError('The source does not confirm the requested academic term')
    parser = TopicsParser()
    parser.feed(text)
    entries = []
    for section, module in SECTIONS.items():
        titles = [' '.join(line.split()) for line in ''.join(parser.parts[module]).splitlines()]
        titles = list(dict.fromkeys(title for title in titles if re.search(r'\b' + module + r'\b', title)))
        if not titles:
            raise ValueError(f'No explicitly mapped {module} entries; review source structure')
        for title in titles:
            digest = hashlib.sha256(title.encode('utf-8')).hexdigest()[:12]
            entries.append({'id': f'{module}-{term}-{digest}', 'module': module, 'title': title,
                            'term': term, 'sourceURL': SOURCE + '#' + section})
    return {'version': 1, 'sourceType': 'remaining_spots', 'checkedOn': checked_on,
            'sourceURL': SOURCE, 'sourceSHA256': hashlib.sha256(source).hexdigest(), 'entries': entries}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--source-file', required=True, type=Path)
    cli.add_argument('--term', required=True)
    cli.add_argument('--checked-on', required=True)
    cli.add_argument('--output', required=True, type=Path)
    args = cli.parse_args()
    result = import_topics(args.source_file.read_bytes(), args.term, args.checked_on)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Imported {len(result['entries'])} course topics")
