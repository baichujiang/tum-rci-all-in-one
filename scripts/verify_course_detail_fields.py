#!/usr/bin/env python3
"""Check published content fingerprints against fresh official handbook XML.

The XML directory stays outside the repository. API navigation links can vary
between requests, so freshness is checked on the actual selected content fields.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as E

ROOT = Path(__file__).resolve().parents[1]
LABELS = {
    'overview': 'Inhalt', 'syllabus': 'Inhalt',
    'outcomes': 'Angestrebte Lernergebnisse',
    'teaching': 'Lehr- und Lernmethode',
    'assessment': 'Beschreibung der Studien-/Prüfungsleistungen',
    'total': 'Gesamtstunden', 'contact': 'Präsenzstunden',
    'self_study': 'Eigenstudiumstunden',
}


def check_fields(code, record, xml):
    node = E.fromstring(xml).find('.//moduleTemplateDetailDto')
    assert node is not None, f'{code}: missing handbook'
    match = re.search(r'/modules/detail/(\d+)/(\d+)$', record['source_api'])
    assert match and node.findtext('id') == match[1], f'{code}: wrong module ID'
    assert node.findtext('identification') == code, f'{code}: wrong module code'
    assert node.findtext('selectedSemesterId') == match[2], f'{code}: wrong semester'
    fields = {}
    for field in node.findall('nodeDescription/nodeDescriptionGroupingDtos/nodeDescriptionValueDtos'):
        names = field.find('descriptionName')
        label = names.findtext('value')
        translations = {v.attrib.get('lang'): v.text or '' for v in names.findall('translations/translation')}
        label = translations.get('de') or label
        values = field.find('descriptionValues')
        fields[label] = {'default': values.findtext('value') or '', **{
            v.attrib.get('lang'): v.text or '' for v in values.findall('translations/translation')
        }}
    for key, label in LABELS.items():
        saved = record['fields'][key]
        assert label in fields, f'{code}: missing source field {key}'
        value = fields[label].get(saved['lang'], '')
        actual = hashlib.sha256(value.encode()).hexdigest()
        assert actual == saved['sha256'], f'{code}: changed {key} ({saved["lang"]})'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xml-dir', required=True, type=Path)
    args = parser.parse_args()
    evidence = json.loads((ROOT / 'data/course-content-evidence.json').read_text())
    count = 0
    for code, record in evidence['courses'].items():
        if record['source_type'] != 'module_handbook':
            continue
        check_fields(code, record, (args.xml_dir / (code + '.xml')).read_bytes())
        count += 1
    assert count == 593, f'Expected 593 source handbooks, got {count}'
    print(f'{count} official handbooks match all published content-field fingerprints')


if __name__ == '__main__':
    main()
