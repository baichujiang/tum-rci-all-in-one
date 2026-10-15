#!/usr/bin/env python3
"""Compile reviewed public J evidence. A new handbook hash never inherits an approval."""
import argparse, collections, hashlib, json, re
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--catalog',required=True,type=Path)
parser.add_argument('--handbooks',required=True,type=Path)
parser.add_argument('--policies',required=True,type=Path)
parser.add_argument('--decisions',required=True,type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_text())
write=lambda p,d:(root/p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
modules=read(args.catalog);handbooks={r['code']:r for r in read(args.handbooks)}
policies=read(args.policies);decision_data=read(args.decisions)
decisions={r['code']:r for r in decision_data['reviews']}
bindings={r['code']:r for r in policies['module_policy_bindings']}
assert len(modules)==429 and all(not m['current_revalidation_pending'] for m in modules)
assert set(handbooks)==set(bindings)=={m['module_code'] for m in modules}
date=policies['checked_on']
norm=lambda s:re.sub(r'\s+',' ',(s or '').replace('\\r\\n',' ')).strip()
source_titles={'RCI':'RCI官方学习计划与J说明','CIT':'CIT跨学科基础：资格与计入','CIT_EN':'CIT英文说明：语言学分上限','APSO':'现行APSO：重复计入','FPSO':'RCI现行FPSO','RECOGNITION':'CIT成绩认可说明','SZ_REGISTER':'语言中心报名条件','SZ_FAQ':'语言中心常见问题','SZ_ENGLISH':'英语课程与分班','SZ_ICC':'语言中心跨文化沟通','WTG':'WTG教学项目','WTG_CATALOG':'WTG课程目录','WTG_REGISTER':'WTG报名程序','WTG_FAQ':'WTG参与及学分','PROJECTS':'TUM项目周'}
sources={s['id']:{'id':s['id'],'title':source_titles[s['id']],'url':s['url'],'checked_on':s['checked_on']} for s in policies['sources']}
families=[]
for f in policies['confirmed_WTG_same_title_different_credit_families']:
 families.append({'id':f['id'],'codes':f['codes'],'kind':'wtg_same_title','title':f['title'],'source_urls':[sources['CIT']['url'],*f['module_sources'].values()]})
for f in decision_data.get('additional_exclusive_families',[]):
 if not any(set(f['codes'])==set(x['codes']) for x in families):
  families.append({'id':f['family_id'],'codes':f['codes'],'kind':'overlap_guard','title':f['title'],'source_urls':[x['source_url'] for x in f.get('sources',[])]})
for i,f in enumerate(policies['other_variant_review_candidates']):
 if not any(set(f['codes'])==set(x['codes']) for x in families):
  families.append({'id':'overlap-variant-'+str(i+1),'codes':f['codes'],'kind':'overlap_guard','title':f['title'],'source_urls':f['source_urls']})
family_by_code={c:f for f in families for c in f['codes']}
assert sum(len(f['codes']) for f in families)==len(family_by_code),'overlapping recognition families require explicit review'
exclusions=policies['explicit_cross_code_exclusions']
records={}
for m in sorted(modules,key=lambda x:x['module_code']):
 code=m['module_code'];h=handbooks[code];b=dict(bindings[code]);decision=decisions.get(code)
 if re.search('Kantonesisch',m['name'],re.I):b['language_learning_target']='Kantonesisch'
 approved=bool(decision and decision['auto_candidate_supported'] and decision['bilingual_checked'] and decision['source_sha256']==h['raw_sha256'])
 is_language=code in policies['language_binding']['all_codes']
 term={'Wintersemester':'WiSe','Sommersemester':'SoSe','Wintersemester/Sommersemester':'WiSe/SoSe','Unregelmäßig':'不定期','Einmalig':'一次性'}.get(h.get('turnus_raw'),'待核实')
 language={'Englisch':'EN','Deutsch':'DE','Deutsch/Englisch':'DE/EN','Unterrichtete Sprache':'课程所学语言'}.get(h.get('language_raw'),'待核实')
 explicit_none=h.get('prerequisite_status')=='explicit_none'
 provided=h.get('prerequisite_status') in ['explicit_none','present']
 prerequisites_kind='none' if explicit_none else 'recommended' if approved else 'unknown' if not provided else 'conditional'
 reasons=[]
 if m['ects'] is None:reasons.append('RCI目录未提供学分；手册列'+str(h['credits']).rstrip('0').rstrip('.')+' ECTS，不能据此回填为已核实的RCI计入学分。')
 elif not h['credits_match_curriculum']:reasons.append('RCI目录为'+str(m['ects']).rstrip('0').rstrip('.')+' ECTS，当前手册为'+str(h['credits']).rstrip('0').rstrip('.')+' ECTS，来源不一致，须向学校确认。')
 if not h['current_academic_year_selection_verified']:reasons.append('未确认实际选中当前学年的模块描述，不能仅凭请求URL判定最新。')
 if term=='待核实':reasons.append('官方模块手册未提供开课周期，不能推算未来开课。')
 elif term in ['不定期','一次性']:reasons.append('官方周期为'+term+'，未核实可用于规划的具体未来班次。')
 if language=='待核实':reasons.append('官方授课语言字段为空或为占位符。')
 if not provided:reasons.append('官方先修字段为空或为占位符，不能视为没有参与要求。')
 if is_language:
  target=b['language_learning_target']
  if target=='de':reasons.append('德语须至少C1.2，并核对非母语、非德语本科及个人语言成绩认可条件。')
  elif target=='en':reasons.append('硕士英语须为C2；还需核对该课的个人资格、分班及历史计入情况。')
  else:reasons.append('其他语言须核对非母语、分班、申请认可和已修级别，个人资格尚未确认。')
  if code=='SZ0361':reasons.append('课程学习目标为德语B2.2，低于RCI德语C1.2门槛；项目周分支不能消除这一冲突。')
  if code=='SZ0471':reasons.append('模块还要求正在以英语撰写学位论文，英语分班测试须超过75%；这些个人条件尚未确认。')
 elif not approved and provided:reasons.append('模块列有知识、背景或参与条件，尚未确认可直接用于自动规划；完整条件请核对官方手册。')
 if code=='MGT000159':reasons.append('当期手册明确要求组队并携具体问题申请，尚未确认团队获准。')
 if code=='MGT001445':reasons.append('已通过MGT001407者不能再选择本模块；还需核对所列背景要求。')
 if code=='SOT87317':reasons.append('模块要求对AI伦理感兴趣，并能用英语书面表达观点；尚未核对个人满足情况。')
 if approved:reasons.append(decision['reason_cn'])
 if not reasons:reasons.append('个人适用资格与当前条件尚未完整核实，暂不自动推荐。')
 family=family_by_code.get(code)
 coverage=[]
 if is_language:
  for level in re.findall(r'(?<![A-Za-z0-9])[AB][12](?:\.[12])?(?![A-Za-z0-9])',m['name']):
   coverage.extend([level] if '.' in level else [level+'.1',level+'.2'])
 incompatible=[e['if_previously_passed_code'] for e in exclusions if e['target_code']==code]
 constraint_summary='J至少6 ECTS；J超额不替代G/H/I。每模块只计一次；本科已计入的限选或选修不可再次选入硕士。'
 if is_language:constraint_summary+='语言课合计最多计6 ECTS；A1至B2同语言重叠级别不可重复计入；C1起同级须区分内容。'
 if family:constraint_summary+=('同名不同学分版本最多计一种。' if family['kind']=='wtg_same_title' else '存在已知内容重叠，本模型不同时重复计入；实际认可须核对学校决定。')+'涉及：'+'、'.join(family['codes'])+'。'
 counting_sources=[sources[x] for x in dict.fromkeys(['RCI','CIT','APSO']+(['CIT_EN','SZ_REGISTER'] if is_language else [])+(['WTG_FAQ','WTG_REGISTER'] if 'wtg' in b['institution_scopes'] else []))]
 counting_sources+=[{'title':'当前模块完整说明','url':h['source_url']}]
 if family:counting_sources += [{'title':'同名版本／内容重叠依据','url':u} for u in family['source_urls'] if u not in {s['url'] for s in counting_sources}]
 fields={'identity':'verified' if h['identity_matches'] else 'pending','ects':'verified' if h['credits_match_curriculum'] else 'pending','groups':'verified','term':'verified' if term!='待核实' else 'pending','language':'verified' if language!='待核实' else 'pending','prerequisites':'verified' if provided else 'pending','eligibility':'verified' if approved else 'pending','counting':'verified' if h['credits_match_curriculum'] else 'pending'}
 auto=approved and not is_language and all(x=='verified' for x in fields.values()) and term in ['WiSe','SoSe','WiSe/SoSe'] and h['current_academic_year_selection_verified']
 summary=('手册明确无前置要求；仍须核对个人历史计分、实际班次与名额。' if explicit_none else decision.get('preparation_summary_cn','') if approved else '语言课程须核对学习目标、级别和个人条件；暂不自动推荐。' if is_language else '官方先修字段未提供内容，不能视为没有要求。' if not provided else '手册列有知识、背景或参与要求，尚未确认个人满足；请核对完整官方说明。')
 records[code]={'checked_on':date,'source':m['module_detail_urls'][0],'source_api':h['source_url'],'source_sha256':h['raw_sha256'],'selection_source_api':h['selection_source_url'],'selection_sha256':h['selection_sha256'],'curriculum_source_urls':m['source_tree_urls'],'current_academic_year_selection_verified':h['current_academic_year_selection_verified'],'selected_semester_id':h['selected_semester_id'],'selected_semester_label':h['selected_semester_label'],'description_semester_id':h['description_semester_id'],'handbook_ects':h['credits'],'curriculum_ects':m['ects'],'term':term,'language':language,'fields':fields,'source_field_status':{'term':'not_provided' if term=='待核实' else 'present','language':'not_provided' if language=='待核实' else 'present','prerequisites':'present' if provided else 'not_provided'},'source_field_languages':{'prerequisites':h['prerequisite_selected_language']},'prerequisite_excerpt':' '.join(norm(h.get('prerequisite_raw')).split()[:24]),'prerequisite_full_text_sha256':hashlib.sha256((h.get('prerequisite_raw') or '').encode()).hexdigest(),'prerequisites':{'kind':prerequisites_kind,'requires_confirmation':not approved,'formal_exam_pass_gate_verified':False,'summary_cn':summary},'eligibility':{'requires_confirmation':not approved,'reviewed_source_sha256':h['raw_sha256'] if approved else None,'summary_cn':'公开RCI目录归属及当前完整手册条件已对照；可作为有条件规划候选，不代替个人认可或报名。' if auto else '本模块的资料或个人适用条件仍需确认，已暂停自动推荐。'},'j_constraints':{'is_language_course':is_language,'language_target':b['language_learning_target'],'language_level_title_only':b['language_level_title_only'],'language_level_coverage':sorted(set(coverage)),'recognition_family':family['id'] if family else None,'recognition_family_kind':family['kind'] if family else None,'incompatible_with':incompatible,'policy_rule_ids':b['policy_rule_ids'],'summary_cn':constraint_summary},'counting_sources':counting_sources,'review_reasons_cn':reasons,'automatic_recommendation_eligible':bool(auto),'recommendation_note':'已核对J归属、学分与公开适用条件；个人认可和名额仍须确认。' if auto else '；'.join(r.rstrip('。') for r in reasons)+'。'}

manifest={'checked_on':date,'curriculum_version':'20241','academic_year':'2026/27','study_year_id':1623,'scope':'All actual J modules, including one missing-credit module; recognition placeholders excluded.','modules':[{k:m[k] for k in ['module_code','name','ects','accepted_sections','module_detail_ids','module_detail_urls','source_node_ids','source_pages','source_tree_urls','source_memberships','current_offering_urls']} for m in modules]}
manifest['excluded_recognition_placeholders']=read(args.catalog.parent/'j-recognition-placeholders-excluded.json')
write(Path('data/official-interdisciplinary-memberships.json'),manifest)
write(Path('data/interdisciplinary-verification.json'),{'checked_on':date,'academic_year':'2026/27','humanReview':'pending','courses':records})
current=read(root/'data/courses_current_2026.json')
for row in current:
 if row['module_code'] in records:
  v=records[row['module_code']];row.update({'review_date':date,'term':v['term'],'language':v['language'],'automatic_recommendation_eligible':v['automatic_recommendation_eligible'],'metadata_verification':'Current full official module DTO, 2026/27; see interdisciplinary-verification.json'})
write(Path('data/courses_current_2026.json'),current)
write(Path('data/interdisciplinary-review-decisions.json'),{'checked_on':date,'scope':'Full DE/EN module evidence review, no individual admission or seat approval','humanReview':'pending','reviews':[{'code':c,'source_sha256':d['source_sha256'],'auto_candidate_supported':d['auto_candidate_supported'],'bilingual_checked':d['bilingual_checked'],'reason_cn':d['reason_cn']} for c,d in sorted(decisions.items())]})
write(Path('data/j-rules.json'),{'checked_on':date,'academic_year':'2026/27','curriculum_version':'20241','humanReview':'pending','sources':list(sources.values()),'rules':policies['rules'],'minimum_ects':6,'overall_maximum_ects':None,'language_maximum_ects':6,'recognition_families':families,'explicit_cross_code_exclusions':[{k:e[k] for k in ['id','target_code','if_previously_passed_code','source_url','status','scope']} for e in exclusions],'personal_checks_not_automated':['母语与本科授课语言','已用于本科学位的限选或选修','分班／团队／选拔／导师批准与报名名额','未列明的等价或内容重叠、个人学校认可决定']})
audit=read(root/'data/catalog-audit.json');audit.update({'checked_on':date,'source_scope':'All actual G/H/I/J module identities under current public tree, including one J module with missing curriculum ECTS; recognition placeholders excluded. Not personal eligibility or current lecture registration.','fixed_credit_category_memberships':586,'category_memberships':587,'distinct_module_codes':582,'distinct_module_handbook_ids':582,'dataset_additional_rows':560,'dataset_current_file_rows':140,'dataset_interdisciplinary_added_rows':420,'dataset_distinct_module_codes':595,'dataset_matching_full_tree_module_codes':582,'new_records_matching_current_tree':560})
audit['category_counts']['J']=429;audit['coverage']['J'].update({'official_distinct_modules':429,'official_fixed_credit_modules':428,'dataset_distinct_modules':431,'matching_distinct_modules':429,'omitted_distinct_modules':0,'missing_curriculum_ects_codes':['CLA31307'],'handbook_ects_conflict_codes':['SOT10082']})
audit['verification']['scope']='All 153 distinct current professional G/H/I modules. J verification is reported separately under j_verification; historical annex-only records remain disabled.'
basefields=['identity','ects','groups','term','language','prerequisites']
audit['j_verification']={'checked_on':date,'reviewed_modules':429,'new_fixed_credit_modules':419,'new_missing_credit_modules':1,'fully_verified_metadata':sum(all(v['fields'][k]=='verified' for k in basefields) for v in records.values()),'pending_metadata':sum(any(v['fields'][k]!='verified' for k in basefields) for v in records.values()),'automatic_recommendation_eligible':sum(v['automatic_recommendation_eligible'] for v in records.values()),'not_automatically_recommended':sum(not v['automatic_recommendation_eligible'] for v in records.values()),'language_modules':sum(v['j_constraints']['is_language_course'] for v in records.values()),'full_current_handbooks':429,'recognition_family_count':len(families)}
write(Path('data/catalog-audit.json'),audit)
print(json.dumps(audit['j_verification'],ensure_ascii=False,indent=2))
