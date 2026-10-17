/* TUM RCI All-in-One v2. Original code, MIT. Pure functions shared by UI/tests. */
(function (root) {
  'use strict';
  const cohorts = ['2024夏季','2024/25冬季','2025夏季','2025/26冬季', '2026夏季', '2026/27冬季','2027夏季'];
  const amended=cohort=>!['2024夏季','2024/25冬季','2025夏季'].includes(cohort);
  const statuses = ['planned', 'passed'];
  // Display names shared by the catalog, picker, guide and plan. Calculations use group codes.
  const courseGroups = {
    A:'A · Robotics（机器人学，二选一）', B:'B · Cognition（认知）',
    C:'C · Intelligent Autonomous Systems（智能自主系统）',
    D:'D · Seminar（研讨课）', E:'E · Practical（实践课）', F:'F · Thesis（论文）',
    G:'G · Computation（计算）', H:'H · Mechanics（机械）',
    I:'I · Systems and Control（系统与控制）',
    J:'J · Überfachliche Grundlagen（跨学科基础）', K:'K · Regelungstechnik（控制理论补修）'
  };
  const creditOriginalNames = ['Pflichtbereich A–E', 'Fachliche Wahlmodule G/H/I',
    'Überfachliche Grundlagen J', "Master's Thesis F", 'Regelungstechnik K'];
  function csv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === ',' || c === '\n')) {
        row.push(cell); cell = '';
        if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
      } else cell += c;
    }
    if (quoted) throw new Error('CSV 引号未闭合');
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const header = rows.shift() || [];
    if (new Set(header).size !== header.length) throw new Error('CSV 列名重复');
    return rows.map(r => {
      if (r.length !== header.length) throw new Error('CSV 行列数不一致');
      return Object.fromEntries(header.map((h, i) => [h, r[i]]));
    });
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const courseName = course => course?.module_name_current || course?.module_name_legal_2025 || '';
  function safeURL(url) {
    try { const u = new URL(String(url)); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function validatePlan(raw, courses) {
    if (!raw || ![2,3,4,5].includes(raw.version) || !Array.isArray(raw.items) || raw.items.length > 250) throw new Error('不是有效的学分计划文件（支持 v2 / v3 / v4 / v5）');
    if (typeof raw.conditional !== 'boolean' || typeof raw.cohort !== 'string' || !['unknown', 'older', ...cohorts].includes(raw.cohort)) throw new Error('批次或补修设置无效');
    const conditionalConfirmed=raw.conditionalConfirmed ?? (raw.version===2&&cohorts.includes(raw.cohort)?true:raw.conditional);
    if(typeof conditionalConfirmed!=='boolean')throw new Error('个人补修确认状态无效');
    const timeline = raw.timeline === undefined ? {count:4, start:raw.cohort.endsWith('夏季') ? 'summer' : 'winter'} : raw.timeline;
    if (!timeline || !Number.isInteger(timeline.count) || timeline.count < 1 || timeline.count > 12 || !['winter', 'summer'].includes(timeline.start)) throw new Error('学期规划须为 1–12 个学期，并指定冬季或夏季开始');
    const known = new Map(courses.map(c => [c.module_code, c]));
    const used = new Set();
    const items = raw.items.map(x => {
      if (!x || typeof x.code !== 'string' || !statuses.includes(x.status)) throw new Error('模块或状态无效');
      const code = x.code.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(code) || used.has(code)) throw new Error('模块代码无效或重复');
      used.add(code);
      const semester = x.semester === undefined ? 0 : x.semester;
      if (!Number.isInteger(semester) || semester < 0 || semester > (x.status==='passed'?12:timeline.count)) throw new Error('课程安排的学期超出规划范围');
      if (x.locked !== undefined && typeof x.locked !== 'boolean') throw new Error('固定课程设置无效');
      const extra = {locked:x.locked ?? false};
      if (known.has(code) && !(x.custom===true && 'GHIJ'.includes(known.get(code).section_2025?.[0]))) {
        if(!Number.isFinite(Number(known.get(code).ects))||Number(known.get(code).ects)<=0)throw new Error(code+' 的官方目录学分尚未核实；请先核对学校认定，再以自录选修记录实际学分。');
        const groups=known.get(code).allowed_groups;
        if(groups?.length>1&&x.group!==undefined){if(!groups.includes(x.group))throw new Error('此模块不能计入所选领域');extra.group=x.group;}
        return {code, status:x.status, semester, ...extra};
      }
      if (!x.custom || typeof x.name !== 'string' || !x.name.trim() || x.name.length > 160 || !['G', 'H', 'I', 'J'].includes(x.group) || typeof x.ects !== 'number' || !Number.isFinite(x.ects) || x.ects <= 0 || x.ects > 30 || !Number.isInteger(x.ects * 2)) throw new Error('自定义选修须有名称、G/H/I/J 分类及 0.5–30 ECTS（0.5 的倍数）');
      return {code, name:x.name.trim(), group:x.group, ects:x.ects, custom:true, status:x.status, semester, ...extra};
    });
    if (used.has('IN2067') && used.has('ED160028')) throw new Error('Robotics 与 Roboterdynamik 是二选一，请先移除另一门');
    const courseOrder={},itemSemesters=new Map(items.map(x=>[x.code,x.semester]));
    if(raw.courseOrder!==undefined){
      if(!raw.courseOrder||typeof raw.courseOrder!=='object'||Array.isArray(raw.courseOrder))throw new Error('课程显示顺序无效');
      for(const [semester,list] of Object.entries(raw.courseOrder)){
        if(!/^(?:[0-9]|1[0-2])$/.test(semester)||!Array.isArray(list)||list.length>250||list.some(code=>typeof code!=='string'||!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(code)))throw new Error('课程显示顺序无效');
        if(new Set(list).size!==list.length)throw new Error('课程显示顺序中有重复模块');
        const current=list.filter(code=>itemSemesters.get(code)===Number(semester));
        if(current.length)courseOrder[semester]=current;
      }
    }
    const preferences = raw.preferences ?? {};
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) throw new Error('选课偏好无效');
    const codes = key => {
      const list = preferences[key] ?? [];
      if (!Array.isArray(list) || list.length > Math.max(250,courses.length) || list.some(c => typeof c !== 'string' || !known.has(c) && !used.has(c))) throw new Error('偏好中有未知课程');
      return [...new Set(list)];
    };
    const desired=codes('desired'), excluded=codes('excluded');
    if (desired.some(c=>excluded.includes(c))) throw new Error('同一门课不能同时想选和排除');
    const languages=preferences.languages ?? ['EN','DE'];
    if (!Array.isArray(languages) || languages.some(l=>!['EN','DE'].includes(l)) || languages.length>2) throw new Error('授课语言设置无效');
    const flags={};
    for (const [key,fallback] of Object.entries({allowOverlap:false,allowUnknownTimes:true,allowUnconfirmed:true,deadlineException:false})) {
      flags[key]=preferences[key] ?? fallback;
      if(typeof flags[key]!=='boolean') throw new Error('规划偏好设置无效');
    }
    const startSemester=preferences.startSemester ?? 1;
    if(!Number.isInteger(startSemester)||startSemester<1||startSemester>timeline.count) throw new Error('开始规划学期超出范围');
    function loadBounds(value, partial=false) {
      if (!value || typeof value!=='object'||Array.isArray(value)) throw new Error('学期负担设置无效');
      const defaults={minECTS:0,maxECTS:32,minExams:0,maxExams:6}, result={};
      for(const [key,fallback] of Object.entries(defaults)) {
        if(partial && value[key]===undefined)continue;
        const n=value[key] ?? fallback,limit=key.endsWith('ECTS')?120:50;
        if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>limit||!Number.isInteger(n*(key.endsWith('ECTS')?2:1)))throw new Error('学分须为 0–120 的半学分，考核数须为 0–50 的整数');
        result[key]=n;
      }
      if(!partial&&(result.minECTS>result.maxECTS||result.minExams>result.maxExams))throw new Error('负担下限不能高于上限');
      return result;
    }
    const workload=loadBounds(raw.workload ?? {}), semesters=raw.workload?.semesters ?? {};
    if(!semesters||typeof semesters!=='object'||Array.isArray(semesters))throw new Error('单学期负担设置无效');
    workload.semesters={};
    for(const [key,value] of Object.entries(semesters)) {
      if(!/^(?:[1-9]|1[0-2])$/.test(key))throw new Error('单学期负担编号无效');
      const bounds=loadBounds(value,true), merged={...workload,...bounds};
      if(merged.minECTS>merged.maxECTS||merged.minExams>merged.maxExams)throw new Error('单学期负担下限不能高于上限');
      workload.semesters[key]=bounds;
    }
    // Retired time settings remain inert, so old backups and plans round-trip losslessly.
    const tt=raw.timetable ?? {}, events=tt.events ?? [], replaced=tt.replaced ?? [];
    if(!tt||typeof tt!=='object'||Array.isArray(tt)||!Array.isArray(events)||events.length>500||!Array.isArray(replaced)||replaced.length>250)throw new Error('旧版时间记录无效');
    const eventIds=new Set();
    const normalizedEvents=events.map(event=>{
      if(!event||typeof event.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(event.id)||eventIds.has(event.id)||typeof event.title!=='string'||!event.title.trim()||event.title.length>160||!Number.isInteger(event.semester)||event.semester<1||event.semester>12||!Number.isInteger(event.day)||event.day<0||event.day>6||!Number.isInteger(event.start)||!Number.isInteger(event.end)||event.start<0||event.end>1440||event.start>=event.end)throw new Error('旧版时间事件须有唯一编号、名称、有效学期及开始结束时间');
      eventIds.add(event.id);
      if(event.code!==undefined && (!used.has(event.code)&&!known.has(event.code)))throw new Error('旧版时间事件的模块未知');
      if(event.allowOverlap!==undefined && typeof event.allowOverlap!=='boolean')throw new Error('事件重叠设置无效');
      if(event.room!==undefined && (typeof event.room!=='string'||event.room.length>160))throw new Error('教室信息无效');
      if(!['course','blocked','personal'].includes(event.kind??'personal'))throw new Error('事件类型无效');
      return {id:event.id,title:event.title.trim(),semester:event.semester,day:event.day,start:event.start,end:event.end,kind:event.kind??'personal',room:event.room??'',allowOverlap:event.allowOverlap??false,...(event.code?{code:event.code}:{})};
    });
    const normalizedReplaced=replaced.map(value=>{
      if(!value||!known.has(value.code)||!Number.isInteger(value.semester)||value.semester<1||value.semester>12)throw new Error('旧版时间替代记录无效');
      return {code:value.code,semester:value.semester};
    });
    return {version:5, cohort:raw.cohort, conditional:raw.conditional, conditionalConfirmed,timeline:{count:timeline.count, start:timeline.start}, items,...(Object.keys(courseOrder).length?{courseOrder}:{}),
      preferences:{desired,excluded,languages:[...new Set(languages)],...flags,startSemester},workload,timetable:{events:normalizedEvents,replaced:normalizedReplaced}};
  }
  function semesterSeason(timeline, number) {
    return number % 2 === 1 ? timeline.start : timeline.start === 'winter' ? 'summer' : 'winter';
  }
  function semesterLabel(timeline, number) {
    return `第 ${number} 学期 · ${semesterSeason(timeline, number) === 'winter' ? '冬季' : '夏季'}`;
  }
  function hasAcademicTerm(plan) {
    if (!plan.cohort || plan.cohort === 'unknown') return false;
    const season = plan.cohort.endsWith('夏季') ? 'summer' : plan.cohort.endsWith('冬季') ? 'winter' : null;
    return !season || plan.timeline.start === season;
  }
  function planSemesterLabel(plan, number) {
    return hasAcademicTerm(plan) ? semesterLabel(plan.timeline, number) : `第 ${number} 学期 · 季节待确认`;
  }
  function offering(course, season) {
    const term = course?.current_term || course?.term_legal_annex;
    if (term === '自主安排') return {state:'flexible', label:'自主安排'};
    if (!['WiSe','SoSe','WiSe/SoSe'].includes(term)) return {state:'unknown', label:term || '季节待确认'};
    const seasons = term.split('/');
    const label = term.replace('WiSe', '冬季').replace('SoSe', '夏季');
    if (!['winter', 'summer'].includes(season)) return {state:'unknown', label};
    return {state:seasons.includes(season === 'winter' ? 'WiSe' : 'SoSe') ? 'compatible' : 'conflict', label};
  }
  function semesterItems(plan,number,includePassed=false){
    const rank=new Map((plan.courseOrder?.[number]||[]).map((code,i)=>[code,i]));
    return plan.items.filter(x=>x.semester===number&&(includePassed||x.status!=='passed')).map((item,index)=>({item,index})).sort((a,b)=>(rank.get(a.item.code)??Infinity)-(rank.get(b.item.code)??Infinity)||a.index-b.index).map(x=>x.item);
  }
  function reorderSemester(plan,number,codes){
    const current=semesterItems(plan,number,true).map(x=>x.code),chosen=new Set(codes);
    if(!Number.isInteger(number)||number<0||number>12||chosen.size!==codes.length||codes.some(code=>!current.includes(code)))throw new Error('课程安排已变化，请重新调整顺序。');
    let index=0;
    const order=current.map(code=>chosen.has(code)?codes[index++]:code);
    return {...plan,courseOrder:{...plan.courseOrder,[number]:order}};
  }
  function schedule(plan, courses) {
    plan = validatePlan(plan, courses);
    const known = new Map(courses.map(c => [c.module_code, c]));
    const bucket = (number) => {
      const season = number && hasAcademicTerm(plan) ? semesterSeason(plan.timeline, number) : null;
      const items = semesterItems(plan,number);
      const credits = items.reduce((n, x) => n + Number(x.custom?x.ects:known.get(x.code)?.ects ?? x.ects), 0);
      return {number, season, items, credits, conflicts:season ? items.filter(x => offering(x.custom?null:known.get(x.code), season).state === 'conflict').map(x => x.code) : []};
    };
    return {unassigned:bucket(0), semesters:Array.from({length:plan.timeline.count}, (_, i) => bucket(i + 1))};
  }
  function calculate(plan, courses, onlyPassed = false) {
    plan = validatePlan(plan, courses);
    const known = new Map(courses.map(c => [c.module_code, c]));
    const totals = {core:0, G:0, H:0, I:0, J:0, thesis:0, K:0};
    let raw = 0, custom = 0, languageCredits = 0;
    const families=new Map(),languageLevels=new Map(),languageCourses=new Map(),countingIssues=[];
    const chosen = [];
    for (const item of plan.items) {
      if (onlyPassed && item.status !== 'passed') continue;
      const course = item.custom ? undefined : known.get(item.code);
      const group = item.group || course?.section_2025[0];
      const ects = course ? Number(course.ects) : item.ects;
      raw += ects; chosen.push(item.code);
      if (item.custom) custom++;
      if ('ABCDE'.includes(group)) totals.core += ects;
      else if (group === 'F') totals.thesis += ects;
      else if (group in totals) {
        const family=course?.j_constraints?.recognition_family;
        if(group==='J'&&family){
          const previous=families.get(family);
          if(previous){totals.J+=Math.max(0,ects-previous.ects);countingIssues.push(course.j_constraints.recognition_family_kind==='wtg_same_title'?'J 同一课程的不同学分版本只能计入一次：'+previous.code+'、'+item.code+'；请保留一门计入。':'J 已知内容重叠：'+previous.code+'、'+item.code+'；本模型暂只计入一种，实际认可需学校核对。');families.set(family,{code:previous.code,ects:Math.max(previous.ects,ects)});}
          else {totals.J+=ects;families.set(family,{code:item.code,ects});}
        }else totals[group] += ects;
        if(group==='J'&&course?.j_constraints?.is_language_course){
          languageCredits+=ects;
          const coverage=course.j_constraints.language_level_coverage||[],target=course.j_constraints.language_target;
          if(coverage.length){if(!languageCourses.has(target))languageCourses.set(target,[]);languageCourses.get(target).push({ects,coverage});}
          for(const level of coverage){const key=target+':'+level,previous=languageLevels.get(key);if(previous&&previous!==item.code)countingIssues.push('J 语言课程级别重叠：'+previous+'、'+item.code+'；A1至B2的重叠级别不能重复计入，本模型按不重叠组合计分，请核对个人认可。');else languageLevels.set(key,item.code);}
        }
      }
    }
    for(const entries of languageCourses.values()){
      const levels=[...new Set(entries.flatMap(x=>x.coverage))],bits=new Map(levels.map((x,i)=>[x,1<<i]));let sums=new Map([[0,0]]);
      for(const entry of entries){const mask=entry.coverage.reduce((n,x)=>n|bits.get(x),0),next=new Map(sums);for(const [used,ects] of sums)if(!(used&mask))next.set(used|mask,Math.max(next.get(used|mask)||0,ects+entry.ects));sums=next;}
      const duplicated=entries.reduce((n,x)=>n+x.ects,0)-Math.max(...sums.values());totals.J-=duplicated;languageCredits-=duplicated;
    }
    if(languageCredits>6){totals.J-=languageCredits-6;countingIssues.push('J 语言课程合计最多计入 6 ECTS；不重叠语言课共 '+languageCredits+' ECTS，超出部分未计入。');}
    for(const item of plan.items.filter(x=>(!onlyPassed||x.status==='passed')&&!x.custom))for(const code of known.get(item.code)?.j_constraints?.incompatible_with||[]){
      const previous=plan.items.find(x=>x.code===code&&x.status==='passed');
      if(previous&&(item.status==='planned'||!item.semester||!previous.semester||previous.semester<=item.semester))countingIssues.push(item.code+' 不得在已通过 '+code+' 后再选；请核对实际通过顺序与认可，原记录保留。');
    }
    const target = plan.conditional && amended(plan.cohort) ? 36 : 41;
    const professional = totals.G + totals.H + totals.I;
    const buckets = [
      ['必修（含二选一）', totals.core, 43], ['专业选修 G/H/I', professional, target],
      ['跨学科 J', totals.J, 6], ['硕士论文', totals.thesis, 30]
    ];
    if (plan.conditional && amended(plan.cohort)) buckets.push(['控制理论补修 K', totals.K, 5]);
    const allocated = buckets.reduce((n, [, value, required]) => n + Math.min(value, required), 0);
    const gaps = buckets.filter(([, value, required]) => value < required).map(([label, value, required]) => `${label}还差 ${required - value} ECTS`);
    gaps.push(...new Set(countingIssues));
    for (const group of ['G', 'H', 'I']) if (totals[group] < 5) gaps.push(`${group} 领域最低 5 ECTS，还差 ${5 - totals[group]}`);
    const supported = cohorts.includes(plan.cohort);
    if (!supported) gaps.unshift('未选择受支持的入学批次：不作规则达成判断');
    if(!plan.conditionalConfirmed)gaps.unshift('个人录取补修条件尚未确认：不作规则达成判断');
    if(plan.conditional&&!amended(plan.cohort))gaps.unshift('2024 原规则批次的个人入学附加考试需单独核对，不能套用 2025 K 学分减免');
    if (!plan.conditional && totals.K > 0) gaps.push('ED140014 未按补修计入：请核对个人录取要求');
    return {raw, allocated, buckets, totals, professional, gaps, supported, custom,countingIssues:[...new Set(countingIssues)],
      complete: supported && gaps.length === 0, chosen};
  }
  // Escaped Markdown subset for our own guides only. Never execute raw HTML.
  function markdown(text, resolveLink) {
    function inline(s) {
      const tokens = [];
      s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, url) => {
        const dest = resolveLink(url);
        const html = dest ? `<a href="${esc(dest)}"${dest.startsWith('#/') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${esc(label)}</a>` : esc(label);
        tokens.push(html); return `\u0000${tokens.length-1}\u0000`;
      });
      return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)] || '');
    }
    const lines = text.split(/\r?\n/); let out = '', table = [], code = null;
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter(x => !/^\s*\|?[\s:|-]+\|\s*$/.test(x)).map(x => x.trim().replace(/^\||\|$/g, '').split('|'));
      out += '<div class="table-scroll"><table>' + rows.map((r, i) => `<tr>${r.map(c => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('') + '</table></div>'; table = [];
    };
    for (const line of lines) {
      if (line.startsWith('```')) { flushTable(); if (code !== null) { out += `<pre><code>${esc(code)}</code></pre>`; code = null; } else code = ''; continue; }
      if (code !== null) { code += line + '\n'; continue; }
      if (/^\s*\|/.test(line)) { table.push(line); continue; }
      flushTable();
      if (!line.trim()) continue;
      const heading = line.match(/^(#{1,4})\s+(.*)/);
      if (heading) { const n = Math.min(heading[1].length + 1, 5); out += `<h${n}>${inline(heading[2])}</h${n}>`; }
      else if (line.startsWith('>')) out += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
      else if (/^[-*]\s/.test(line)) out += `<p class="md-bullet">${inline(line.replace(/^[-*]\s/, ''))}</p>`;
      else out += `<p>${inline(line)}</p>`;
    }
    flushTable(); if (code !== null) out += `<pre><code>${esc(code)}</code></pre>`;
    return out;
  }
  function progression(plan,courses){
    plan=validatePlan(plan,courses);const known=new Map(courses.map(c=>[c.module_code,c]));
    const start=plan.preferences.startSemester,earned=plan.items.filter(x=>x.status==='passed'),foundation=['IN2067','ED160028','IN2228','IN2406','IN2064'];
    const rows=[{semester:2,label:'A/B/C 至少通过一门',required:1},...[3,4,5,6].map((semester,i)=>({semester,label:'累计通过的课程学分',required:(i+1)*30}))];
    return rows.map(row=>{
      const historical=row.semester<start,items=plan.items.filter(x=>x.status==='passed'?(x.semester>0?x.semester<=row.semester:!historical):!historical&&x.semester>0&&x.semester<=row.semester);
      const value=row.semester===2?items.filter(x=>foundation.includes(x.code)).length:calculate({...plan,items,preferences:{...plan.preferences,desired:[],excluded:[]},timetable:{events:[],replaced:[]}},courses).allocated;
      const unknown=historical&&earned.some(x=>x.semester===0);
      return {...row,value,historical,unknown,met:value>=row.required,exception:plan.preferences.deadlineException};
    });
  }
  const api = {csv, esc, courseName, safeURL, validatePlan, calculate, progression, amended, semesterSeason, semesterLabel, hasAcademicTerm, planSemesterLabel, offering, semesterItems, reorderSemester, schedule, markdown, cohorts, courseGroups, creditOriginalNames};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RCI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
