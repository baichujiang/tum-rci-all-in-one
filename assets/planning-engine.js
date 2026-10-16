/* Local constraint search. Results are previews; never writes a student's plan. MIT. */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports,C=node?require('./core'):root.RCI,T=node?require('./course-context'):root.RCICourseContext;
const group=c=>c.allocation_group??c.section_2025?.[0]??c.group;
const code=c=>c.module_code??c.code;
const credits=c=>Number(c.ects);
const bounds=(p,n)=>({...p.workload,...p.workload.semesters[n]});
function recommendationEligible(c){
 const v=c.verification;
 if(group(c)==='J'&&(!v||v.fields?.eligibility!=='verified'||v.fields?.counting!=='verified'||v.eligibility?.requires_confirmation||v.eligibility?.reviewed_source_sha256!==v.source_sha256||c.j_constraints?.is_language_course))return false;
 if(v?.follow_up_review?.outcome==='unresolved')return false;
 if(v?.source_field_status?.prerequisites==='present_in_current_course'){
  const s=v.field_sources?.prerequisites;
  if(!s||s.module_code!==code(c)||s.source_type!=='official_current_course'||!s.public_access_verified||!s.module_identity_verified||!s.source_field_value?.trim())return false;
 }
 return c.automatic_recommendation_eligible!==false&&(!v?!'GHI'.includes(group(c)):v.automatic_recommendation_eligible===true&&v.current_academic_year_selection_verified===true&&['WiSe','SoSe','WiSe/SoSe'].includes(v.term)&&!v.prerequisites?.requires_confirmation&&['identity','ects','groups','term','language','prerequisites'].every(k=>v.fields?.[k]==='verified')&&['none','recommended'].includes(v.prerequisites?.kind));
}
function languageOK(p,c,offerings,n){
 const value=T.offering(p,c,n,offerings).dated?.language??c.current_language??c.language_legal_annex??'DE/EN';
 return p.preferences.languages.some(l=>value.split('/').includes(l));
}
// Preserve credit/season shapes before filling the remaining bounded search slots.
function diverse(list,limit,key){
 const groups=new Map();for(const item of list){const k=key(item);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(item);}
 const result=[];for(let index=0;result.length<limit;index++){let added=false;for(const bucket of groups.values())if(bucket[index]){result.push(bucket[index]);added=true;if(result.length===limit)break;}if(!added)break;}return result;
}
const shape=set=>set.map(c=>credits(c)+':'+(c.current_term??c.term_legal_annex??'unknown')).sort().join('|');
function selectionShapes(list,known){
 return diverse(list.sort((a,b)=>a.extra-b.extra||a.items.length-b.items.length),240,x=>shape(x.items.filter(i=>i.status!=='passed'&&group(known.get(i.code)||i)==='J').map(i=>known.get(i.code)||i)));
}
// Keep several distinct subsets per credit sum, so seasonal/category alternatives survive.
function subsets(pool,max,keep=12){
 let sums=new Map([[0,[[]]]]);
 for(const c of pool){
  const next=new Map([...sums].map(([n,sets])=>[n,[...sets]]));
  for(const [n,sets] of sums){const amount=n+credits(c)*2;if(amount>max*2)continue;
   const bucket=next.get(amount)||[];
   for(const set of sets)if(!c.j_constraints?.recognition_family||!set.some(x=>x.j_constraints?.recognition_family===c.j_constraints.recognition_family))bucket.push([...set,c]);
   bucket.sort((a,b)=>a.length-b.length||a.map(code).join().localeCompare(b.map(code).join()));
   next.set(amount,diverse(bucket,keep,shape));
  }sums=next;
 }return [...sums].flatMap(([n,sets])=>sets.map(items=>({credits:n/2,items})));
}
function completeSelections(p,courses,base,offerings){
 const known=new Map(courses.map(c=>[code(c),c]));
 // A passed or explicitly allocated module keeps its category. An unallocated
 // future module can use any verified category, while still earning credit once.
 let variants=[base];
 for(const item of base){
  const allowed=known.get(item.code)?.allowed_groups;
  if(item.status==='passed'||item.group!==undefined||!allowed||allowed.length<2)continue;
  variants=variants.flatMap(items=>allowed.map(k=>items.map(x=>x.code===item.code?{...x,group:k}:x))).slice(0,64);
 }
 return selectionShapes(variants.flatMap(items=>completeAllocation(p,courses,items,offerings)),known);
}
function completeAllocation(p,courses,base,offerings){
 const known=new Map(courses.map(c=>[code(c),c]));
 const selected=new Set(base.map(x=>x.code)),calc=C.calculate({...p,items:base},courses),target=p.conditional?36:41;
 const baseFamilies=new Set(base.filter(x=>!x.custom).map(x=>known.get(x.code)?.j_constraints?.recognition_family).filter(Boolean)),passedCodes=new Set(base.filter(x=>x.status==='passed').map(x=>x.code));
 const pool=courses.filter(c=>!selected.has(code(c))&&!p.preferences.excluded.includes(code(c))&&recommendationEligible(c)&&(!c.j_constraints?.recognition_family||!baseFamilies.has(c.j_constraints.recognition_family))&&!(c.j_constraints?.incompatible_with||[]).some(x=>passedCodes.has(x))&&'GHIJ'.includes(group(c))&&Array.from({length:p.timeline.count-p.preferences.startSemester+1},(_,i)=>i+p.preferences.startSemester).some(n=>languageOK(p,c,offerings,n)&&T.offering(p,c,n,offerings).state!=='conflict'))
  .flatMap(c=>(c.allowed_groups||[group(c)]).map(k=>({...c,allocation_group:k})));
 const choices={};
 for(const k of ['G','H','I','J'])choices[k]=subsets(pool.filter(c=>group(c)===k),Math.max(k==='J'?6:target,0)+10).filter(x=>x.credits+calc.totals[k]>=(k==='J'?6:5));
 if(calc.totals.J>=6)choices.J=[{credits:0,items:[]}];
 if(Object.values(choices).some(x=>!x.length))return [];
 let combinations=[{credits:0,items:[]}];
 for(const k of ['G','H','I']){
  const sums=new Map();
  for(const a of combinations)for(const b of choices[k]){
   if(new Set([...a.items,...b.items].map(code)).size!==a.items.length+b.items.length)continue;
   const amount=a.credits+b.credits;if(amount>target+30)continue;
   const sets=sums.get(amount)||[];sets.push({credits:amount,items:[...a.items,...b.items]});
   sets.sort((x,y)=>x.items.length-y.items.length);sums.set(amount,sets.slice(0,24));
  }combinations=[...sums.values()].flat();
 }
 const professionals=combinations.filter(x=>x.credits+calc.professional>=target);
 professionals.sort((a,b)=>a.credits-b.credits||a.items.length-b.items.length);
 choices.J.sort((a,b)=>a.credits-b.credits||a.items.length-b.items.length);
 const combos=[];
 for(const pro of professionals.slice(0,100))for(const j of diverse(choices.J,12,x=>shape(x.items)))combos.push({extra:pro.credits+j.credits,items:[...base,...pro.items,...j.items].map(x=>x.module_code?{code:code(x),status:'planned',semester:0,locked:false,...(x.allowed_groups?.length>1?{group:x.allocation_group}:{})}:x)});
 return selectionShapes(combos,known);
}
function generate(raw,courses,offerings={},options={}){
 const p=C.validatePlan(raw,courses),known=new Map(courses.map(c=>[code(c),c])),reasons=[],warnings=[];
 const fail=message=>({ok:false,reasons:[message,...reasons],warnings,nodes:0});
 if(!C.cohorts.includes(p.cohort))return fail('先确认适用的入学批次，再自动规划。其他批次仍可使用手动看板。');
 if(!p.conditionalConfirmed)return fail('先按个人录取通知确认是否有入学补修要求，再自动规划。');
 if((p.cohort.endsWith('夏季')?'summer':'winter')!==p.timeline.start)return fail('入学批次与第1学期起始季节不一致，请先调整学期设置，再自动规划。');
 if(p.conditional&&!C.amended(p.cohort))return fail('2024 原规则批次的个人入学附加考试不能套用 K=5、选修36的减免。请先向学校核对；现有手动计划与记录仍保留。');
 const collisions=p.items.filter(x=>x.custom&&x.status==='planned'&&known.has(x.code));
 if(collisions.length)return fail('这些自录课程的代码现已出现在官方目录：'+collisions.map(x=>x.code).join('、')+'。原名称、学分、分类与状态保留；自动规划不会自行改成目录记录。请核对个人认定后，继续手动安排，或明确移除自录项再加入官方记录。');
 const passed=p.items.filter(x=>x.status==='passed');
 const latestPassed=Math.max(0,...passed.map(x=>x.semester));
 if(latestPassed>p.preferences.startSemester)return fail(`已修记录包含第 ${latestPassed} 学期通过的课程，不能从更早学期重排未来课程。请把开始规划学期调整到第 ${latestPassed} 学期或之后，并核对记录。`);
 if(passed.some(x=>x.code==='IN2320')&&C.calculate({...p,items:passed},courses).gaps.length)return fail('论文已修但还有其他学分缺口。请先核对成绩记录与学校批准情况，再手动安排剩余课程。');
 const selected=p.items.filter(x=>x.status==='planned');
 const excludedSelected=selected.filter(x=>p.preferences.excluded.includes(x.code));
 const fixedExcluded=excludedSelected.filter(x=>x.locked||x.custom||'ABCDEF'.includes(group(known.get(x.code)||x))||p.conditional&&x.code==='ED140014');
 if(fixedExcluded.length)return fail(`固定／必修／自定义课程与排除偏好冲突：${fixedExcluded.map(x=>x.code).join('、')}。请先核对并解除固定或取消排除；自定义课可先手动移除。`);
 let base=p.items.filter(x=>x.status==='passed'||!p.preferences.excluded.includes(x.code)),used=new Set(base.map(x=>x.code));
 const add=c=>{if(!used.has(c)){base.push({code:c,status:'planned',semester:0,locked:false});used.add(c);}};
 for(const c of p.preferences.desired)add(c);
 if(used.has('IN2067')&&used.has('ED160028'))return fail('想选课程与已选课程包含 Robotics / Roboterdynamik 两门，请保留其中一门。');
 const robotics=used.has('IN2067')?'IN2067':used.has('ED160028')?'ED160028':['IN2067','ED160028'].find(c=>!p.preferences.excluded.includes(c)&&Array.from({length:p.timeline.count},(_,i)=>i+1).some(n=>languageOK(p,known.get(c),offerings,n)));
 if(!robotics)return fail('Robotics / Roboterdynamik 二选一均被排除或授课语言不满足偏好。');
 const required=[robotics,'IN2228','IN2406','IN2064','IN2107','IN2106','IN2320',...(p.conditional?['ED140014']:[])];
 const blocked=required.filter(c=>p.preferences.excluded.includes(c)&&!passed.some(x=>x.code===c));
 if(blocked.length)return fail(`必修课程不能排除：${blocked.join('、')}。请调整偏好。`);
 for(const c of required)add(c);
 const unresolved=base.filter(x=>x.status==='planned'&&known.has(x.code)&&!recommendationEligible(known.get(x.code)));
 if(unresolved.length)return fail(`这些已选／想选课程暂不能自动安排：${unresolved.map(x=>x.code+'（'+(known.get(x.code).recommendation_note||'资料或个人条件待核实')+'）').join('、')} 已有手动记录保留。请先取消想选并从未来方案移出；确认资料、开课或个人准备后可继续使用手动看板。`);
 const countingConflicts=C.calculate({...p,items:base},courses).countingIssues;
 if(countingConflicts.length)return fail(countingConflicts.join(' '));
 if(!p.conditional&&used.has('ED140014'))return {...fail('计划含控制补修课程，但补修设置未开启。请按个人录取条件核对。'),issue:'remediation-conflict'};
 const noLanguage=base.filter(x=>x.status!=='passed'&&!Array.from({length:p.timeline.count-p.preferences.startSemester+1},(_,i)=>i+p.preferences.startSemester).some(n=>languageOK(p,known.get(x.code)||x,offerings,n)));
 if(noLanguage.length)return fail(`这些已选／必修课程不符合授课语言：${noLanguage.map(x=>x.code).join('、')}。双语模块表示目录语言，具体班次仍须核对。`);
 const choices=completeSelections(p,courses,base,offerings);
 if(!choices.length)return fail('当前目录在排除与语言条件下无法补齐 G/H/I 各 5 ECTS、专业选修总额或 J 的 6 ECTS。请放宽偏好，或录入已获学校认可的选修。');
 const start=p.preferences.startSemester,limit=options.nodeLimit??350000;let nodes=0,exhausted=false,best=null;
 const attempts=new Set();
 for(let finish=start;finish<=p.timeline.count&&!best&&!exhausted;finish++){
  for(const selection of choices){
   const future=selection.items.filter(x=>x.status==='planned'),thesis=future.find(x=>x.code==='IN2320'),last=finish;
   if(thesis&&(bounds(p,last).maxECTS<30||bounds(p,last).maxExams<1)){attempts.add('论文需要同一学期容纳 30 ECTS 和 1 项考核，可用单学期覆盖设置。');continue;}
   if(future.some(x=>x.locked&&(!x.semester||x.semester<start||x.semester>finish))){attempts.add('固定课程必须在开始规划学期至结束学期之间，且不能待分配。');continue;}
   if(thesis?.locked&&thesis.semester!==last)continue;
   const bins=Array.from({length:finish+1},()=>({credits:0,exams:0,codes:[]}));
   const descriptors=future.map(item=>{
    const c=known.get(item.code)||item,numbers=[];
    for(let n=start;n<=finish;n++){
     if(item.locked&&item.semester!==n||item.code==='IN2320'&&n!==last)continue;
     const offer=T.offering(p,c,n,offerings);
     if(offer.state==='conflict'||!languageOK(p,c,offerings,n)||!p.preferences.allowUnconfirmed&&!offer.dated&&offer.state!=='flexible')continue;
     if(credits(c)>bounds(p,n).maxECTS||bounds(p,n).maxExams<1)continue;
     numbers.push(n);
    }return {item,c,credits:credits(c),numbers};
   }).sort((a,b)=>a.numbers.length-b.numbers.length||Number(b.item.locked)-Number(a.item.locked)||b.credits-a.credits||a.item.code.localeCompare(b.item.code));
   const unavailable=descriptors.filter(d=>!d.numbers.length);
   if(unavailable.length){attempts.add(`可用学期／开课条件不满足：${unavailable.map(d=>d.item.code).join('、')}。`);continue;}
   const assignments=new Map();
   function search(index){
    if(++nodes>limit){exhausted=true;return false;}
    if(index===descriptors.length){
     if(!bins.slice(start).every((b,i)=>b.credits>=bounds(p,start+i).minECTS&&b.exams>=bounds(p,start+i).minExams))return false;
     const scheduled={...p,items:selection.items.map(x=>x.status==='passed'?x:{...x,semester:assignments.get(x.code)})};
     return C.calculate(scheduled,courses).complete&&(p.preferences.deadlineException||C.progression(scheduled,courses).filter(x=>!x.historical).every(x=>x.met));
    }
    const remain=descriptors.slice(index).reduce((n,x)=>n+x.credits,0),capacity=bins.slice(start).reduce((sum,b,i)=>sum+bounds(p,start+i).maxECTS-b.credits,0);
    if(remain>capacity)return false;
    const d=descriptors[index];
    // Prefer the student's previous semester, then balance load across available semesters.
    const ordered=[...d.numbers].sort((a,b)=>Number(b===d.item.semester)-Number(a===d.item.semester)||(bins[a].credits+(thesis&&d.item.code!=='IN2320'&&a===last?120:0))-(bins[b].credits+(thesis&&d.item.code!=='IN2320'&&b===last?120:0))||a-b);
    for(const n of ordered){
     const b=bins[n],limits=bounds(p,n);
     if(b.credits+d.credits>limits.maxECTS||b.exams+1>limits.maxExams)continue;
     b.credits+=d.credits;b.exams++;b.codes.push(d.item.code);assignments.set(d.item.code,n);
     if(search(index+1))return true;
     assignments.delete(d.item.code);b.credits-=d.credits;b.exams--;b.codes.pop();
     if(exhausted)return false;
    }return false;
   }
   if(search(0)){best={...p,items:selection.items.map(x=>x.status==='passed'?x:{...x,semester:assignments.get(x.code)})};break;}
   if(exhausted)break;
  }
 }
 if(!best)return {ok:false,reasons:[exhausted?'还没算出方案，不代表一定排不出来。可以多安排几个学期，或减少固定学期的课程后再试。':'没有找到符合所有要求的方案。试试多安排几个学期，或放宽每学期的学分和考试数量要求。',...attempts].slice(0,8),warnings,nodes,exhausted};
 best=C.validatePlan(best,courses);
 const unconfirmed=[];
 for(const x of best.items.filter(x=>x.status==='planned')){
  const c=known.get(x.code)||x,offer=T.offering(best,c,x.semester,offerings);
  if(!offer.dated&&offer.state!=='flexible')unconfirmed.push(x.code);
 }
 if(unconfirmed.length)warnings.push(`${unconfirmed.length} 门课先按通常的开课学期安排，之后还要确认是否开课、有无名额和课题。`);
 if(best.items.some(x=>x.custom))warnings.push('手动添加的课，学分和分类需要学校认可。');
 const uncertain=best.items.filter(x=>x.status==='planned'&&known.get(x.code)?.current_catalog_status==='needs_review');
 if(uncertain.length)warnings.push('这些课的最新资料还没确认：'+uncertain.map(x=>x.code).join('、')+'。请先确认能否报名和计入学分。');
 let needsPrerequisiteCheck=false;
 for(const x of best.items.filter(x=>x.status==='planned')){
  const c=known.get(x.code),prerequisites=c?.prerequisites;
  if(prerequisites&&prerequisites.kind!=='none'){warnings.push(`${x.code}：${prerequisites.summary_cn}`);needsPrerequisiteCheck=true;}
 }
 if(needsPrerequisiteCheck)warnings.push('上面列出的知识基础和报名要求，请在采用前自行确认。');
 if(best.items.some(x=>x.status==='planned'&&['IN2106','IN2107','IN2257'].includes(x.code)))warnings.push('研讨课、实验课还需要自己选课题和申请名额。同一个实验课题不能重复算作不同实验课的学分。');
 const thesisItem=best.items.find(x=>x.status==='planned'&&x.code==='IN2320');
 if(thesisItem&&best.items.some(x=>x.status==='planned'&&x.code!=='IN2320'&&x.semester===thesisItem.semester))warnings.push('论文和其他课排在同一学期。论文通常应最后完成；若要提前开题，需要学校批准。');
 if(p.preferences.deadlineException)warnings.push('这个方案可能没达到学校的进度要求。能否延期、补考或继续修读，以学校记录为准。');
 if(C.progression(best,courses).some(x=>x.historical&&!x.met))warnings.push('以前的学业进度可能没达标，或缺少通过学期记录。请对照成绩和学校批准情况确认。');
 const finish=Math.max(start,...best.items.filter(x=>x.status==='planned').map(x=>x.semester));
 return {ok:true,plan:best,finish,nodes,warnings,removed:excludedSelected.map(x=>x.code),added:best.items.filter(x=>!p.items.some(y=>y.code===x.code)).map(x=>x.code),moved:best.items.filter(x=>x.status==='planned'&&p.items.some(y=>y.code===x.code&&y.semester!==x.semester)).map(x=>x.code),calculation:C.calculate(best,courses),passed:C.calculate(best,courses,true)};
}
const api={generate,bounds,languageOK,recommendationEligible};if(node)module.exports=api;else root.RCIPlanning=api;
})(typeof globalThis!=='undefined'?globalThis:this);
