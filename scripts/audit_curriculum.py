#!/usr/bin/env python3
"""Audit the complete public RCI curriculum; never edits website data or approvals.

Store downloaded HTML and JSON outside the repository. Distinguish real module
nodes from exam topics, offerings, and recognition placeholders. Blank curriculum
credits remain unknown even when a handbook has a numeric credit value.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
from html import unescape
import json
from pathlib import Path
import re
import subprocess

PROJECT = Path(__file__).resolve().parents[1]
TREE = ('https://campus.tum.de/tumonline/pl/ui/$ctx;design=pl;header=max;lang=DE/'
        'wbstpcs.showSpoTree?pStStudiumNr=&pStpStpNr=5271&pStartSemester=W'
        '&pSjNr=1623&pFilterType=20&pPageNr={}&pStpKnotenNr=')
GROUPS = {'Wahlpflichtmodule Robotics': 'A', 'Pflichtmodule Cognition': 'B',
          'Pflichtmodule Intelligent Autonomous Systems': 'C', 'Pflichtmodul Seminar': 'D',
          'Pflichtmodul Praktikum': 'E', "Master's Thesis": 'F',
          'Wahlmodule Computation': 'G', 'Wahlmodule Mechanics': 'H',
          'Wahlmodule Systems and Control': 'I', 'Wahlmodule Überfachliche Grundlagen': 'J'}


def clean(text):
    return re.sub(r'\s+', ' ', unescape(re.sub('<[^>]+>', ' ', text))).strip()


def parse_page(html, page):
    if ('Studienjahr 2026/27' not in html or
            'Robotics, Cognition, Intelligence (20241, Masterstudium' not in html):
        raise ValueError(f'Page {page}: response curriculum/year not verified')
    selected = re.search(r'<option\b(?=[^>]*\bvalue="(\d+)")(?=[^>]*\bselected)[^>]*>', html)
    total = re.search(r'</select>\s*von\s+(\d+)', html)
    if not selected or int(selected[1]) != page or not total:
        raise ValueError(f'Page {page}: pagination response not verified')
    rows = []
    for match in re.finditer(r'<tr\b([^>]*\bid="kn(\d+)"[^>]*)>([\s\S]*?)</tr>', html):
        attrs, node, body = match.groups()
        title = re.search(r'<span\b[^>]*class="KnotenText[^>]*title="([^"]*)"[^>]*>([\s\S]*?)</span>', body)
        cells = re.findall(r'<td\b[^>]*>([\s\S]*?)</td>', body, re.I)
        if not title or len(cells) != 5:
            raise ValueError(f'Page {page}, node {node}: unexpected tree schema')
        rows.append({'node_id': node, 'page': page, 'type': unescape(title[1]).strip(),
                     'label': clean(title[2]), 'ects_raw': clean(cells[3]),
                     'ancestor_ids': re.findall(r'\bkn(\d+)\b', re.search(r'class="([^"]*)"', attrs)[1]),
                     'module_detail_ids': sorted(set(re.findall(r'/modules/detail/light/(\d+)/study-year/1623', body)))})
    if not rows:
        raise ValueError(f'Page {page}: empty tree')
    return int(total[1]), rows


def inventory(rows):
    nodes = {row['node_id']: row for row in rows}
    if len(nodes) != len(rows):
        raise ValueError('Duplicate tree node IDs across pages')
    modules, placeholders = {}, []
    for row in rows:
        if 'Modulknoten' not in row['type']:
            continue
        identity = re.fullmatch(r'\[([^]]+)\]\s*(.*)', row['label'])
        if not identity:
            raise ValueError('Module identity missing: ' + row['node_id'])
        code, name = identity.groups()
        if name.startswith('Anerkennung'):
            placeholders.append({'module_code': code, 'node_id': row['node_id'], 'page': row['page']})
            continue
        groups = {GROUPS[nodes[n]['label']] for n in row['ancestor_ids'] if nodes[n]['label'] in GROUPS}
        if len(groups) != 1 or len(row['module_detail_ids']) != 1:
            raise ValueError('Unresolved module group or handbook: ' + code)
        raw = row['ects_raw']
        if raw and not re.fullmatch(r'\d+(?:[,.]\d+)?', raw):
            raise ValueError('Unexpected curriculum credit syntax: ' + code + ' ' + raw)
        credits = float(raw.replace(',', '.')) if raw else None
        module = modules.setdefault(code, {'module_code': code, 'name': name, 'ects': credits,
                                          'groups': [], 'module_detail_ids': [], 'source_node_ids': [], 'source_pages': []})
        if module['name'] != name or module['ects'] != credits:
            raise ValueError('Conflicting repeated module identity: ' + code)
        for key, values in [('groups', groups), ('module_detail_ids', row['module_detail_ids']),
                            ('source_node_ids', [row['node_id']]), ('source_pages', [row['page']])]:
            module[key] = sorted(set(module[key]) | set(values))
    return sorted(modules.values(), key=lambda m: m['module_code']), placeholders


def reconcile(modules, courses):
    site = {c['module_code']: c for c in courses}
    if len(site) != len(courses):
        raise ValueError('Website has duplicate module codes')
    diffs = {'missing_codes': [], 'site_only_codes': sorted(set(site) - {m['module_code'] for m in modules}),
             'name_mismatches': [], 'ects_mismatches': [], 'group_mismatches': []}
    for module in modules:
        code = module['module_code']
        if code not in site:
            diffs['missing_codes'].append(code)
            continue
        course = site[code]
        if course.get('module_name_current', course['module_name_legal_2025']) != module['name']:
            diffs['name_mismatches'].append(code)
        expected = '待核实' if module['ects'] is None else format(module['ects'], 'g')
        if course['ects'] != expected:
            diffs['ects_mismatches'].append(code)
        if sorted(course.get('allowed_groups', [course['section_2025'][0]])) != module['groups']:
            diffs['group_mismatches'].append(code)
    return diffs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--saved-pages', type=Path, help='Reparse an existing capture without claiming a new source read')
    parser.add_argument('--production', default='https://tum-rci-all-in-one.vercel.app', help='Deployed site to compare')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == PROJECT or PROJECT in output.parents:
        parser.error('Evidence output must be outside the repository')
    output.mkdir(parents=True, exist_ok=True)
    pages_root = args.saved_pages or output

    def fetch(url, path):
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '70',
                        '--retry', '1', url, '-o', str(path)], check=True, capture_output=True)

    if not args.saved_pages:
        fetch(TREE.format(1), output / 'tree-1.html')
    total, _ = parse_page((pages_root / 'tree-1.html').read_text(), 1)
    if not args.saved_pages:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda page: fetch(TREE.format(page), output / f'tree-{page}.html'), range(2, total + 1)))
    rows, sources = [], []
    for page in range(1, total + 1):
        raw = (pages_root / f'tree-{page}.html').read_bytes()
        count, records = parse_page(raw.decode(), page)
        if count != total:
            raise ValueError('Pagination changed during capture; repeat audit')
        rows.extend(records)
        sources.append({'page': page, 'url': TREE.format(page), 'sha256': hashlib.sha256(raw).hexdigest()})
    modules, placeholders = inventory(rows)
    manifest = {'academic_year': '2026/27', 'curriculum_version': '20241', 'study_year_id': 1623,
                'source_read': 'saved_capture' if args.saved_pages else datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source_pages': sources, 'source_tree_rows': len(rows), 'modules': modules,
                'excluded_recognition_placeholders': placeholders}
    (output / 'curriculum.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    local = json.loads(subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(require("./scripts/load-courses")()))'], cwd=PROJECT))
    deployed_path = output / 'production-planner-data.json'
    fetch(args.production.rstrip('/') + '/assets/planner-data.json', deployed_path)
    deployed = json.loads(deployed_path.read_text())['courses']
    report = {'official_modules': len(modules), 'source_pages': total, 'source_tree_rows': len(rows),
              'local': reconcile(modules, local), 'production': reconcile(modules, deployed)}
    policy = json.loads((PROJECT / 'data/official-curriculum.json').read_text()).get('site_omissions', {})
    report['site_omissions'] = policy
    for key in ['local', 'production']:
        report[key]['unexpected_missing_codes'] = sorted(set(report[key]['missing_codes']) - set(policy.get('module_codes', [])))
    (output / 'reconciliation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
