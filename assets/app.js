/* TUM RCI All-in-One v2 — Chinese-first, source-backed, no third-party runtime. MIT. */
(async function () {
  'use strict';
  const C = window.RCI, e = C.esc;
  const repo = 'https://github.com/baichujiang/tum-rci-all-in-one';
  const main = document.getElementById('main');
  const planKey = 'rci:v2:plan', savesKey = 'rci:v2:saves', checklistKey = 'rci:v2:checklist';
  let renderToken = 0, toastTimer;
  const emptyPlan = () => ({version:2, cohort:'unknown', conditional:false, items:[]});
  function toast(message) { const box = document.getElementById('toast'); box.textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => {box.textContent = '';}, 6000); }
  function readLocal(key, fallback) { try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch (_) {return fallback;} }
  function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { toast('浏览器不允许保存；本次修改只在当前页面有效，请导出备份。'); return false; } }
  async function text(path) {
    if (window.RCI_OFFLINE && Object.prototype.hasOwnProperty.call(window.RCI_OFFLINE, path)) return window.RCI_OFFLINE[path];
    const r = await fetch(path, {cache:'no-cache'}); if (!r.ok) throw new Error(`${path}：HTTP ${r.status}`); return r.text();
  }
  let resources, courses, topics, events, editorial;
  try {
    const data = await Promise.all(['data/resources.csv','data/courses_legal_2025.csv','data/topics_ws2026_27.csv','data/events_deadlines.csv','content/editorial.json'].map(text));
    [resources, courses, topics, events] = data.slice(0,4).map(C.csv); editorial = JSON.parse(data[4]);
    if (!courses.length || !resources.length || !editorial.articles) throw new Error('知识库为空或格式不正确');
  } catch (err) {
    main.innerHTML = `<h1>知识库暂时未能加载</h1><div class="notice">${e(err.message)}<br>本地阅读请使用生成的 offline.html，或在仓库目录运行 <code>python3 -m http.server 8000</code>。网站上出现此问题时请检查 data/ 与 content/ 是否完整。</div><a class="primary" href="${repo}">在 GitHub 阅读资料 ↗</a>`; return;
  }
  const names = editorial.course_names_zh;
  const byCode = new Map(courses.map(c => [c.module_code,c]));
  const sourceMap = new Map(editorial.sources.map(s => [s.id,s]));
  let plan;
  try {plan = C.validatePlan(readLocal(planKey, emptyPlan()), courses);} catch (_) {plan = emptyPlan(); toast('本地计划格式无效，已忽略。原存储未覆盖，可先检查备份。');}
  let saves = readLocal(savesKey, []); if (!Array.isArray(saves)) saves = []; saves = new Set(saves.filter(s => typeof s === 'string' && s.length < 80));
  let checklist = readLocal(checklistKey, []); if (!Array.isArray(checklist)) checklist = [];
  const groupNames = {A:'Robotics 二选一',B:'Cognition',C:'智能自主系统',D:'硕士研讨',E:'硕士实验',F:'硕士论文',G:'计算 · Computation',H:'机械 · Mechanics',I:'系统与控制',J:'跨学科',K:'条件补修'};
  const statusLabels = {checked:'本次来源已对照',mixed:'部分复核 / 部分沿用',needs_review:'待复核',original:'原创方法建议',inherited:'沿用 v1 快照'};
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function stale(date, days = 90) { return !date || Date.now() - Date.parse(date + 'T00:00:00Z') > days * 86400000; }
  const tag = (label, kind = '') => `<span class="tag ${kind}">${e(label)}</span>`;
  const ext = (url, label, cls = 'text-link') => C.safeURL(url) ? `<a class="${cls}" href="${e(C.safeURL(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : '';
  const noResults = (msg = '没有匹配项。换个关键词，或清除筛选再试。') => `<div class="empty">${e(msg)}</div>`;
  const report = (label, url = '') => ext(`${repo}/issues/new?title=${encodeURIComponent('信息核对：'+label)}&body=${encodeURIComponent('页面 / 模块：'+label+'\n官方来源：'+url+'\n适用入学批次：\n发现的问题：\n建议修改与证据：\n\n请勿上传个人证件、成绩单或受限课件。')}`, '反馈或补充');
  function linkSource(s) { return `<div class="source-row"><div class="tags">${tag(statusLabels[s.status], s.status==='checked'?'checked':'warning')}${tag('人工审核：待完成')}${stale(s.checked_on)?tag('使用前请再核实','warning'):''}</div><h3>${e(s.title)}</h3><p>${e(s.scope)}</p><p class="muted small">本次对照日期：${e(s.checked_on || '未完成')} · ${e(s.checked_by || '沿用 v1 记录')}</p>${ext(s.url,'查看官方来源')} &nbsp; ${report(s.title,s.url)}</div>`; }
  function sourcePanel(ids, cohort = '请确认个人适用批次', status = 'inherited') {
    return `<aside class="sourcebox"><h3>这条信息从哪里来？</h3><dl><dt>内容性质</dt><dd>非官方中文整理 / 参考译名</dd><dt>适用范围</dt><dd>${e(cohort)}</dd><dt>内容状态</dt><dd>${e(statusLabels[status] || status)}</dd><dt>版本整理日期</dt><dd>${e(editorial.released_on)}（非全部来源核实日期）</dd><dt>人工审核</dt><dd>待完成，不代表 TUM 确认</dd></dl>${ids.map(id=>sourceMap.get(id)).filter(Boolean).map(s=>`<p class="small muted">${e(s.title)}<br>对照：${e(s.checked_on || '本次未完成')}<br>${ext(s.url,'官方原文')}</p>`).join('')}<p class="small muted">网页可达、机器抓取成功、人工审核是不同状态。官方原文与个人 TUMonline 记录优先。</p><a class="btn" href="#/sources">查看来源台账 →</a></aside>`;
  }
  function route() { const [path, query = ''] = location.hash.replace(/^#\/?/,'').split('?'); return {parts:(path || 'home').split('/').map(x => {try{return decodeURIComponent(x);}catch(_){return x;}}), params:new URLSearchParams(query)}; }
  function go(path) { location.hash = '#/' + path; }
  function head(title, subtitle, eyebrow = 'TUM RCI ALL-IN-ONE') { return `<div class="page-intro"><div class="eyebrow">${e(eyebrow)}</div><h1>${e(title)}</h1><p class="muted">${e(subtitle)}</p></div>`; }
  function saveButton(id) {return `<button class="btn small" data-save="${e(id)}" aria-pressed="${saves.has(id)}">${saves.has(id)?'已收藏':'收藏'}</button>`;}
  function courseCard(c) {
    const code=c.module_code, added=plan.items.some(i=>i.code===code);
    return `<article class="card"><div class="kicker"><b class="mono">${e(code)}</b><span>${e(groupNames[c.section_2025[0]])}</span></div><h3><a href="#/course/${encodeURIComponent(code)}">${e(names[code] || C.courseName(c))}</a></h3><div class="course-en">${e(C.courseName(c))}</div><div class="tags">${tag(c.type)}${tag(c.term_legal_annex)}${tag(c.language_legal_annex)}</div><div class="card-foot"><div class="course-ects">${e(c.ects)}<span>ECTS</span></div><button class="btn small" data-add="${e(code)}" ${added?'disabled':''}>${added?'已加入计划':'+ 加入计划'}</button></div></article>`;
  }
  function resourceCard(r) {
    const date = r.review_date;
    return `<article class="card"><div class="kicker"><b>${e(r.category.replace(/^\d+_/,''))}</b><span class="mono">${e(r.id)}</span></div><h3><a href="#/resource/${e(r.id)}">${e(r.title)}</a></h3><p>${e(r.description_cn)}</p><div class="tags">${tag(r.access)}${tag('v1 记录', 'warning')}${stale(date)?tag('需再核实','warning'):''}</div><div class="card-foot"><span>${e(r.publisher)}</span><div class="actions">${saveButton(r.id)}${ext(r.url,'原始入口')}</div></div></article>`;
  }
  function articleCard(a) {return `<article class="card"><div class="kicker"><b>${e(a.category)}</b>${tag(statusLabels[a.status],a.status==='checked'?'checked':'')}</div><h3><a href="#/article/${e(a.id)}">${e(a.title)}</a></h3><p>${e(a.subtitle)}</p><div class="card-foot"><span>非官方中文解读</span><a href="#/article/${e(a.id)}">阅读 →</a></div></article>`;}
  function filterForm(params, kind) {
    const q = params.get('q') || '', options = kind==='courses' ? [['','全部类型'],['core','核心与论文'],['G','计算 G'],['H','机械 H'],['I','系统与控制 I'],['J','跨学科 J'],['K','补修 K']] : [['','全部分类'], ...[...new Set(resources.map(r=>r.category))].map(x=>[x,x.replace(/^\d+_/,'')])];
    const select = (name, choices) => `<select name="${name}">${choices.map(([v,t])=>`<option value="${e(v)}" ${params.get(name)===v?'selected':''}>${e(t)}</option>`).join('')}</select>`;
    return `<form class="filters" data-filter="${kind}"><label>关键词<input name="q" type="search" value="${e(q)}" placeholder="课程代码、中文名、SLAM、ROS…"></label><label>分类${select('group',options)}</label>${kind==='courses'?`<label>目录学期${select('term',[['','全部学期'],['WiSe','冬季 WiSe'],['SoSe','夏季 SoSe']])}</label>`:`<label>收藏${select('saved',[['','全部资源'],['yes','只看收藏']])}</label>`}<button class="primary" type="submit">筛选</button><a class="btn" href="#/${kind}">重置</a></form>`;
  }
  function matches(obj, q) { return JSON.stringify(obj).toLocaleLowerCase().includes(q.toLocaleLowerCase()); }
  function courseList(params) {
    const q=params.get('q')||'', g=params.get('group')||'', term=params.get('term')||'';
    const list=courses.filter(c=>matches({...c,zh:names[c.module_code]},q) && (!g || (g==='core'?'ABCDEF'.includes(c.section_2025[0]):c.section_2025[0]===g)) && (!term || c.term_legal_annex.includes(term)));
    return head('课程百科','中文理解，原名检索。按模块代码、领域、目录学期查找课程。')+`<div class="notice neutral">35 行数据来自 v1 的 2025 法规附件快照，不是实时课表或完整的现行可选课清单。中文标题是参考译名；开课、语言与认定请核对 TUMonline。</div>`+filterForm(params,'courses')+`<p class="small muted" role="status">找到 ${list.length} 门模块 · 点击课程标题查看来源与版本</p><div class="grid">${list.map(courseCard).join('')}</div>`+(!list.length?noResults():'');
  }
  function resourceList(params, research=false) {
    const q=params.get('q')||'',g=params.get('group')||'',saved=params.get('saved');
    const list=resources.filter(r=>(!research || r.category.startsWith('06_')) && matches(r,q) && (!g || r.category===g) && (saved!=='yes'||saves.has(r.id)));
    return head(research?'科研与课题导航':'全部资源',research?'先看研究方向，再核对具体课题、导师和名额。':'保留原有 125 条入口，不把“收录”包装成“本次全部验证”。')+(research?`<div class="notice neutral">研究简介与实验室入口沿用 v1，未在本次逐条核实。${ext(repo+'/blob/main/templates/研究组沟通追踪.md','研究沟通模板')} · <a href="#/topics">查看 58 条学期课题快照 →</a></div>`:filterForm(params,'resources'))+`<p class="small muted" role="status">${list.length} 条资源${research?' · 搜索实验室请使用全部资源页':''}</p><div class="grid">${list.map(resourceCard).join('')}</div>`+(!list.length?noResults():'');
  }
  function home() {
    return `<section class="hero"><div><div class="eyebrow">A SHARED HOME FOR RCI STUDENTS</div><h1>少翻几个网页。<br><em>多一点时间造机器人。</em></h1><p class="muted">从申请、选课到第一篇论文，把散落的信息整理成中文知识。每一条重要规则，都能找到它的官方出处。</p><form class="searchbox" data-search><label class="sr-only" for="home-search">搜索整个知识库</label><input id="home-search" name="q" type="search" placeholder="搜索 IN2067、机器学习、申请、SLAM…"><button class="primary">搜索 ↗</button></form><p class="small muted">中文优先 · 保留官方原名 · 非官方学生项目</p></div><div class="hero-visual"><div class="eyebrow">YOUR STUDY, CONNECTED.</div><div class="degree-number">120<span>ECTS</span></div><div class="degree-grid"><div><b>43</b>必修</div><div><b>41</b>专业选修</div><div><b>6</b>跨学科</div><div><b>30</b>论文</div></div><p>一般情景的结构示意，不是个人毕业审核。<br>有控制理论补修时请切换对应规划情景。</p><a class="btn small" href="#/article/curriculum">阅读学分规则 →</a></div></section><div class="grid"><a class="feature" href="#/apply"><div class="number">01 / GET STARTED</div><h3>我正在准备申请</h3><p>材料清单、申请窗口与需要单独核对的条件。</p><span class="text-link">从申请指南开始 →</span></a><a class="feature" href="#/courses"><div class="number">02 / PLAN YOUR STUDY</div><h3>我正在安排选课</h3><p>35 门模块的中外文名称、分类与学分规划。</p><span class="text-link">打开课程百科 →</span></a><a class="feature" href="#/research"><div class="number">03 / EXPLORE RESEARCH</div><h3>我想找到研究方向</h3><p>实验室入口、学生课题快照与原创联系建议。</p><span class="text-link">探索科研资源 →</span></a></div><div class="section-heading"><h2>先读这些，少走弯路</h2><a class="text-link" href="#/guides">全部中文指南 →</a></div><div class="grid">${editorial.articles.slice(0,3).map(articleCard).join('')}</div><div class="section-heading"><h2>你的知识库，持续共建</h2><a class="text-link" href="#/sources">查看核实边界 →</a></div><div class="metric-row"><div class="metric"><b>${resources.length}</b><span>已收录资源 · 非全部复核</span></div><div class="metric"><b>${courses.length}</b><span>法规目录快照模块</span></div><div class="metric"><b>${editorial.articles.length}</b><span>新版重点中文解读</span></div><div class="metric"><b>${editorial.sources.filter(s=>s.status==='checked').length}</b><span>本次对照的官方页面</span></div></div><div class="notice neutral">这不是 TUM 官方网站。v2 于 ${e(editorial.released_on)} 整理；网页对照由 AI 辅助完成，尚无独立人工审核。日期、名额和法规会变化，请在行动前核对原文。</div>`;
  }
  function courseDetail(code) {
    const c=byCode.get(code); if(!c)return noResults('没有找到这个模块代码。');
    const coreChecked=editorial.core_rechecked.includes(code), refs=coreChecked?['curriculum','amendment2025']:['amendment2025'];
    return `<div class="breadcrumbs"><a href="#/courses">课程百科</a> / ${e(code)}</div>`+head(names[code]||C.courseName(c),C.courseName(c),code)+`<div class="detail-layout"><article class="article"><div class="tags">${tag(c.type)}${tag(groupNames[c.section_2025[0]])}${tag('中文参考译名')}</div><div class="metric-row"><div class="metric"><b>${e(c.ects)}</b><span>目录 ECTS</span></div><div class="metric"><b>${e(c.term_legal_annex)}</b><span>法规目录学期</span></div><div class="metric"><b>${e(c.language_legal_annex)}</b><span>法规目录语言</span></div><div class="metric"><b>${e(c.section_2025[0])}</b><span>目录分组</span></div></div><h2>中文选课说明</h2><p>${e(c.notes_cn || '该模块收录于 v1 的 2025 附件目录。课程名称和学分是查找入口，不足以确认当前开课、先修条件、考试形式或个人学分认定。')}</p>${['IN2067','ED160028'].includes(code)?'<div class="notice">官方学习规划说明两门为 XOR，只能参加其中一门的考试；本工具不允许同时加入计划。</div>':''}<div class="notice neutral">${coreChecked?'本次核对了官网的核心课程结构；完整模块描述、语言字段和当前开课未逐项复核。':'该条目与分类沿用 v1；2025 PDF 本次未能读取，尚待再次核验。'}<br>原记录日期：${e(c.last_reviewed)}。中文译名不是官方翻译。</div><h2>下一步怎么做</h2><p>在 TUMonline 搜索 <code>${e(code)}</code>，核对本学期开课、考试报名与适用课程目录。对认定有疑问时，将模块代码和入学批次一并提供给 RCI 协调员。</p><div class="actions"><button class="primary" data-add="${e(code)}" ${plan.items.some(i=>i.code===code)?'disabled':''}>${plan.items.some(i=>i.code===code)?'已加入计划':'+ 加入我的学分计划'}</button>${saveButton(code)}${ext('https://campus.tum.de/','打开 TUMonline')}</div><p class="small muted">${report(code,c.source_regulation)}</p></article>${sourcePanel(refs,c.rule_cohort,coreChecked?'mixed':'inherited')}</div>`;
  }
  function resourceDetail(id) {
    const r=resources.find(x=>x.id===id);if(!r)return noResults('资源不存在。');
    const linked=editorial.sources.filter(s=>s.url===r.url);
    return `<div class="breadcrumbs"><a href="#/resources">全部资源</a> / ${e(id)}</div>`+head(r.title,r.category.replace(/^\d+_/,''))+`<div class="detail-layout"><article class="article"><div class="tags">${tag(r.publisher)}${tag(r.access)}${tag('v1 资源记录','warning')}</div><h2>为什么收录这个入口</h2><p>${e(r.description_cn)}</p><h2>使用前核对</h2><p>确认当前页面是否与课程／学期匹配，并查看访问限制。这里保留的是入口和简短原创导航，不缓存外部全文或受限材料。</p><div class="notice neutral">原记录状态：${e(r.source_status)}<br>原记录日期：${e(r.review_date||'未记录')}；建议频率：${e(r.update_frequency)}。以上是 v1 的记录，不代表本次重新验证。${linked.length?'本次相关来源的核对范围见下方。':''}</div>${linked.map(linkSource).join('')}<div class="actions">${ext(r.url,'打开原始资源','primary')}${saveButton(id)}${report(r.title,r.url)}</div></article>${sourcePanel(linked.map(s=>s.id),'依原网站及相应学期规定','inherited')}</div>`;
  }
  function articleDetail(id) {
    const a=editorial.articles.find(x=>x.id===id);if(!a)return noResults('没有找到这篇解读。');
    return `<div class="breadcrumbs"><a href="#/guides">中文指南</a> / ${e(a.category)}</div>`+head(a.title,a.subtitle)+`<div class="detail-layout"><article class="article"><div class="tags">${tag(statusLabels[a.status],a.status==='checked'?'checked':'warning')}${tag('非官方中文解读')}</div>${a.sections.map(s=>`<h2>${e(s.heading)}</h2><p>${e(s.text)}</p>`).join('')}<div class="notice neutral">${a.status==='original'?'本页是原创方法建议，不是学校规定。':'“来源已对照”仅指列明范围的 AI 辅助检查，不等于人工审核或官方确认。'}修改日期与来源核实日期分别记录。</div><div class="actions">${report(a.title)}<a class="btn" href="#/guides">返回指南 →</a></div></article>${sourcePanel(a.sources,a.cohort,a.status)}</div>`;
  }
  function guidesPage() {return head('中文版知识指南','新版重点解读与原有长篇指南分层保存，保留不同的核实状态。')+`<div class="grid">${editorial.articles.map(articleCard).join('')}</div><div class="section-heading"><h2>第一版长篇指南</h2><span class="sub">9 篇 · 内容未在本次全面复核</span></div><div class="grid">${editorial.guides.map(g=>`<a class="card" href="#/guide/${e(g.id)}"><div class="kicker">GUIDE ${e(g.id)} ${tag('v1 保留','warning')}</div><h3>${e(g.title)}</h3><p>站内排版阅读；原有来源链接保留，时效性信息请重新核实。</p><span class="text-link">阅读指南 →</span></a>`).join('')}</div>`;}
  async function legacyGuide(id) {
    const g=editorial.guides.find(x=>x.id===id);if(!g)return noResults('没有找到这份指南。');
    const raw=await text(g.path);
    const resolve=url=>{
      if(/^https?:\/\//i.test(url))return C.safeURL(url);
      if(/^[a-z][a-z0-9+.-]*:/i.test(url)||url.startsWith('//')||url.startsWith('#'))return '';
      const dest=new URL(url,repo+'/blob/main/'+g.path);
      if(!dest.href.startsWith(repo+'/blob/main/'))return '';
      const other=editorial.guides.find(x=>dest.pathname.endsWith('/'+x.path) || decodeURI(dest.pathname).endsWith('/'+x.path));
      return other?'#/guide/'+other.id:dest.href;
    };
    return `<div class="breadcrumbs"><a href="#/guides">中文指南</a> / v1 ${e(id)}</div>`+head(g.title,'第一版原创中文整理 · 本次只改善阅读排版，未全面重新核实。')+`<div class="notice">这是 ${e(g.last_recorded)} 的第一版资料。申请、费用、生活政策、课程名称和期限可能变化，不能把排版升级理解为事实已更新。${ext(repo+'/blob/main/'+g.path,'查看原 Markdown')}</div><article class="article">${C.markdown(raw,resolve)}</article>`;
  }
  function application() {
    return head('申请与入学','把要求变成可执行的核对步骤；不收集你的申请材料。')+`<div class="grid two"><a class="feature" href="#/article/application"><div class="eyebrow">WINTER INTAKE</div><h2>02.01 — 05.31</h2><p>冬季入学常规申请窗口 · 具体学期请核对官网</p></a><a class="feature" href="#/article/application"><div class="eyebrow">SUMMER INTAKE</div><h2>10.01 — 11.30</h2><p>夏季入学常规申请窗口 · 不代表实时开放状态</p></a></div><div class="notice neutral">本次已对照申请页的材料与常规窗口，人工审核仍待完成。学费、语言证书细则和你的个性化材料清单不在此处自动判定。${ext(sourceMap.get('admissions').url,'官方申请说明')}</div><div class="detail-layout"><article class="article"><h2>我的申请核对清单</h2><p class="sub">勾选只表示你自行检查过，不代表学校认可材料。仅存于当前浏览器。</p>${editorial.checklist.map((s,i)=>`<label class="check-item"><input type="checkbox" data-check="${i}" ${checklist.includes(i)?'checked':''}><span>${e(s)}</span></label>`).join('')}<div class="actions"><a class="primary" href="#/article/application">阅读完整重点解读 →</a><a class="btn" href="#/guide/01">第一版详细指南</a></div></article>${sourcePanel(['admissions'],'具体申请学期与个人学历条件','checked')}</div>`;
  }
  function progressBlock(calc) {return calc.buckets.map(([label,value,target])=>`<div class="progress-row"><div class="progress-label"><span>${e(label)}</span><span>${value} / ${target}</span></div><progress max="${target}" value="${Math.min(value,target)}" aria-label="${e(label)} ${value} / ${target}"></progress></div>`).join('');}
  function plannerPage() {
    const calc=C.calculate(plan,courses), passed=C.calculate(plan,courses,true);
    const options=[['unknown','请选择／尚不确定'],...C.cohorts.map(x=>[x,x+'入学']),['older','其他批次（不作规则判断）']];
    const rows=plan.items.map(i=>{const c=byCode.get(i.code);return `<div class="plan-row"><div class="plan-name"><h3>${e(c?(names[i.code]||C.courseName(c)):i.name)}</h3><p class="muted mono">${e(i.code)} · ${e(c?c.ects:i.ects)} ECTS · ${e(c?c.section_2025[0]:i.group)} ${i.custom?'· 自行录入，待认定':''}</p></div><label><span class="sr-only">${e(i.code)} 状态</span><select data-plan-status="${e(i.code)}"><option value="planned" ${i.status==='planned'?'selected':''}>计划修读</option><option value="passed" ${i.status==='passed'?'selected':''}>已通过</option></select></label><button data-remove="${e(i.code)}" aria-label="移除 ${e(i.code)}">移除 ×</button></div>`;}).join('');
    return head('我的学分计划','先规划，再核对。数据仅保存在当前浏览器，可导出到你自己的设备。')+`<div class="notice">规则模型基于 v1 的 2025 修订快照，修订 PDF 本次未能重读。请先核对适用 FPSO 与录取条件；工具不处理考试期限、成绩、重复认定、实际开课和毕业资格。</div><div class="filters"><label>入学批次<select id="cohort">${options.map(([v,t])=>`<option value="${e(v)}" ${plan.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label><label>补修情景<select id="conditional"><option value="no" ${!plan.conditional?'selected':''}>不计控制理论补修</option><option value="yes" ${plan.conditional?'selected':''}>已核对需补修 ED140014（5 ECTS）</option></select></label></div><div class="planner-layout"><div><article class="article"><div class="section-heading"><h2>我的模块 · ${plan.items.length}</h2><a class="text-link" href="#/courses">+ 去课程百科添加</a></div>${rows||noResults('还没有模块。先从课程百科加入第一门课。')}<div class="actions"><button class="btn" data-export>导出 JSON 备份</button><label class="btn">导入计划<input class="sr-only" id="import-plan" type="file" accept=".json,application/json"></label><button class="text-link" data-clear>清空当前计划</button></div></article><details><summary>目录里没有我的选修课：自行录入</summary><p>只允许 G/H/I/J 选修；归类与学分均由你提供，本工具不作认定。请勿填入已在目录中的代码或个人信息。</p><form class="form-grid" id="custom-course"><label>模块代码<input name="code" required maxlength="60" placeholder="例如 NEW123"></label><label>模块名称<input name="name" required maxlength="160"></label><label>学分（0.5–30）<input name="ects" type="number" min="0.5" max="30" step="0.5" required></label><label>自行确认的类别<select name="group"><option value="G">G · 计算</option><option value="H">H · 机械</option><option value="I">I · 系统与控制</option><option value="J">J · 跨学科</option></select></label><button class="primary wide">加入待认定选修</button></form></details><div class="notice neutral">栏目计入数会封顶：例如跨学科修了 8 ECTS，只将 6 计入该栏；多出的 2 不抵扣其他栏。每个模块代码只允许出现一次。自定义课程仅按你输入的归类模拟。</div><details><summary>查看依据、限制与隐私</summary><p>规则来源：2025 目录快照 + 本次对照的官方学习规划。未确认批次不作达成判断；已通过状态也是你的自报记录。清空浏览器、切换设备或网址会使本地记录不可用，请自行导出。</p>${ext(sourceMap.get('curriculum').url,'官方学习规划')}<br>${ext(sourceMap.get('amendment2025').url,'2025 修订原件')}<p>本应用不把计划、收藏或勾选记录发送到 GitHub、TUM 或第三方分析服务；托管服务仍可能产生标准访问日志。</p></details></div><aside class="planner-summary"><span class="tag">${calc.supported?'2025 规则快照 · 待个人确认':'未选择受支持批次'}</span><p class="sub small">规划计入（含计划修读与已通过）</p><h2>${calc.allocated} <span class="sub">/ 120</span></h2><p class="sub small">原始录入 ${calc.raw} ECTS · 自报已通过计入 ${passed.allocated} ECTS</p>${progressBlock(calc)}<hr><p class="small">G / H / I：${calc.totals.G} / ${calc.totals.H} / ${calc.totals.I} ECTS（各最低 5）</p>${calc.gaps.map(x=>`<p class="small">· ${e(x)}</p>`).join('')}${calc.complete?'<p class="small">计划在此模型中覆盖数值要求；不代表你已毕业或课程已获认定。</p>':''}${calc.custom?`<p class="small">有 ${calc.custom} 门自行录入课程，实际认定待确认。</p>`:''}<p class="sub small">状态与数据以个人 TUMonline 和学校审核为准。</p></aside></div>`;
  }
  function topicsPage(params) {
    const q=params.get('q')||'';const list=topics.filter(t=>matches(t,q));
    return head('实验课与研讨课：主题快照','WiSe 2026/27 · 58 条 v1 记录，不是当前可报名名额。')+`<div class="notice">本次核对了 Matching 流程，不代表逐条确认了这些课题的剩余位置。请联系官方页面列出的负责导师。<a href="#/article/matching">阅读 Matching 解读 →</a></div><form class="searchbox" data-topic-search><label class="sr-only" for="topic-search">搜索课题</label><input id="topic-search" type="search" name="q" value="${e(q)}" placeholder="主题或标签，例如 HRI、Vision"><button class="primary">搜索</button></form><p class="small muted">${list.length} 条匹配记录</p><div class="grid">${list.map(t=>`<article class="card"><div class="tags">${tag(t.module)}${tag(t.topic_tag)}${tag('历史快照','warning')}</div><h3>${e(t.topic)}</h3><p>${e(t.current_availability)}</p><div class="card-foot"><span>${e(t.snapshot_date)}</span>${ext(t.source_url,'官方名单')}</div></article>`).join('')}</div>`+(!list.length?noResults():'');
  }
  function sourcesPage() {return head('来源、核实与内容边界','把知道的、不确定的、还需要复核的，分别记录。')+`<div class="notice neutral">本次只对照了以下 4 个官方网页的指定范围。125 条入口、35 门模块与 58 个课题并未全部实时复核；“人工审核”仍待维护者完成。修订 PDF 的读取失败不说明原链接永久失效。</div><article class="article">${editorial.sources.map(linkSource).join('')}</article><div class="grid two"><article class="card"><h3>内容与版权</h3><p>只整理必要事实与原创中文导航，不镜像官方全文、受限课件、个人资料或第三方视觉资产。原文链接不等于转载授权。</p><a class="text-link" href="#/article/rights">阅读内容政策 →</a></article><article class="card"><h3>个人记录与隐私</h3><p>收藏、申请勾选与学分计划使用浏览器 localStorage，不上传到服务器。没有第三方统计脚本或外部字体；托管服务仍可能记录正常访问日志。</p>${ext(repo+'/blob/main/CONTENT_POLICY.md','维护与隐私说明')}</article></div><details open><summary>半自动更新：只生成审核线索</summary><p>维护脚本按白名单和 robots.txt 访问公开页，保存页面指纹，不公开抓取原文。变更报告只能说明页面内容可能变化，不能自动决定新规则。首次检测需要建立基线，之后由维护者复核再更新数据与中文说明。</p><p>自动检测不会刷新人工审核日期，也不会覆盖课程和申请要求。审核人应单独确认版权、事实与适用批次。</p>${ext(repo+'/actions','查看 GitHub 工作流')} · ${report('资料维护')}</details>`;}
  function searchPage(params) {
    const q=params.get('q')||'';if(!q)return head('搜索知识库','输入一个课程代码、中文名或研究主题。')+`<form class="searchbox" data-search><input aria-label="搜索" name="q" type="search"><button class="primary">搜索</button></form>`;
    const cs=courses.filter(c=>matches({...c,zh:names[c.module_code]},q));const rs=resources.filter(r=>matches(r,q));const as=editorial.articles.filter(a=>matches(a,q));
    return head('搜索：'+q,`${cs.length} 门课程 · ${rs.length} 条资源 · ${as.length} 篇重点解读`)+`<form class="searchbox" data-search><input aria-label="搜索" name="q" type="search" value="${e(q)}"><button class="primary">搜索</button></form>${cs.length?'<div class="section-heading"><h2>课程</h2></div><div class="grid">'+cs.map(courseCard).join('')+'</div>':''}${as.length?'<div class="section-heading"><h2>中文解读</h2></div><div class="grid">'+as.map(articleCard).join('')+'</div>':''}${rs.length?'<div class="section-heading"><h2>资源</h2></div><div class="grid">'+rs.map(resourceCard).join('')+'</div>':''}`+(!cs.length&&!rs.length&&!as.length?noResults():'');
  }
  async function render() {
    const token=++renderToken,{parts,params}=route(),[page,id]=parts;
    const routes={home, courses:()=>courseList(params), course:()=>courseDetail(id), resources:()=>resourceList(params), resource:()=>resourceDetail(id), research:()=>resourceList(params,true), guides:guidesPage, article:()=>articleDetail(id), guide:()=>legacyGuide(id), apply:application, planner:plannerPage, sources:sourcesPage, topics:()=>topicsPage(params), search:()=>searchPage(params)};
    try {const html=await (routes[page]||(()=>noResults('页面不存在，请从左侧导航重新进入。')))();if(token!==renderToken)return;main.innerHTML=html;document.title=(main.querySelector('h1')?.textContent||'知识平台')+' · TUM RCI All-in-One';}
    catch(err){if(token===renderToken)main.innerHTML=head('暂时无法打开此页','原始资料仍可在 GitHub 阅读。')+`<div class="notice">${e(err.message)}</div>${ext(repo,'打开仓库')}`;}
    const active=({course:'courses',resource:'resources',guide:'guides',article:'guides',topics:'research'})[page]||page;
    document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  }
  function commitPlan(next, message) {try{if(JSON.parse(localStorage.getItem(planKey)||'null')?.version>=3)throw new Error('计划已升级，请使用新版 /planner/ 页面，避免旧页面覆盖新数据。');plan=C.validatePlan(next,courses);writeLocal(planKey,plan);render();if(message)toast(message);}catch(err){toast(err.message);}}
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-add')){const code=b.dataset.add;if(plan.items.some(i=>i.code===code)){toast('这门课已在计划里。');return;}commitPlan({...plan,items:[...plan.items,{code,status:'planned'}]},'已加入计划；这不是学校选课报名。');}
    if(b.hasAttribute('data-remove'))commitPlan({...plan,items:plan.items.filter(i=>i.code!==b.dataset.remove)},'已从本地计划移除。');
    if(b.hasAttribute('data-save')){const id=b.dataset.save;saves.has(id)?saves.delete(id):saves.add(id);writeLocal(savesKey,[...saves]);b.textContent=saves.has(id)?'已收藏':'收藏';b.setAttribute('aria-pressed',String(saves.has(id)));}
    if(b.hasAttribute('data-clear') && confirm('清空当前浏览器的学分计划？建议先导出备份。'))commitPlan(emptyPlan(),'当前计划已清空。');
    if(b.hasAttribute('data-export')){const blob=new Blob([JSON.stringify({...plan,exported_on:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rci-study-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('导出的是个人文件，请勿提交到公开仓库。');}
  });
  document.addEventListener('change',async event=>{
    const el=event.target;
    if(el.id==='cohort')commitPlan({...plan,cohort:el.value});
    if(el.id==='conditional')commitPlan({...plan,conditional:el.value==='yes'});
    if(el.hasAttribute('data-plan-status'))commitPlan({...plan,items:plan.items.map(i=>i.code===el.dataset.planStatus?{...i,status:el.value}:i)});
    if(el.hasAttribute('data-check')){const n=Number(el.dataset.check);checklist=el.checked?[...new Set([...checklist,n])]:checklist.filter(i=>i!==n);writeLocal(checklistKey,checklist);}
    if(el.id==='import-plan' && el.files[0]){
      try{if(el.files[0].size>250000)throw new Error('文件过大，上限 250 KB');const incoming=C.validatePlan(JSON.parse(await el.files[0].text()),courses);if(!plan.items.length||confirm('以导入文件替换当前计划？'))commitPlan(incoming,'计划已导入；课程认定仍需自行核对。');}catch(err){toast('未导入：'+err.message);}el.value='';
    }
    if(el.closest('[data-filter]') && el.tagName==='SELECT')el.closest('form').requestSubmit();
  });
  document.addEventListener('submit',event=>{
    const form=event.target;event.preventDefault();const fd=new FormData(form),params=new URLSearchParams();for(const [k,v] of fd)if(String(v).trim())params.set(k,String(v).trim());
    if(form.hasAttribute('data-filter'))go(form.dataset.filter+'?'+params);
    else if(form.hasAttribute('data-search'))go('search?'+params);
    else if(form.hasAttribute('data-topic-search'))go('topics?'+params);
    else if(form.id==='custom-course'){
      const code=String(fd.get('code')).trim().toUpperCase();if(byCode.has(code)){toast('此代码已在课程目录，请从课程百科添加。');return;}
      commitPlan({...plan,items:[...plan.items,{code,name:String(fd.get('name')).trim(),group:fd.get('group'),ects:Number(fd.get('ects')),status:'planned',custom:true}]},'已添加自行录入的选修，归类与学分待学校确认。');
    }
  });
  window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});});
  await render();
})();
