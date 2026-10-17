/* Student-facing course detail. Audit evidence stays in the maintenance data. */
'use strict';
const C=require('../assets/core'),e=C.esc;
const termLabel=value=>({WiSe:'冬季',SoSe:'夏季','WiSe/SoSe':'冬季／夏季','不定期':'不定期开课','一次性':'仅开设一次','自主安排':'自行安排','待核实':'待确认'}[value]||value||'待确认');
const languageLabel=value=>({EN:'英语',DE:'德语','DE/EN':'德语／英语','课程所学语言':'所学语言','待核实':'待确认'}[value]||value||'待确认');
const labels={A:'机器人学 · 二选一',B:'认知',C:'智能自主系统',D:'研讨课',E:'实践课',F:'硕士论文',G:'计算',H:'机械',I:'系统与控制',J:'跨学科基础',K:'控制理论补修'};
const unique=list=>[...new Set(list.filter(Boolean))];
const humanize=s=>String(s||'').replace('其他语言须核对非母语、分班、申请认可和已修级别，个人资格尚未确认。','这门语言课须符合非母语要求；还需确认分班、学分认可和已修级别是否合适。').replace('手册列有知识、背景或参与要求，尚未确认个人满足；请核对完整官方说明。','请先查看官方课程介绍，确认所需的知识背景和参加条件。').replace(/手册期望已学过 (.+?) 且熟练掌握内容/,'需要熟练掌握 $1 的课程内容').replace(/手册明确将 (.+?) 列为前提，并要求熟练知识；还列举 (.+?) 背景/,'需要掌握 $1 的内容，并具备 $2 的相关知识').replace(/[，；]未注明考试通过要求。/g,'。').replace(/个人适用资格/g,'选课条件').replace(/个人适用条件/g,'选课条件').replace(/当前完整模块DTO/g,'课程手册').replace(/暂不自动推荐[。；]?/g,'').replace(/，已暂停自动推荐[。]?/g,'。').replace(/；这些个人条件尚未确认。/g,'。').replace(/个人资格尚未确认。/g,'是否满足条件需要你确认。').replace(/；+$/,'。').trim();
function assessmentMarkup(text){
 const parts=String(text).match(/[^；。]+[；。]?/g)||[];
 return text.length>50&&parts.length>1?`<ul class="course-assessment-list">${parts.map(part=>`<li>${e(part)}</li>`).join('')}</ul>`:e(text);
}
function points(c){
 const v=c.verification,items=[];
 if(v?.current_academic_year_selection_verified===false)items.push('目前只能找到旧版课程说明，最新的开课季节、授课语言和先修要求还需确认。');
 else if(v){
  if(v.fields?.term==='pending')items.push('开课季节还需确认，请先查看本学期是否开课。');
  if(v.fields?.language==='pending')items.push('授课语言还需确认。');
  if(v.fields?.prerequisites==='pending')items.push(v.source_field_status?.prerequisites==='translation_conflict'?'先修要求的说明还不一致，请先向教学团队确认。':'先修要求还未确认，请先查看本学期的课程说明。');
 }
 if(!Number.isFinite(Number(c.ects)))items.push(`RCI课程目录没有提供学分${v?.handbook_ects?'，模块手册列出'+v.handbook_ects+' ECTS':''}。确认认可学分后，才能加入计划。`);
 else if(v?.fields?.ects==='pending'&&v.handbook_ects!==undefined)items.push(`RCI课程目录列出 ${c.ects} ECTS，模块手册列出 ${v.handbook_ects} ECTS。计入多少学分，请先向学校确认。`);
 if(['不定期','一次性'].includes(c.current_term||c.term_legal_annex))items.push('开课时间不固定，请先确认本学期是否开课。');
 if(['IN2067','ED160028'].includes(c.module_code))items.push('Robotics 和 Roboterdynamik für RCI 二选一，只参加其中一门的考试。');
 if(['IN2106','IN2107'].includes(c.module_code))items.push('加入计划后，还需通过 Matching 等官方流程申请具体课题和名额。');
 if(c.module_code==='IN2390')items.push('IN2389 和 IN2390 只能选一门计入学位。');
 if(c.module_code==='ED140014')items.push('是否需要补修，以你的录取要求为准；请先在计划设置中确认。');
 if(!v&&c.current_catalog_status==='needs_review')items.push('这门课仅在旧版法规附件中找到。现在能否选、如何计分，请先向学校确认。');
 if(c.j_constraints&&v?.eligibility?.requires_confirmation)items.push(...(v.review_reasons_cn||[]).filter(s=>!/^RCI目录|^官方模块手册未提供开课周期|^官方授课语言字段|^官方先修字段|^未确认实际选中|^官方周期为|^模块列有知识、背景或参与条件/.test(s)).map(humanize));
 if(c.j_constraints?.is_language_course)items.push('语言课合计最多计入6 ECTS，还需核对个人资格和已修语言课程。');
 if(c.j_constraints?.recognition_family)items.push(c.j_constraints.recognition_family_kind==='wtg_same_title'?'同名的不同学分版本，最多计入一种。':'这门课存在内容重叠的其他版本，本工具不会重复计分；实际认可请向学校确认。');
 return unique(items).filter(s=>s&&!/^资料已对照/.test(s));
}
function relatedCourses(c,catalog){
 const pairs={IN2067:'ED160028',ED160028:'IN2067',MW0538:'MW1420',MW1420:'MW0538',IN2389:'IN2390',IN2390:'IN2389'};
 const codes=new Set([pairs[c.module_code],...(c.j_constraints?.incompatible_with||[])]);
 const family=c.j_constraints?.recognition_family;
 return catalog.filter(other=>other.module_code!==c.module_code&&(codes.has(other.module_code)||family&&other.j_constraints?.recognition_family===family));
}
module.exports=function courseDetailView({course:c,translation='',summary,catalog=[],base='',relatedURL='/guides/curriculum/'}){
 const code=c.module_code,title=C.courseName(c),v=c.verification,groups=c.allowed_groups||[c.section_2025[0]],unknown=!Number.isFinite(Number(c.ects));
 const internal=(path,label,cls='')=>`<a class="${cls}" href="${e(base+path)}">${label}</a>`;
 const link=(href,label,cls='text-link')=>C.safeURL(href)?`<a class="${cls}" href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)} <span aria-hidden="true">↗</span></a>`:'';
 const book=summary?.source_type==='official_regulation'?null:summary?.source_url||(/\/modules\/detail\//.test(c.current_metadata_source||'')?c.current_metadata_source:null);
 const official=summary?.source_url||book||c.offering_url||c.current_metadata_source||c.source_regulation;
 const pre=v?.current_academic_year_selection_verified===false?'':summary?.preparation_cn||c.prerequisites?.summary_cn;
 const generic=pre&&(/语言课程须核对学习目标|本模块的资料或个人适用条件|官方德英先修字段未提供|官方先修字段未提供|手册请求实际选中/.test(pre));
 let prep=pre&&!generic?humanize(pre):'';
 if(!summary?.preparation_cn&&c.prerequisites?.kind==='none'&&/^手册明确无前置要求/.test(prep))prep='手册没有要求先修课程。';
 if(c.prerequisites?.kind==='recommended')prep=prep.replace(/^需(?:要)?(?:熟练)?掌握/,'建议先掌握').replace(/^需(?:要)?/,'建议具备');
 const historical=summary?.source_current_year===false&&summary.source_type!=='official_regulation';
 const notices=unique([...(summary?.selection_notes_cn||[]),...points(c)]).filter(s=>s!==prep&&!(historical&&s.startsWith('目前只能找到旧版课程说明')));
 const pending=unknown||c.current_catalog_status==='needs_review'||v?.eligibility?.requires_confirmation||v?.follow_up_review?.outcome==='unresolved';
 const alternatives=relatedCourses(c,catalog);
 const workload=summary?.workload_hours;
 const missing=key=>summary?.field_status?.[key]==='unclear'?'手册还没写清，请向教学团队确认。':summary?.source_type==='module_handbook'?'手册未注明。':'暂未找到可靠说明。';
 const breakdown=workload?['contact','self_study'].filter(k=>Number.isFinite(workload[k])).map(k=>(k==='contact'?'上课':'自学')+' '+workload[k]+' 小时').join(' · '):'';
 const workloadText=summary?.workload_status==='conflict'?'手册里的总时长和分项对不上，需向教学团队确认。':workload?`${Number.isFinite(workload.total)?`整个学期约 ${e(workload.total)} 小时`:''}${breakdown?`<span class="course-workload-breakdown">${e(breakdown)}</span>`:''}`:e(missing('workload'));
 const learningKnown=summary?.teaching_cn||summary?.assessment_cn;
 const courseRows=learningKnown?`<div><dt>怎么上课</dt><dd>${e(summary.teaching_cn||missing('teaching'))}</dd></div><div class="course-assessment"><dt>怎么考</dt><dd>${assessmentMarkup(summary.assessment_cn||missing('assessment'))}</dd></div>`:'';
 const period=summary?.source_period?.replace(/^(\d{4})([WS])$/,(_s,year,season)=>year+'年'+(season==='W'?'冬季':'夏季'));
 const caption=summary?.source_type==='official_regulation'?'上课和考试信息来自法规附件，当前安排需向教学团队确认。':'实际教学和考试安排以当期课程页为准。';
 const autoNote=c.automatic_recommendation_eligible===false&&!unknown?'自动规划暂不选择这门课；确认选课要求后，可以手动加入。':'';
 const conditionBody=[prep?`<p class="course-preparation">${e(prep)}</p>`:'',notices.length?`<ul class="course-condition-list">${notices.map(s=>`<li>${e(s)}</li>`).join('')}</ul>`:''].join('');
 const sourceLinks=[c.offering_url&&c.offering_url!==official?link(c.offering_url,'本学期开课'):'',link(official,book?'官方课程介绍':'查看官方依据')].filter(Boolean).join('');
 const requirements=conditionBody?`<section class="course-detail-section course-requirements" id="course-requirements"><h2>选课要求</h2>${conditionBody}${['IN2106','IN2107'].includes(code)?`<p>${internal('/guides/matching/','如何申请课题和名额 →','text-link')}</p>`:''}</section>`:'';
 const counting=c.j_constraints?`<details class="course-counting"><summary>这门课的学分怎么算</summary><ul><li>计入 J 类，至少修满 6 ECTS；多修的 J 类学分不能抵 G、H、I 类。</li><li>每门课只计一次。本科已经计入学位的限选或选修课，不能再计入硕士。</li>${c.j_constraints.is_language_course?'<li>语言课合计最多计入 6 ECTS。同一种语言 A1 至 B2 的重叠级别不能重复计入；C1 及以上的同级课程还需区分内容。</li>':''}</ul>${internal(relatedURL,'查看完整学分要求 →','text-link')}</details>`:'';
 return `<article class="course-detail" id="course-detail" data-course-code="${e(code)}">
 <div class="course-detail-back">${internal('/courses/','<span aria-hidden="true">←</span> 返回课程列表','text-link').replace('<a ', '<a data-detail-back ')}<button type="button" class="quiet course-share" data-share>复制链接</button></div>
 <div class="course-detail-layout">
 <header class="course-detail-heading"><div class="course-detail-tags"><span class="course-detail-code">${e(code)}</span>${groups.map(g=>`<span>${e(g+' · '+labels[g])}</span>`).join('')}${pending?(conditionBody?'<a class="course-detail-review" href="#course-requirements">选课条件需确认 ↓</a>':'<span class="course-detail-review">本学期要求待确认</span>'):''}</div><h1>${e(title)}</h1>${translation?`<p class="course-detail-translation">${e(translation)}</p>`:''}
 ${historical?`<p class="course-detail-history">以下按${e(period)}的${summary.source_type==='module_handbook'?'旧版手册':'官方课程页'}整理，本学期安排需确认。</p>`:''}
 ${summary?`<div class="course-detail-overview"><h2 class="sr-only">这门课学什么</h2><p${!summary.overview_cn?' class="course-content-missing"':''}>${e(summary.overview_cn||(summary.source_type==='module_handbook'?'官方手册暂未提供内容介绍。':'暂未找到官方课程内容介绍。'))}</p></div>`:''}
 <dl class="course-detail-facts"><div><dt>学分</dt><dd>${e(c.ects)}${unknown?'':' <small>ECTS</small>'}</dd></div><div><dt>通常开课</dt><dd>${e(termLabel(c.current_term||c.term_legal_annex))}${v?.fields?.term==='pending'||v?.current_academic_year_selection_verified===false?'<small class="course-fact-pending">待确认</small>':''}</dd></div><div><dt>授课语言</dt><dd>${e(languageLabel(c.current_language||c.language_legal_annex))}${v?.fields?.language==='pending'||v?.current_academic_year_selection_verified===false?'<small class="course-fact-pending">待确认</small>':''}</dd></div></dl>
 </header>
 <aside class="course-detail-side" aria-label="安排课程与官方入口">
 <section class="course-detail-plan" aria-labelledby="course-plan-title"><h2 id="course-plan-title">加入我的计划</h2>
 <div class="course-detail-actions"><label class="course-detail-target" for="detail-semester">安排到<select id="detail-semester" data-detail-semester disabled><option value="0">先选课，稍后分配</option></select></label><button type="button" class="button" data-course-detail-add disabled>${unknown?'学分待核实':'加入计划'}</button></div>
 <p class="course-detail-status" id="course-detail-status" role="status" aria-live="polite">${unknown?'学分确认前，暂不能加入计划。':'加入计划只做学期安排，不会向学校报名。'}</p><button type="button" class="quiet course-detail-undo" data-detail-undo hidden>撤销这次调整</button>${autoNote?`<p class="course-auto-note">${e(autoNote)} <a href="${conditionBody?'#course-requirements':'#course-official-links'}" class="text-link">${conditionBody?'查看要求':'查看官方介绍'} ↓</a></p>`:''}<noscript><p>加入计划需要启用JavaScript；课程内容和官方链接仍可查看。</p></noscript>
 </section>
 <nav class="course-official-links" id="course-official-links" aria-label="官方课程入口">${sourceLinks}</nav>
 ${internal('/planner/','查看我的计划 →','text-link course-plan-link')}
 </aside>
 <div class="course-detail-content">

 ${summary?.topics_cn?.length?`<section class="course-detail-section"><h2>主要内容</h2><ul class="course-topic-list">${summary.topics_cn.map(topic=>`<li>${e(topic)}</li>`).join('')}</ul></section>`:''}
 ${summary?`<section class="course-detail-section course-learning"><h2>上课与考核</h2>${learningKnown?`<dl class="course-study-details">${courseRows}</dl>`:`<p class="course-content-missing">${summary.field_status?.assessment==='unclear'?'上课方式和考试安排还需确认。':summary.source_type==='module_handbook'?'手册未提供上课方式和考试说明。':'暂未找到上课方式和考试说明。'}</p>`}<p class="course-detail-caption">${e(caption)}</p></section>`:''}
 ${requirements}
 ${workload||summary?.workload_status==='conflict'?`<section class="course-detail-section course-workload"><h2>预计投入</h2><p>${workloadText}</p>${workload?'<p class="course-detail-caption">这是整个学期的预计学习时间，包含上课和课外学习。</p>':''}</section>`:''}
 ${alternatives.length?`<section class="course-detail-section course-alternatives"><h2>选课时一起比较</h2><p class="course-detail-caption">这些课程和本课有选课或计分限制，具体要求见上方。</p><ul>${alternatives.map(other=>`<li><a data-detail-related href="${e(base+'/courses/'+other.module_code+'/')}"><span><span class="course-related-code">${e(other.module_code)}</span><strong>${e(C.courseName(other))}</strong></span><span class="course-related-credits">${e(other.ects)}${Number.isFinite(Number(other.ects))?' ECTS':''} <span aria-hidden="true">→</span></span></a></li>`).join('')}</ul></section>`:''}
 ${counting}
 <div class="course-detail-footer">${!counting?internal(relatedURL,'查看选课与学分说明 →','text-link'):''}</div>
 </div></div></article>`;
};
module.exports.points=points;
module.exports.termLabel=termLabel;
module.exports.languageLabel=languageLabel;
module.exports.relatedCourses=relatedCourses;
