#!/usr/bin/env python3
"""Read-only official source audit. Python stdlib + curl. Outputs stay outside the public site."""
from pathlib import Path
import concurrent.futures, subprocess, json, xml.etree.ElementTree as E, re, time, hashlib

import argparse, datetime
from handbook_fields import resolve_values
parser=argparse.ArgumentParser(description='Fetch official RCI handbooks for the frozen 2026/27 membership snapshot; never edits recommendation decisions.')
parser.add_argument('--output', required=True, type=Path, help='Evidence directory outside the public repository')
args=parser.parse_args()
ROOT=args.output.resolve(); ROOT.mkdir(parents=True,exist_ok=True)
project=Path(__file__).resolve().parents[1]
if ROOT==project or project in ROOT.parents: raise SystemExit('Evidence output must be outside the public repository')
snapshot=json.loads((project/'data/official-professional-memberships.json').read_text())
SOURCE_DATE=datetime.date.today().isoformat()
bycode={}
for row in snapshot['modules']:
 item={'code':row['module_code'],'title':row['name'],'credits':row['ects'],'memberships':[{'section':s,'credits':row['ects'],'node_ids':row['source_node_ids'],'source_pages':row['source_page']} for s in row['accepted_sections']],'ids':set(row['module_detail_ids'])}
 bycode[item['code']]=item
assert len(bycode)==153, len(bycode)

def lang_values(el):
 if el is None: return {'value':None,'translations':{}}
 return {'value':el.findtext('value'),'translations':{x.attrib.get('lang'):x.text or '' for x in el.findall('translations/translation')}}
def value(el):
 lv=lang_values(el)
 return lv['value'] if lv['value'] is not None else lv['translations'].get('de') or lv['translations'].get('en')
def norm(s):return re.sub(r'\s+',' ',(s or '').replace('\\r\\n','\n').replace('\xa0',' ')).strip()
def semester(el):
 if el is None:return None
 return {'id':el.findtext('id'),'name':value(el.find('name')),'short_name':value(el.find('shortName')),'children':{x.tag:x.text for x in el if len(x)==0}}
def fetch(item):
 ids=sorted(item['ids']);id=ids[0]
 url=f'https://campus.tum.de/tumonline/ee/rest/slc.cm.reg/student/modules/detail/light/{id}/study-year/1623'
 path=ROOT/(id+'.xml');record={'code':item['code'],'expected_title':item['title'],'expected_curriculum_credits':item['credits'],'accepted_memberships':item['memberships'],'module_detail_id':id,'all_module_detail_ids':ids,'source_url':url,'source_date':SOURCE_DATE,'requested_study_year_id':'1623','requested_academic_year':'2026/27','errors':[],'warnings':[],'raw_xml_path':str(path)}
 try:
  if True:
   temp=ROOT/(id+'.download')
   out=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','40','--retry','1',url,'-o',str(temp)],capture_output=True,text=True)
   if out.returncode:raise RuntimeError('HTTP fetch failed: '+out.stderr.strip())
   temp.replace(path)
  raw=path.read_bytes();record['raw_sha256']=hashlib.sha256(raw).hexdigest()
  root=E.fromstring(raw);d=root.find('.//moduleTemplateDetailDto')
  if d is None:raise RuntimeError('No moduleTemplateDetailDto in response')
  record.update({'title':value(d.find('name')),'title_translations':lang_values(d.find('name')),'credits':float(d.findtext('credits/value')) if d.findtext('credits/value') else None,'credit_variation_hint':lang_values(d.find('credits/hint')),'identification':d.findtext('identification'),'response_module_id':d.findtext('id'),'selected_semester_id':d.findtext('selectedSemesterId'),'selected_semester_label':'2026W' if d.findtext('selectedSemesterId')=='207' else None,'is_fallback_active':d.findtext('isFallbackActive'),'description_id':d.findtext('nodeDescription/id'),'description_semester_id':d.findtext('nodeDescription/semesterId'),'description_status':{'key':d.findtext('nodeDescription/nodeDescriptionStatusDto/key'),'name':value(d.find('nodeDescription/nodeDescriptionStatusDto/name'))},'description_valid_from_semester':semester(d.find('validFromSemester')),'description_valid_from_field_present':d.find('validFromSemester') is not None,'links':[x.attrib for x in root.findall('.//link')]})
  fields=[]
  for field in d.findall('nodeDescription/nodeDescriptionGroupingDtos/nodeDescriptionValueDtos'):
   fields.append({'id':field.findtext('id'),'label':value(field.find('descriptionName')),'label_translations':lang_values(field.find('descriptionName')),'values':lang_values(field.find('descriptionValues')),'value':value(field.find('descriptionValues')),'datatype':field.findtext('dataType')})
  record['source_fields']=fields
  def select(label):return next((x for x in fields if x['label']==label),None)
  for key,label in [('turnus','Turnus'),('language','Sprache'),('prerequisite','(Empfohlene) Voraussetzungen'),('module_level','Modulniveau'),('assessment','Beschreibung der Studien-/Prüfungsleistungen')]:
   x=select(label);resolved=resolve_values(x['values'] if x else None)
   record[key+'_field_present']=x is not None
   record[key+'_raw']=resolved['value'];record[key+'_default_raw']=x['values']['value'] if x else None
   record[key+'_translations']=x['values'] if x else None;record[key+'_status']=resolved['status']
   record[key+'_selected_language']=resolved['selected_language'];record[key+'_default_status']=resolved['default_status']
   record[key+'_language_values']=resolved['language_values']
  raw_prereq=norm(record['prerequisite_raw'])
  record['prerequisite_semantics']='recommended_background_field' if record['prerequisite_field_present'] else 'unverified'
  if record['prerequisite_status']=='present' and re.fullmatch(r'(keine\.?|keine voraussetzungen\.?|none\.?|no prerequisites\.?|no prior knowledge required\.?|there are no prerequisites\.?|es werden keine inhaltlichen voraussetzungen benötigt\.?)',raw_prereq,re.I):record['prerequisite_status']='explicit_none'
  record['identity_matches']=record['identification']==record['code'] and record['response_module_id']==id
  record['title_matches']=norm(record['title'])==norm(record['expected_title'])
  record['credits_match_curriculum']=record['credits'] is not None and all(record['credits']==float(m['credits']) for m in record['accepted_memberships'])
  record['current_academic_year_selection_verified']=record['selected_semester_id']=='207' and record['is_fallback_active']=='false'
  if record['selected_semester_id']!='207':
   semester_url=next((x['href'] for x in record['links'] if x.get('name')=='availableSemesters'),None)
   if semester_url:
    semester_path=ROOT/(id+'.available-semesters.xml')
    if not semester_path.exists():
     response=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','40',semester_url,'-o',str(semester_path)],capture_output=True,text=True)
     if response.returncode:raise RuntimeError('Available-semesters fetch failed: '+response.stderr.strip())
    sr=E.fromstring(semester_path.read_bytes());labels={x.findtext('id'):value(x.find('optionText')) for x in sr.findall('.//selectableSemesterLibDto')}
    record['selected_semester_label']=labels.get(record['selected_semester_id']);record['available_semesters']=labels;record['available_semesters_source_url']=semester_url
  if not record['identity_matches']:record['errors'].append('Response identity does not match requested curriculum module')
  if not record['credits_match_curriculum']:record['errors'].append('Handbook credit value differs from current RCI curriculum value; curriculum-specific adjudication needed')
  if not record['current_academic_year_selection_verified']:record['errors'].append('Current-year selected semester/fallback not verified')
  if not record['title_matches']:record['warnings'].append('Current-tree title differs from handbook title; preserve both and verify alias')
  if len(ids)!=1:record['warnings'].append('Multiple description IDs for code')
  if record['description_status']['key']!='BE_OK':record['errors'].append('Module description not marked finished')
  for key in ['turnus','language','prerequisite']:
   if record[key+'_status'] in ['missing_field','blank','not_provided']:record['warnings'].append(key+' field is '+record[key+'_status']+'; do not treat as none')
  record['field_read_complete']=all(record[k+'_field_present'] for k in ['turnus','language','prerequisite'])
 except Exception as ex:record['errors'].append(str(ex))
 return record

results=[];started=time.monotonic()
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for idx,record in enumerate(pool.map(fetch,sorted(bycode.values(),key=lambda x:x['code'])),1):
  results.append(record)
  if idx%25==0: print('fetched',idx,'/',len(bycode),'elapsed',round(time.monotonic()-started,1),flush=True)
out=ROOT/'handbooks.json';out.write_text(json.dumps(results,ensure_ascii=False,indent=2))
summary={'count':len(results),'responses':sum('title' in r for r in results),'with_errors':[{'code':r['code'],'errors':r['errors']} for r in results if r['errors']],'warnings':[{'code':r['code'],'warnings':r['warnings']} for r in results if r['warnings']],'prerequisite_status_counts':{s:sum(r.get('prerequisite_status')==s for r in results) for s in ['present','explicit_none','blank','missing_field','not_provided']},'selected_semesters':sorted(set(r.get('selected_semester_id') or 'missing' for r in results)),'fallback_counts':{s:sum(r.get('is_fallback_active')==s for r in results) for s in ['false','true']},'out':str(out)}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
