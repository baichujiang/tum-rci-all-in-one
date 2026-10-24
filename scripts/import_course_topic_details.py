#!/usr/bin/env python3
"""Build topic metadata from identity-checked public TUMonline evidence.

Chinese summaries are reviewed separately and bound to a source response hash.
The public metadata contains field hashes and availability, never source prose,
personal account identifiers, meeting links, or access codes.
"""
import argparse
from datetime import date
import json
from pathlib import Path
from research_course_topics import normalized


def assemble(catalog, records, matches, checked_on):
    date.fromisoformat(checked_on)
    courses = {record['courseId']: record for record in records if not record.get('error')}
    output = {}
    for topic in catalog['entries']:
        course = courses[matches[topic['id']]]
        titles = [title for title in course['titles'].values() if title]
        matching = [title for title in titles if normalized(title) == normalized(topic['title'])]
        if course['term'] != topic['term'] or not matching or not any(topic['module'] in title for title in matching):
            raise ValueError('Unverified topic identity: ' + topic['id'])
        organization = course['organization']
        output[topic['id']] = {
            'topicTitle': topic['title'], 'courseId': course['courseId'], 'term': course['term'],
            'officialTitle': matching[0],
            'officialURL': 'https://campus.tum.de/tumonline/ee/ui/ca2/app/desktop/#/slc.tm.cp/student/courses/' + course['courseId'],
            'sourceAPI': course['sourceAPI'], 'sourceSHA256': course['sourceSHA256'],
            'teachers': course['teachers'], 'languages': list(dict.fromkeys(filter(None, course['languages']))),
            'organization': organization.get('en') or organization.get('default') or organization.get('de') or None,
            'fields': {key: {'available': bool(field['text']), 'sha256': field['sha256']} for key, field in course['fields'].items()}
        }
    return {'version': 1, 'checkedOn': checked_on, 'records': output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--checked-on', required=True)
    parser.add_argument('--catalog', type=Path, default=Path('data/course-topics.json'))
    parser.add_argument('--output', type=Path, default=Path('data/course-topic-details.json'))
    args = parser.parse_args()
    result = assemble(json.loads(args.catalog.read_text()), json.loads((args.evidence / 'courses.json').read_text()), json.loads((args.evidence / 'matches.json').read_text()), args.checked_on)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print('Imported', len(result['records']), 'verified topic records')


if __name__ == '__main__':
    main()
