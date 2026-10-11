#!/usr/bin/env python3
"""Offline data validation for the TUM RCI resource repository. Only Python stdlib."""
from pathlib import Path
import csv,sys,re,json,collections
root=Path(__file__).resolve().parents[1]

def rows(path):
    with (root/path).open(encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))

links=rows('data/resources.csv')
mods=rows('data/courses_legal_2025.csv')
topics=rows('data/topics_ws2026_27.csv')
events=rows('data/events_deadlines.csv')
errors=[]
assert len(links)>0 and len(mods)>0
ids=[x['id'] for x in links]
if len(ids)!=len(set(ids)): errors.append('Duplicate resource IDs')
for x in links:
    if not re.match(r'^https://\S+$',x['url']): errors.append('Bad HTTPS URL: '+x['id'])
code=[x['module_code'] for x in mods]
if len(code)!=len(set(code)): errors.append('Duplicate module code')
if len(mods)!=35: errors.append(f'Expected 35 rows in the 2025 original annex, got {len(mods)}')
mand=sum(int(x['ects']) for x in mods if x['section_2025'][0] in 'BCDE')
if mand+6!=43: errors.append(f'Core lecture/seminar/practical not 43 ECTS: {mand+6}')
if sum(int(x['ects']) for x in mods if x['section_2025']=='F Thesis') != 30: errors.append('Thesis !=30')
for code in ['IN2067','ED160028','ED140014']:
    if code not in [x['module_code'] for x in mods]:errors.append('Missing '+code)
if set(x['module'] for x in topics)!={'IN2106','IN2107'}: errors.append('Non-core seminar/practical ID found')
if len(set(x['id'] for x in topics))!=len(topics):errors.append('Duplicate topic IDs')
for x in events:
    if not re.match(r'^\d{4}-\d{2}-\d{2}$',x['date']):errors.append('Malformed date '+x['date'])
print(f'Resource URLs: {len(links)} entries / {len(set(x["url"] for x in links))} unique; modules: {len(mods)}; topic snapshot: {len(topics)}; events: {len(events)}')
print('Groups:', dict(collections.Counter(x['section_2025'] for x in mods)))
print('Core = 43 / standard electives = 41+6 / thesis = 30, conditional ED140014 shifts GHI electives to 36')
if errors:
    print('ERROR:', *errors,sep='\n- ');sys.exit(1)
print('OK - offline integrity checks passed')
