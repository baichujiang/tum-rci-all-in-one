#!/usr/bin/env python3
"""Capture public, current-term TUMonline topic evidence for editorial review.

Input links are exported from the public course search UI, not guessed IDs.
Raw responses and review text stay in the supplied evidence directory.
This command never writes student plans or publishes source descriptions.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET


def normalized(title):
    title = re.sub(r"Master['’]s\b", 'Master', title, flags=re.I)
    title = re.sub(r'\([^)]*\b(?:IN|MW|ED|SOT)\d+[^)]*\)', '', title)
    title = re.sub(r'\b(?:IN|MW|ED|SOT)\d+[._\d]*\b', '', title)
    return re.sub(r'\W+', '', unicodedata.normalize('NFKC', title).casefold())


def languages(el):
    if el is None:
        return {}
    values = {x.attrib.get('lang'): x.text or '' for x in el.findall('translations/translation')}
    values['default'] = el.findtext('value') or ''
    return values


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'br', 'li', 'div', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'div'):
            self.parts.append('\n')

    def handle_data(self, text):
        self.parts.append(text)


def plain(value):
    parser = Text()
    parser.feed(value)
    # Meeting access details are unnecessary to a public course summary.
    lines = [re.sub(r'[ \t]+', ' ', x).strip() for x in ''.join(parser.parts).splitlines()]
    return '\n'.join(x for x in lines if x and not re.search(r'passcode|password|passwort|kennwort|besprechungs.id|meeting.id|teams\.microsoft|zoom\.us', x, re.I))


def resolve_text(vals):
    pointer = re.compile(r'^(?:see|siehe|s\.)\s+(?:german|deutsche|deutschsprachige|deutsch)', re.I)
    text = vals.get('en') or vals.get('default') or vals.get('de') or ''
    if pointer.match(text.strip()) or len(text) < 180 and re.search(r'(?:please\s+)?see\s+(?:the\s+)?German\s+(?:course\s+)?description', text, re.I):
        text = vals.get('de') or vals.get('default') or ''
    cleaned = plain(text)
    if re.fullmatch(r'[-–—.\s]*', cleaned):
        cleaned = ''
    return text, cleaned


def parse_course(raw, identifier):
    root = ET.fromstring(raw)
    detail = root.find('.//cpCourseDetailDto')
    if detail is None:
        raise ValueError('No public course detail DTO')
    course = detail.find('cpCourseDto')
    if course.findtext('id') != identifier or course.findtext('semesterDto/id') != '207':
        raise ValueError('Course identity or 2026W semester does not match')
    titles = languages(course.find('courseTitle'))
    staff = []
    for person in course.findall('lectureships/identityLibDto'):
        name = ' '.join(filter(None, [person.findtext('firstName'), person.findtext('lastName')]))
        if name and name not in staff:
            staff.append(name)
    description = detail.find('cpCourseDescriptionDto')
    fields = {}
    for key in ['courseContent', 'previousKnowledge', 'courseObjective', 'teachingMethod', 'assessmentScheme', 'courseRegistrationInfo', 'additionalInformation/comments']:
        vals = languages(description.find(key)) if description is not None else {}
        selected, cleaned = resolve_text(vals)
        fields[key.split('/')[-1]] = {'text': cleaned, 'sha256': hashlib.sha256(selected.encode()).hexdigest()}
    links = []
    if description is not None:
        for link in description.findall('.//courseUrlDtoList'):
            url = link.findtext('url') or ''
            if url.startswith(('https://', 'http://')) and not url.startswith('http://https://'):
                links.append({'url': url, 'label': languages(link.find('name')).get('default') or ''})
    return {'courseId': identifier, 'term': '2026W', 'titles': titles, 'teachers': staff,
            'organization': languages(course.find('organisationResponsibleDto/name')),
            'languages': [x.findtext('languageDto/key') for x in course.findall('courseLanguageDtos')],
            'sourceAPI': f'https://campus.tum.de/tumonline/ee/rest/slc.tm.cp/student/courses/{identifier}',
            'sourceSHA256': hashlib.sha256(raw).hexdigest(), 'fields': fields, 'links': links}


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--links', type=Path, action='append', required=True)
    args.add_argument('--evidence', type=Path, required=True)
    args.add_argument('--catalog', type=Path, default=Path('data/course-topics.json'))
    cli = args.parse_args()
    cli.evidence.mkdir(parents=True, exist_ok=True)
    identifiers = set()
    for path in cli.links:
        for item in json.loads(path.read_text()):
            if not re.search(r'\bIN210[67]\b', item['title']):
                continue
            match = re.search(r'/slc\.tm\.cp/student/courses/(\d+)', item['href'])
            if match:
                identifiers.add(match[1])

    def fetch(identifier):
        path = cli.evidence / (identifier + '.xml')
        try:
            if not path.exists():
                url = f'https://campus.tum.de/tumonline/ee/rest/slc.tm.cp/student/courses/{identifier}'
                subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '30', url, '-o', str(path)], check=True, capture_output=True)
            return parse_course(path.read_bytes(), identifier)
        except Exception as error:
            return {'courseId': identifier, 'error': str(error)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(fetch, sorted(identifiers)))
    (cli.evidence / 'courses.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    matches = {}
    unresolved = []
    for topic in json.loads(cli.catalog.read_text())['entries']:
        candidates = [r for r in records if not r.get('error') and any(normalized(title) == normalized(topic['title']) for title in r['titles'].values())]
        if len(candidates) == 1:
            matches[topic['id']] = candidates[0]['courseId']
        else:
            unresolved.append({'id': topic['id'], 'title': topic['title'], 'candidates': [r['courseId'] for r in candidates]})
    (cli.evidence / 'matches.json').write_text(json.dumps(matches, ensure_ascii=False, indent=2) + '\n')
    (cli.evidence / 'unresolved.json').write_text(json.dumps(unresolved, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'courses': len(records), 'failures': sum('error' in r for r in records), 'matched': len(matches), 'unresolved': len(unresolved)}), flush=True)


if __name__ == '__main__':
    main()
