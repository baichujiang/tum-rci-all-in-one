#!/usr/bin/env node
/* Build the public student site from versioned facts and editorial content. No dependencies. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),finalOut=path.join(root,'dist');
const C=require('../assets/core.js'),e=C.esc;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const nav=JSON.parse(read('content/navigation.json')),ed=JSON.parse(read('content/editorial.json')),community=JSON.parse(read('content/community.json'));
const courses=C.csv(read('data/courses_legal_2025.csv')),resources=C.csv(read('data/resources.csv')),topics=C.csv(read('data/topics_ws2026_27.csv'));
const currentCatalog=JSON.parse(read('data/courses_current_2026.json')),details=JSON.parse(read('data/course-details.json')),rules=JSON.parse(read('data/rci-rules.json'));
for(const row of currentCatalog){
 if(!row.automatic_recommendation_eligible||!row.module_detail_urls?.every(C.safeURL)||!row.review_date||!['G','H','I','J'].includes(row.section?.[0]))throw new Error('Current course evidence incomplete: '+row.module_code);
 const existing=courses.find(c=>c.module_code===row.module_code);
 if(existing){existing.current_term=row.term;existing.current_language=row.language;continue;}
 courses.push({module_code:row.module_code,module_name_legal_2025:row.name,section_2025:row.section,ects:String(row.ects),term_legal_annex:row.term,language_legal_annex:row.language,current_term:row.term,current_language:row.language,type:'扩展选修',notes_cn:'官方公开 RCI 课程树（20241、2026/27 学年）扩展模块；手册周期不是当期名额或时间承诺。',rule_cohort:'2024夏季起 · 请核对个人TUMonline归类',source_regulation:row.module_detail_urls[0],last_reviewed:row.review_date,catalog_source:'current',offering_url:row.current_offering_urls[0],allowed_groups:row.accepted_sections.map(x=>x[0])});
}
for(const c of courses){
 if(c.module_code==='IN2346')c.current_term='WiSe/SoSe';
 const record=details[c.module_code];
 if(record&&Object.keys(record).some(k=>k!=='offerings'))throw new Error('Teaching evidence must be nested under offerings: '+c.module_code);
 for(const value of Object.values(record?.offerings||{})){
  if(!C.safeURL(value.source)||!value.checkedOn||!['full','partial','missing'].includes(value.coverage)||!Array.isArray(value.sessions)||value.sessions.some(s=>!Number.isInteger(s.day)||s.day<0||s.day>6||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end>1440||s.start>=s.end))throw new Error('Invalid teaching times: '+c.module_code);
 }
}
const courseCodes=new Set();
for(const c of courses){
 if(!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(c.module_code||'')||c.module_code!==c.module_code.trim())throw new Error('Invalid module code in course CSV');
 if(courseCodes.has(c.module_code))throw new Error('Duplicate module code in course CSV: '+c.module_code);courseCodes.add(c.module_code);
 if(!/^\d+(?:\.\d+)?$/.test(c.ects||'')||!Number.isFinite(Number(c.ects))||Number(c.ects)<=0)throw new Error('Invalid course ECTS: '+c.module_code);
 if(!C.courseGroups[c.section_2025?.[0]])throw new Error('Invalid course group: '+c.module_code);
 if(!c.module_name_legal_2025?.trim())throw new Error('Missing original course name: '+c.module_code);
}
const resourceMap=new Map(resources.map(r=>[r.id,r]));
const resourceGroups=new Map();
for(const r of resources){const key=r.url.replace(/[/]$/,'');if(!resourceGroups.has(key))resourceGroups.set(key,[]);resourceGroups.get(key).push(r);}
const favoriteGroups=[...resourceGroups.values()].filter(records=>records.length>1).map(records=>records.map(r=>r.id));
const sources=new Map([...ed.sources,...nav.sources].map(s=>[s.id,s]));
const guides=nav.guides.map(g=>({...ed.articles.find(a=>a.id===g.id),...g}));
const taskMap=new Map(nav.tasks.map(t=>[t.id,t])),guideMap=new Map(guides.map(g=>[g.id,g]));
const base=(process.env.BASE_PATH||'').replace(/\/$/,'');
if(base&&!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base))throw new Error('Invalid BASE_PATH');
let origin=process.env.SITE_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL:'');
if(origin){
 let parsed;try{parsed=new URL(origin);}catch(_){throw new Error('SITE_URL must be an origin without trailing slash');}
 if(!/^https?:\/\/[^/]+$/.test(origin)||origin.includes('\\')||/\s/.test(origin)||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw new Error('SITE_URL must be an origin without trailing slash');
 origin=parsed.origin;
}
const url=p=>base+p;
const repo='https://github.com/baichujiang/tum-rci-all-in-one';
const siteName='TUM RCI All-in-One';
const write=(p,s)=>{const f=path.join(out,p.replace(/^\//,''));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const internal=(p,label,cls='')=>`<a class="${cls}" href="${e(url(p))}">${e(label)}</a>`;
const ext=(u,label,cls='button secondary')=>C.safeURL(u)?`<a class="${cls}" href="${e(C.safeURL(u))}" target="_blank" rel="noopener noreferrer">${e(label)} <span aria-hidden="true">↗</span></a>`:'';
const resLink=(id,label,cls)=>{const r=resourceMap.get(id);return r?ext(r.url,label||r.title,cls):'';};
const badge=(s,k='')=>`<span class="badge ${k}">${e(s)}</span>`;
const state=s=>({checked:'已对照公开页 · 待人工审核',mixed:'部分已对照 · 其余待复核',needs_review:'规则待复核，请先看官方原文',original:'原创导航建议 · 入口需再次核对',inherited:'历史目录快照 · 待复核'}[s]||'待复核');
const guideUrl=id=>'/guides/'+id+'/';
const groupNames=C.courseGroups;
const V=require('./student_views')({nav,community,e,url,resLink,internal,resourceMap,safeURL:C.safeURL,courseGroups:C.courseGroups,creditOriginalNames:C.creditOriginalNames});
const allPages=[],docs=[];
const out=fs.mkdtempSync(path.join(root,'.site-build-'));
process.on('exit',()=>{try{fs.rmSync(out,{recursive:true,force:true});}catch(_){}});
function searchForm(value='',id='search-q'){
 return `<form role="search" class="searchbar" action="${url('/search/')}" method="get"><label class="sr-only" for="${id}">搜索问题、课程或资源</label><input id="${id}" name="q" type="search" maxlength="160" value="${e(value)}" placeholder="例如：实验课怎么选、机器学习、IN2067" autocomplete="off"><button class="button" type="submit">搜索 <span aria-hidden="true">→</span></button></form>`;
}
function shell(p,title,desc,body,{noindex=false,home=false,planner=false}={}){
 const canonical=origin?origin+url(p):'';
 const pageTitle=home?siteName:title+' · '+siteName;
 const studying=p==='/study/'||p.startsWith('/courses/')||p==='/planner/';
 const navLink=(href,label,active,cls='')=>`<a class="${cls}" href="${url(href)}"${active?' aria-current="page"':''}>${label}</a>`;
 const mainNav=navLink('/','常用网站',home)+navLink('/study/','选课与学分',studying,'desktop-legacy')+navLink('/study/','选课指南',p==='/study/','desktop-only')+navLink('/courses/','选课程',p.startsWith('/courses/'),'desktop-only')+navLink('/planner/','我的计划 <span class="plan-badge" data-plan-count hidden>0</span>',p==='/planner/','desktop-only');
 const headerActions=`<div class="header-actions"><a class="header-favorites" href="${url('/#bookmarks')}" aria-label="我的收藏"${p==='/favorites/'?' aria-current="page"':''}>${V.icon('star')}<span class="favorites-label">我的收藏</span><span class="favorites-label-mobile" aria-hidden="true">收藏</span><span class="save-badge" data-save-count hidden>0</span></a><a class="header-plan" href="${url('/planner/')}" aria-label="我的计划"${p==='/planner/'?' aria-current="page"':''}>${V.icon('plan')}<span class="plan-label">我的计划</span><span class="plan-badge" data-plan-count hidden>0</span></a></div>`;
 const feedbackLink=`<a class="header-feedback" href="${url('/feedback/?from='+encodeURIComponent(p))}" aria-label="快速反馈">${V.icon('message')}<span>反馈</span></a>`;
 const mobileNav=`<nav class="mobile-bottom-nav" aria-label="手机主导航">${navLink('/',V.icon('grid')+'<span>常用网站</span>',home)}${navLink('/study/',V.icon('book')+'<span>选课指南</span>',studying&&p!=='/planner/')}${navLink('/planner/',V.icon('plan')+'<span>我的计划</span>',p==='/planner/')}</nav>`;
 const dialog=`<dialog id="action-dialog" class="action-dialog" aria-labelledby="dialog-title"><form method="dialog"><button class="dialog-close quiet" value="cancel" aria-label="关闭">×</button><span class="dialog-symbol">${V.icon('plan')}</span><h2 id="dialog-title"></h2><p id="dialog-description"></p><div class="dialog-actions"><button class="button secondary" value="cancel">取消</button><button id="dialog-confirm" class="button" value="confirm">确认</button></div></form></dialog>`;

 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(pageTitle)}</title><meta name="application-name" content="${e(siteName)}"><meta name="description" content="${e(desc)}"><meta name="rci-base" content="${e(base)}"><meta name="rci-favorite-groups" content="${e(JSON.stringify(favoriteGroups))}"><meta name="theme-color" content="#21473f" media="(max-width: 960px)"><meta name="theme-color" content="#0065bd" media="(min-width: 961px)"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">${noindex?'<meta name="robots" content="noindex,follow">':''}${canonical?`<link rel="canonical" href="${e(canonical)}"><meta property="og:url" content="${e(canonical)}">`:''}<meta property="og:title" content="${e(pageTitle)}"><meta property="og:site_name" content="${e(siteName)}"><meta property="og:description" content="${e(desc)}"><meta property="og:type" content="website"><link rel="icon" href="${url('/assets/favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${url('/assets/site.css')}"><script defer src="${url('/assets/core.js')}"></script><script defer src="${url('/assets/search.js')}"></script><script defer src="${url('/assets/backup-core.js')}"></script><script defer src="${url('/assets/local-lock.js')}"></script><script defer src="${url('/assets/site.js')}"></script><script defer src="${url('/assets/backup-ui.js')}"></script>${home?`<script defer src="${url('/assets/community.js')}"></script>`:''}${planner?`<script defer src="${url('/assets/timetable-core.js')}"></script><script defer src="${url('/assets/planning-engine.js')}"></script><script defer src="${url('/assets/calendar.js')}"></script><script defer src="${url('/assets/plan-export.js')}"></script><script defer src="${url('/assets/course-picker.js')}"></script><script defer src="${url('/assets/planner.js')}"></script><script defer src="${url('/assets/planning-controls.js')}"></script><script defer src="${url('/assets/timetable.js')}"></script><script defer src="${url('/assets/plan-sharing.js')}"></script>`:''}${p==='/feedback/'?`<script defer src="${url('/assets/feedback.js')}"></script>`:''}</head><body><a class="skip" href="#main">跳到正文</a><header class="header"><div class="header-inner">${internal('/','rci.','logo')}<a class="brand" href="${url('/')}">TUM RCI <b>All-in-One</b></a><nav class="desktop-nav" aria-label="主导航">${mainNav}</nav>${headerActions}${feedbackLink}</div></header><main id="main" tabindex="-1" class="container ${home?'home':p==='/courses/'?'courses-page':p==='/planner/'?'planner-page':''}">${home||studying?'':`<div class="breadcrumb">${internal('/','首页')}<span>/</span><span>${e(title)}</span></div>`}${body}</main><footer class="footer"><div><b>TUM RCI All-in-One</b><p>独立学生社群项目 · 非 TUM 官方网站。中文为辅助说明，学校原文与个人记录优先。</p></div><div>${internal('/feedback/?from='+encodeURIComponent(p),'快速反馈','footer-feedback')}${internal('/sources/','来源说明')}${internal('/resources/','更多资料')}${ext(repo,'维护仓库','text-link')}</div></footer>${mobileNav}${dialog}${V.backupDialog()}<div id="toast" role="status" aria-live="polite" aria-atomic="true"></div><noscript><p class="noscript">正文和官方链接无需 JavaScript；搜索筛选、收藏和学分规划需启用 JavaScript。</p></noscript></body></html>`;
 write(p==='/'?'index.html':p==='/404.html'?'404.html':p.replace(/^\//,'')+'index.html',html);
 allPages.push({path:p,title,noindex});
}
const intro=(title,desc,kicker='学生办事导航')=>`<div class="intro"><p class="eyebrow">${e(kicker)}</p><h1>${e(title)}</h1><p class="lead">${e(desc)}</p></div>`;
function guideCard(g){return `<article class="card"><div class="card-top">${badge(taskMap.get(g.task)?.title||'指南')}<span aria-hidden="true">↗</span></div><h3>${internal(guideUrl(g.id),g.title)}</h3><p>${e(g.summary)}</p></article>`;}
function resourceCard(r){return `<article class="card resource" id="${e(r.id)}"><div class="card-top">${badge(r.category.replace(/^\d+_/,''))}${badge(/历史|2023|2021/.test(r.title)?'历史资料':'入口收录')}</div><h3>${ext(r.url,r.title,'title-link')}</h3><p>${e(r.description_cn)}</p><p class="meta">${e(r.publisher)} · ${e(r.access)}<br>原记录：${e(r.review_date||'无日期')}，未逐条重新核实</p><div class="card-bottom"><button class="quiet" data-save="${e(r.id)}" aria-pressed="false">收藏</button></div></article>`;}
function courseCard(c){return `<article class="card"><div class="card-top"><span class="code">${e(c.module_code)}</span>${badge(groupNames[c.section_2025[0]])}</div><h3>${internal('/courses/'+c.module_code+'/',c.module_name_legal_2025)}</h3><p class="english">${e(ed.course_names_zh[c.module_code]||'')}</p><div class="course-meta"><b>${e(c.ects)} <small>ECTS</small></b><span>${e(c.term_legal_annex)} · ${e(c.language_legal_annex)}</span></div><div class="card-bottom"><button class="quiet" data-add="${e(c.module_code)}">加入计划</button></div></article>`;}
const resourceDisplayIds=new Set(nav.resource_display_ids||[]);
for(const id of resourceDisplayIds)if(!resourceMap.has(id))throw new Error('Unknown resource display ID: '+id);
const uniqueResources=[...resourceGroups.values()].map(records=>{
 const preferred=records.filter(r=>resourceDisplayIds.has(r.id));
 if(preferred.length>1)throw new Error('Multiple display records for resource URL: '+records[0].url);
 const chosen=preferred[0]||records.at(-1);
 return {...records.at(-1),title:chosen.title,description_cn:chosen.description_cn};
});
shell('/','常用网站，一步直达。','常用网站入口与 RCI 选课、学分规划。',V.home(),{home:true});
shell('/feedback/','快速反馈','提出缺少的网站入口、功能建议或使用问题。',V.feedback(),{noindex:true});
shell('/favorites/','我的收藏','收藏的网站和资料，直接打开继续使用。',V.favorites(),{noindex:true});
shell('/study/','选课与学分','看懂学分结构，选课程并加入自己的计划。',V.study());
for(const t of nav.tasks){
 const selected=t.resources.map(id=>resourceMap.get(id)).filter(Boolean);
 shell('/tasks/'+t.id+'/',t.title,t.subtitle,`${intro(t.title,t.subtitle)}<div class="task-links">${nav.tasks.filter(x=>x.id!==t.id).map(x=>internal('/tasks/'+x.id+'/',x.title,'chip')).join('')}</div><div class="section-title"><h2>先找你的问题</h2></div><div class="card-grid">${t.guides.map(id=>guideCard(guideMap.get(id))).join('')}</div><div class="section-title"><h2>直接办事 / 常用入口</h2></div><div class="card-grid">${selected.map(resourceCard).join('')}</div><div class="next-panel">${t.id==='study'?internal('/courses/','打开课程目录','button')+' '+internal('/planner/','我的学分计划','button secondary'):t.id==='research'?internal('/research/','浏览研究组与课题','button'):internal('/search/?task='+t.id,'搜索这一类内容','button')}${internal('/resources/?task='+t.id,'更多相关资源 →','text-link')}</div>`);
}
const archiveToGuide={};for(const g of guides)for(const id of g.archive||[])archiveToGuide[id]=g.id;
function legacy(id){const g=ed.guides.find(x=>x.id===id);if(!g)return '';return `<details class="supplement"><summary>补充阅读：${e(g.title)}（历史整理）</summary><div class="notice">以下保留 ${e(g.last_recorded)} 的早期整理，没有因网站升级而全部复核。与上方说明冲突或涉及当前事项时，以官方原文为准。</div>${C.markdown(read(g.path),u=>{if(C.safeURL(u))return C.safeURL(u);const file=path.posix.normalize(path.posix.join('guides',u));const other=ed.guides.find(x=>x.path===file);if(other)return url(guideUrl(archiveToGuide[other.id]||'help'));if(file.startsWith('data/'))return url('/downloads/'+path.posix.basename(file));return '';})}</details>`;}
for(const g of guides){
 const refs=(g.sources||[]).map(id=>sources.get(id)).filter(Boolean);
 const stateNote=state(g.status),last=refs.filter(s=>s.checked_on).map(s=>s.checked_on).sort().at(-1);
 const topSources=`<p class="meta">${e(g.cohort||'请核对个人适用条件')}<br>${e(stateNote)}${last?' · 来源对照 '+e(last):' · 未新增事实核验'}<br>页面整理 ${nav.edited_on}，不等于所有事实已更新。</p>`;
 const extra=(g.sections||[]).map(s=>`<section><h2>${e(s.heading)}</h2><p>${e(s.text.replaceAll('第二版','本工具'))}</p></section>`).join('');
 const body=`${intro(g.title,'',taskMap.get(g.task).title)}<article class="answer-page"><div class="answer"><p class="eyebrow">先看答案</p><p>${e(g.summary)}</p></div>${topSources}${g.status==='needs_review'?'<div class="notice">此规则仍待复核；不要仅依据本站做报名或毕业判断。</div>':''}<div class="actions">${g.links.slice(0,2).map(id=>resLink(id)).join('')}${g.id==='curriculum'?internal('/planner/','打开学分计划','button'):''}<button class="quiet" data-share>复制本页链接</button></div><section><h2>接下来这样做</h2><ol class="steps">${g.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol></section>${extra}${g.id==='application'?'<details class="supplement"><summary>我的申请核对清单（仅此浏览器）</summary><div id="application-checklist">正在读取…</div></details>':''}<section><h2>官方入口与相关资料</h2><div class="link-list">${g.links.map(id=>resLink(id,null,'source-link')).join('')}</div>${refs.map(s=>`<p class="meta">${ext(s.url,s.title,'text-link')}<br>核对范围：${e(s.scope)}<br>对照日期：${e(s.checked_on||'未完成')} · 人工审核待完成</p>`).join('')}${!refs.length?'<p class="meta">本页为原创使用方法与入口导航，未将外部网页全文转载。入口收录不代表实时空位、个人资格或当前流程已获确认。</p>':''}</section>${(g.archive||[]).map(legacy).join('')}<div class="next-panel">${internal('/tasks/'+g.task+'/','返回'+taskMap.get(g.task).title,'button secondary')}${internal('/feedback/?type=problem&from='+encodeURIComponent(url(guideUrl(g.id))),'反馈这个页面','text-link')}</div></article>`;
 shell(guideUrl(g.id),g.title,g.summary,body);
 const long=(g.archive||[]).map(id=>read(ed.guides.find(x=>x.id===id).path)).join(' ');
 docs.push({id:'guide:'+g.id,kind:'guide',title:g.title,summary:g.summary,aliases:g.aliases,body:g.steps.join(' ')+' '+(g.sections||[]).map(s=>s.text).join(' ')+' '+long,url:guideUrl(g.id),tasks:[g.task],status:stateNote,cohort:g.cohort,historical:false});
}
shell('/guides/','按问题找答案','每个主题只有一个主要入口，历史整理在对应页面的补充阅读里。',intro('按问题找答案','不用比较 v1 和 v2，选择你现在要解决的问题。')+nav.tasks.map(t=>`<section><div class="section-title"><h2>${e(t.title)}</h2></div><div class="card-grid">${t.guides.map(id=>guideCard(guideMap.get(id))).join('')}</div></section>`).join(''));
for(const c of courses){
 const code=c.module_code,title=c.module_name_legal_2025,translation=ed.course_names_zh[code]||'';
 shell('/courses/'+code+'/',title+' · '+code,c.notes_cn||c.module_name_legal_2025,`${intro(title,translation,code)}<article class="answer-page"><div class="answer course-facts"><div><b>${e(c.ects)}</b><span>ECTS · 目录学分</span></div><div><b>${e(c.term_legal_annex)}</b><span>目录开课学期</span></div><div><b>${e(c.language_legal_annex)}</b><span>目录语言</span></div></div><p class="meta">${e(c.type)} · ${e(groupNames[c.section_2025[0]])} · 适用记录：${e(c.rule_cohort)}</p><div class="notice">${c.catalog_source==='current'?'官方公开课程树的扩展选修记录（2026/27 学年）。':'2025 法规附件的历史整理，已于 2026-10-13 对照 PDF。'}目录周期不是当前排课承诺，中文名称是参考译名。</div><div class="actions">${c.offering_url?ext(c.offering_url,'查看 TUMonline 当期课程','button'):resLink('R010','在 TUMonline 核对课程','button')}<button class="button secondary" data-add="${e(code)}">加入学分计划</button><button class="quiet" data-share>复制本页链接</button></div><section><h2>这门课怎么用在你的计划中？</h2><p>${e(c.notes_cn||'核对当前课程目录、个人入学批次和学分认定，再决定是否纳入计划。')}</p><p>办理选课、考试或向学校咨询时，请使用模块代码 <b>${e(code)}</b>，不要仅凭中文名判断是否是同一门课。</p></section><section><h2>下一步</h2><ol class="steps"><li>在 TUMonline 搜索 ${e(code)}，选择你的当前学期。</li><li>核对授课、考试登记与个人课程归类。</li><li>加入本站计划只做模拟，不会向学校报名。</li></ol></section><div class="link-list">${internal(guideUrl(['IN2067','ED160028'].includes(code)?'robotics-choice':['IN2106','IN2107'].includes(code)?'matching':code==='ED140014'?'conditional-control':'curriculum'),'阅读相关规则与流程 →','source-link')}${ext(c.source_regulation,'原始法规来源','source-link')}${resLink('R002','官方学习规划','source-link')}</div><p class="meta">数据原记录：${e(c.last_reviewed)} · 人工复核待完成</p><div class="next-panel">${internal('/courses/','返回课程目录','button secondary')}${internal('/planner/','查看我的学分计划 →','text-link')}</div></article>`);
 docs.push({id:'course:'+code,kind:'course',code,title,summary:`${translation} · ${c.ects} ECTS · ${groupNames[c.section_2025[0]]}`,body:c.notes_cn+' '+c.type,aliases:[code,c.module_name_legal_2025,translation,...(code==='IN2346'?['深度学习']:[])],url:'/courses/'+code+'/',tasks:['study'],status:c.catalog_source==='current'?'官方课程树扩展 · 当期开课另行核对':'2025 附件已对照 · 当期开课另行核对',cohort:c.rule_cohort,ects:c.ects,term:c.term_legal_annex,group:c.section_2025[0],english:c.module_name_legal_2025,chinese:translation,historical:true});
}
function filters(mode){return `<div class="filterbar"><label>内容类型<select id="kind-filter"><option value="">全部类型</option><option value="guide">问题解答</option><option value="course">课程</option><option value="resource">官方 / 原始入口</option><option value="topic">历史课题</option><option value="tool">站内工具</option></select></label><label>要办的事<select id="task-filter"><option value="">全部任务</option>${nav.tasks.map(t=>`<option value="${t.id}">${e(t.title)}</option>`).join('')}</select></label>${mode==='courses'?`<label>课程领域<select id="group-filter"><option value="">全部领域</option><option value="core">必修 A–E · Pflichtbereich</option><option value="professional">专业选修 G/H/I · Fachliche Wahlmodule</option>${Object.entries(groupNames).map(([k,v])=>`<option value="${k}">${e(v)}</option>`).join('')}</select></label><label>目录学期<select id="term-filter"><option value="">全部</option><option value="WiSe">冬季 · WiSe</option><option value="SoSe">夏季 · SoSe</option></select></label>`:''}<label class="check"><input id="saved-filter" type="checkbox">只看收藏</label><button class="quiet" id="reset-filters" hidden>清除筛选</button></div>`;}
const resultRegion=(mode,fallback,beforeSearch='')=>`<div id="search-app" data-mode="${mode}">${mode==='courses'?'<div class="course-toolbar">':''}${beforeSearch}${searchForm('','page-search')}${filters(mode)}${mode==='courses'?'</div>':''}<p id="result-count" tabindex="-1" class="meta" role="status" aria-live="polite">${mode==='search'?'输入关键词查找问题、课程和资源。':'以下是静态目录；开启 JavaScript 可搜索、筛选和收藏。'}</p><div id="results" class="card-grid">${fallback}</div><button class="button secondary" id="more-results" hidden>显示更多结果</button></div>`;
shell('/search/','搜索整个知识库','同时查问题、课程、官方入口和研究资料。',intro('搜索整个知识库','支持中文、官方名称和课程代码；不会生成没有来源的答案。')+resultRegion('search',nav.tasks.map(t=>`<article class="card"><h2>${internal('/tasks/'+t.id+'/',t.title)}</h2><p>${e(t.subtitle)}</p></article>`).join('')),{noindex:true});
const courseContext=`<div id="course-semester-context" class="course-semester-context" hidden><label>这些课程要安排到<select id="course-target-semester"><option value="0">先选课，稍后分配</option></select></label></div><details class="catalog-note"><summary>目录学期与实际开课，怎么区分？</summary><p>目录包含 35 门已对照的 2025 附件模块及 34 门官方课程树扩展选修（2026/27 学年）。目录周期和对应学期教学记录分别保存；实际授课、个人归类与认定请在 TUMonline 核对。</p>${resLink('R010','打开 TUMonline','text-link')}</details>`;
shell('/courses/','选课程','按中文名、课程代码、领域和目录学期选课。',V.studyNav('/courses/')+intro('选课程，安排到学期。','选择想修的课，放进对应学期，随时看看每学期的学分。','选课与学分')+resultRegion('courses',courses.map(courseCard).join(''),courseContext)+V.courseDock());
for(const r of uniqueResources){
 const records=resourceGroups.get(r.url.replace(/[/]$/,''));
 const aliases=[...new Set([...records.map(x=>x.title),...nav.shortcuts.filter(s=>records.some(x=>x.id===s.id)).map(s=>s.label)])];
 if(r.id==='R069')aliases.push('ROS','ROS2','ROS 2','机器人操作系统');
 const tasks=nav.tasks.filter(t=>t.resources.some(id=>records.some(x=>x.id===id))||t.categories.some(c=>records.some(x=>x.category.startsWith(c)))).map(t=>t.id);
 docs.push({id:r.id,resource_ids:records.map(x=>x.id),kind:'resource',title:r.title,summary:r.description_cn,body:records.map(x=>x.description_cn+' '+x.publisher+' '+x.access).join(' '),aliases,url:r.url,tasks,status:(/历史|2023|2021/.test(r.title)?'历史资源 · ':'')+'入口原记录 '+(r.review_date||'无日期')+' · 未逐条重核',historical:/历史|2023|2021/.test(r.title),direct:true,cohort:r.access});
}
shell('/resources/','找资料与官方入口','中文说明与原始网站直达入口。',intro('找资料与官方入口','找到后直接打开，不强制多经过一层详情页。')+resultRegion('resources',uniqueResources.map(resourceCard).join('')));
const labs=uniqueResources.filter(r=>r.category.startsWith('06_'));
shell('/research/','找实验室与研究机会','按兴趣查找研究组，具体课题与名额向发布方确认。',intro('找实验室与研究机会','当前入口与历史主题分开看，名额不作保证。')+searchForm('', 'research-search')+`<div class="actions">${internal(guideUrl('research-start'),'第一次找导师？先看这里','button secondary')}${internal('/research/topics/','查看历史实验课 / 研讨课主题','text-link')}</div><div class="section-title"><h2>研究组与官方课题入口</h2></div><div class="card-grid">${labs.map(resourceCard).join('')}</div>`);
let topicsBody='';for(const t of topics){topicsBody+=`<article class="card" id="${e(t.id)}">${badge('历史主题 · '+t.academic_term)}<h2>${e(t.topic)}</h2><p>${e(t.module)} · ${e(t.topic_tag)}</p><p>${e(t.current_availability)}</p>${ext(t.source_url,'核对官方名单','text-link')}</article>`;docs.push({id:'topic:'+t.id,kind:'topic',title:t.topic,summary:t.module+' · '+t.topic_tag+' · 仅作选题参考，不是实时空位',body:t.course_type,aliases:[t.topic_tag,t.module],url:'/research/topics/#'+t.id,tasks:['research','study'],status:'历史课题快照 '+t.snapshot_date,historical:true,cohort:t.academic_term});}
shell('/research/topics/','实验课与研讨课：历史主题','仅供选题参考的历史目录，不是实时可申请名额。',intro('历史课题主题','先核对官方当前列表，不把历史收录当作仍有空位。')+`<div class="notice">58 条记录沿用 ${topics[0].snapshot_date} 的 ${topics[0].academic_term} 快照，未逐条重新确认。</div><div class="actions">${resLink('R029','打开当前官方说明','button')}${internal(guideUrl('matching'),'如何申请实验课 / 研讨课','button secondary')}</div><div class="card-grid">${topicsBody}</div>`,{noindex:true});
shell('/planner/','我的学分计划','选择课程、查看学分缺口，计划仅保存在此浏览器。',V.studyNav('/planner/')+intro('我的学分计划','录入已修与选课偏好，预览自动方案，再用看板和周课表调整。','选课与学分')+`<div id="planning-controls"><p class="loading-state">正在读取规划条件…</p></div><div id="planner"><p class="loading-state">正在读取你的计划…</p></div><div id="weekly-timetable"></div><section id="plan-exports" class="panel"></section><section id="printable-plan" hidden></section><dialog id="auto-plan-dialog" class="auto-plan-dialog" aria-labelledby="auto-plan-title"><h2 id="auto-plan-title">自动方案预览</h2><div id="auto-plan-result" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="button secondary" data-cancel-auto>取消</button><button type="button" class="button" data-apply-auto hidden>采用这个方案</button></div></dialog>${V.coursePicker()}<noscript>${internal('/courses/','浏览静态课程目录','button secondary')}</noscript>`,{planner:true,noindex:true});
docs.push({id:'tool:planner',kind:'tool',title:'我的学分计划',summary:'按冬夏季节分学期安排课程，查看每学期学分与整体缺口。',aliases:['学分规划器','选课计划','规划器'],body:'ECTS 毕业学分',tasks:['study'],url:'/planner/',status:'2025 规则快照 · 待个人确认',historical:false});
const feedback=repo+'/issues/new';
shell('/sources/','来源、隐私与反馈','查看内容状态和维护方式。',intro('来源、隐私与反馈','让不确定的内容也清楚可见。')+`<article class="answer-page"><section><h2>内容有三种，不混在一起</h2><p><b>中文解读：</b>基于标明的来源整理；AI 辅助对照不等于独立人工审核。<br><b>原创导航：</b>帮助你决定下一步去哪，不替学校判定资格。<br><b>历史资料：</b>保留原日期，不因网站发布而变成最新事实。</p><p>2024 FPSO 与 2025 修订 PDF 已于 2026-10-13 对照；独立人工审核待完成。目录含已核验的官方扩展选修，但不代表全部实时课程。58 条课题仍是历史记录。</p></section><section><h2>来源台账</h2>${[...sources.values()].map(s=>`<div class="source-record"><h3>${ext(s.url,s.title,'title-link')}</h3><p>${e(s.scope)}</p><p class="meta">对照日期：${e(s.checked_on||'未完成')} · ${e(state(s.status))}<br>人工审核：待完成</p></div>`).join('')}</section><section><h2>个人信息不进入公开仓库</h2><p>搜索在浏览器处理，不调用问答模型或第三方搜索服务。收藏、申请勾选与学分计划保存在当前浏览器；切换域名或设备不会自动迁移，请导出备份。托管方仍可能记录正常访问日志，搜索词出现在网址中，请勿输入个人证件信息。</p><p>本站没有登录、广告、第三方字体或分析脚本。没有复制官方全文、受限课件或群聊材料。</p></section><section><h2>发现过期信息？</h2><p>请提供页面地址、问题和官方依据；不要附上成绩单、证件、私人回复或群聊截图。提交 GitHub Issue 需要 GitHub 账号；普通阅读不需要。</p>${ext(feedback,'在 GitHub 反馈','button')} ${internal('/','返回首页','button secondary')}</section></article>`);
for(const old of ed.guides){shell('/archive/'+old.id+'/',old.title+'（历史整理）','保留原始中文整理，主要答案请看新入口。',intro(old.title,'历史资料，不作为当前规则保证。')+internal(guideUrl(archiveToGuide[old.id]||'help'),'前往这个主题的主要答案','button')+legacy(old.id),{noindex:true});}
shell('/404.html','没有找到这个页面','请搜索问题或返回任务入口。',intro('这个页面没有找到','网址可能已更改。换个关键词搜索，或从首页按任务查找。')+searchForm()+internal('/','返回首页','button secondary'),{noindex:true});
write('assets/search-index.json',JSON.stringify({version:nav.version,synonyms:nav.synonyms,docs}));
write('assets/planner-data.json',JSON.stringify({courses,names:ed.course_names_zh,synonyms:nav.synonyms,checklist:ed.checklist,details,rules}));
for(const [src,dest] of [['site3/style.css','assets/site.css'],['site3/search.js','assets/search.js'],['site3/local-lock.js','assets/local-lock.js'],['site3/app.js','assets/site.js'],['site3/backup-core.js','assets/backup-core.js'],['site3/backup-ui.js','assets/backup-ui.js'],['site3/planner.js','assets/planner.js'],['site3/feedback.js','assets/feedback.js'],['site3/course-picker.js','assets/course-picker.js'],['site3/community.js','assets/community.js'],['assets/core.js','assets/core.js']])write(dest,read(src));
write('assets/site.css',read('site3/style.css')+'\n'+read('site3/focus.css')+'\n'+read('site3/community.css')+'\n'+read('site3/desktop.css')+'\n'+read('site3/backup.css'));
for(const file of ['timetable-core','planning-engine','calendar','plan-export'])write('assets/'+file+'.js',read('assets/'+file+'.js'));
for(const file of ['planning-controls','planning-worker','timetable','plan-sharing'])write('assets/'+file+'.js',read('site3/'+file+'.js'));
write('assets/site.css',read('site3/style.css')+'\n'+read('site3/focus.css')+'\n'+read('site3/community.css')+'\n'+read('site3/desktop.css')+'\n'+read('site3/backup.css')+'\n'+read('site3/planning.css'));
write(community.qrImage,fs.readFileSync(path.join(root,community.qrImage)));
write('assets/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0065bd"/><text x="9" y="43" font-size="33" font-family="sans-serif" font-weight="bold" fill="white">rci</text></svg>');
for(const f of fs.readdirSync(path.join(root,'data')))if(f.endsWith('.csv'))write('downloads/'+f,read('data/'+f));
write('.nojekyll','');
write('robots.txt',`User-agent: *\nAllow: /\n${origin?'Sitemap: '+origin+url('/sitemap.xml')+'\n':''}`);
if(origin)write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+allPages.filter(p=>!p.noindex).map(p=>`<url><loc>${e(origin+url(p.path))}</loc></url>`).join('')+'</urlset>');
write('build-info.json',JSON.stringify({version:nav.version,pages:allPages.length,courses:courses.length,resources:resources.length,uniqueResources:uniqueResources.length,topics:topics.length,guides:guides.length,searchRecords:docs.length,base,origin,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null}));
const previous=out+'-previous';
if(fs.existsSync(finalOut))fs.renameSync(finalOut,previous);
try{fs.renameSync(out,finalOut);}catch(err){if(fs.existsSync(previous))fs.renameSync(previous,finalOut);throw err;}
fs.rmSync(previous,{recursive:true,force:true});
console.log(`Built ${allPages.length} pages; ${docs.length} searchable records; output ${finalOut}`);
