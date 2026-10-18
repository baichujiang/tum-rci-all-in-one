/* Date-specific public menus. This page never reads personal plans or favorites. */
(function(root){
 'use strict';
 const FEED='https://tum-dev.github.io/eat-api';
 const translationIndexes=new WeakMap();
 const normalizeName=value=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function dateValue(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('请选择有效日期。');
  const date=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('请选择有效日期。');
  return date;
 }
 function berlinDate(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
 }
 function weekOf(value){
  const date=dateValue(value);date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const year=date.getUTCFullYear(),week=Math.ceil((((date-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);
  return {year,week};
 }
 function offsetDate(value,days){
  const date=dateValue(value);date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
 }
 function weekDates(value){
  const monday=offsetDate(value,-((dateValue(value).getUTCDay()+6)%7));
  return Array.from({length:7},(_,index)=>offsetDate(monday,index));
 }
 function menuURL(id,value){
  if(!/^[a-z0-9-]{1,60}$/.test(id))throw Error('食堂信息无效。');
  const {year,week}=weekOf(value);
  return `${FEED}/${id}/${year}/${String(week).padStart(2,'0')}.json`;
 }
 function dishesFor(raw,value){
  const {year,week}=weekOf(value);
  if(!raw||!Array.isArray(raw.days)||raw.year!==year||raw.number!==week||raw.days.length>7)throw Error('菜单数据暂时无法读取。');
  const days=raw.days.filter(day=>day&&day.date===value);
  if(days.length>1)throw Error('菜单日期信息不一致。');
  if(!days.length)return [];
  if(!Array.isArray(days[0].dishes)||days[0].dishes.length>150)throw Error('菜单数据暂时无法读取。');
  return days[0].dishes.map(dish=>{
   if(!dish||typeof dish.name!=='string'||!dish.name.trim()||dish.name.length>1500)throw Error('菜单内容暂时无法读取。');
   return {name:dish.name,type:typeof dish.dish_type==='string'?dish.dish_type:'',price:dish.prices?.students,labels:Array.isArray(dish.labels)?dish.labels.filter(x=>typeof x==='string'&&x.length<80).slice(0,64):[]};
  });
 }
 function nextMenuDate(raw,from){
  const dates=raw.days.filter(day=>day&&typeof day.date==='string'&&day.date>=from).map(day=>day.date).sort();
  for(const value of dates)if(dishesFor(raw,value).length)return value;
  return null;
 }
 function availabilityFor(data,id){
  const entry=data?.canteens?.[id];
  return entry?{...entry,source_url:data.sources[entry.source],checked_on:data.checked_on,closures:(entry.periods||[]).map(key=>data.periods[key]).filter(Boolean)}:null;
 }
 function openingHoursText(hours){
  const days=[['mon','周一'],['tue','周二'],['wed','周三'],['thu','周四'],['fri','周五'],['sat','周六'],['sun','周日']],groups=[];
  const valid=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  days.forEach(([key,label],index)=>{
   const range=hours?.[key];if(!valid(range?.start)||!valid(range?.end)||range.start>=range.end)return;
   const last=groups[groups.length-1];
   if(last&&last.index===index-1&&last.start===range.start&&last.end===range.end){last.to=label;last.index=index;}
   else groups.push({from:label,to:label,index,start:range.start,end:range.end});
  });
  return groups.length?'常规营业：'+groups.map(g=>(g.from===g.to?g.from:g.from+'至'+g.to)+' '+g.start+'–'+g.end).join('；'):'常规营业时间暂未提供';
 }
 function menuState(raw,value,{availability=null,failed=false}={}){
  if(!raw)return failed?{kind:'error',short:'读取失败',message:'菜单读取失败，暂时无法确认当天菜单及营业情况。请重新加载或查看官方页面。'}:{kind:'loading',short:'—',message:'正在读取菜单…'};
  const count=dishesFor(raw,value).length;
  if(count)return {kind:'menu',short:count+' 道菜',message:count+' 道菜品'};
  const closure=availability?.closures?.find(period=>period.from<=value&&value<=period.to);
  const checked=availability?.checked_on?'（核对日期：'+availability.checked_on+'）':'';
  if(closure)return {kind:'closed',short:'公告休息',message:`官方已公告休息：${closure.reason}，${closure.from} 至 ${closure.to}${checked}。临时变动请查看官方营业安排。`};
  if([0,6].includes(dateValue(value).getUTCDay()))return {kind:'weekend-rest',short:'周末休息',message:'周末休息，可选择工作日查看菜单。'};
  if(availability?.regular_days?.length&&!availability.regular_days.includes(dateValue(value).getUTCDay()))return {kind:'regular-rest',short:'通常休息',message:`按官方常规营业安排，这一天通常休息${checked}。当天是否有特殊开放，请查看官方营业安排。`};
  return {kind:'unknown',short:'暂无数据',message:(raw.missing?'第三方数据源暂无本周菜单。':'第三方数据源未提供当天菜品。')+'无法确认是尚未发布、食堂休息，还是上游数据遗漏；请查看官方页面确认。'};
 }
 function renderWeek(raw,selected,options={}){
  const today=berlinDate();
  return weekDates(selected).map((value,index)=>{
   const state=menuState(raw,value,options);
   const day=['周一','周二','周三','周四','周五','周六','周日'][index];
   return `<button type="button" class="mensa-week-day${value===selected?' is-selected':''}" data-menu-date="${value}" data-menu-state="${state.kind}"${index>4?' data-menu-weekend="true"':''} aria-pressed="${value===selected}" aria-label="${value} ${day}，${escape(state.message)}"><span>${value===today?'今天':day}</span><b>${Number(value.slice(5,7))}/${Number(value.slice(8))}</b><small>${escape(state.short)}</small></button>`;
  }).join('');
 }
 function lookupTranslation(dictionary,name){
  if(!dictionary||typeof dictionary!=='object')return '';
  let index=translationIndexes.get(dictionary);
  if(!index){
   index=new Map();
   for(const [source,translated] of Object.entries(dictionary))if(typeof translated==='string'){
    const key=normalizeName(source);
    index.set(key,index.has(key)&&index.get(key)!==translated?'':translated);
   }
   translationIndexes.set(dictionary,index);
  }
  return index.get(normalizeName(name))||'';
 }
 function mergeTranslations(curated={},cached={}){
  const dishes=Object.create(null);
  for(const dictionary of [cached,curated.dishes||{}])for(const [source,text] of Object.entries(dictionary)){
   if(source.length<=1500&&typeof text==='string'&&text.length<=1500&&/[\u3400-\u9fff]/.test(text)&&!/[<>\u0000-\u001f]/.test(text))dishes[normalizeName(source)]=text;
  }
  return {...curated,dishes};
 }
 function categoryTranslation(dictionary,type){
  const translated=lookupTranslation(dictionary,type);if(translated)return translated;
  const key=type.trim(),code=/^(HG|B|N)([1-9]\d?)$/.exec(key);
  if(code)return {HG:'主菜',B:'配菜',N:'甜品'}[code[1]]+' '+code[2];
  const numbered=/^(Gericht|Beilage) ([1-9]\d?)$/.exec(key);
  return numbered?(numbered[1]==='Gericht'?'菜品':'配菜')+' '+numbered[2]:'';
 }
 function priceText(price){
  if(!price||typeof price.base_price!=='number'||!Number.isFinite(price.base_price)||price.base_price<0)return '价格未提供';
  const base=price.base_price,unit=price.price_per_unit;
  if(unit!==null&&unit!==undefined&&(typeof unit!=='number'||!Number.isFinite(unit)||unit<0))return '价格未提供';
  const euro=value=>'€'+value.toFixed(2);
  if(unit>0){
   if(typeof price.unit!=='string'||!price.unit.trim())return '价格未提供';
   const unitLabel=price.unit==='Portion'?'份':price.unit==='Stück'?'个':price.unit;
   const byWeight=euro(unit)+' / '+unitLabel;
   return base>0?byWeight+'，另加 '+euro(base):byWeight;
  }
  return euro(base);
 }
 function renderDishes(dishes,labels={},translations={}){
  return dishes.map(d=>{
   const translatedName=lookupTranslation(translations.dishes,d.name),type=categoryTranslation(translations.categories,d.type)||(d.type?'原分类：'+d.type:'');
   const diet=d.labels.includes('VEGAN')?'纯素':d.labels.includes('VEGETARIAN')?'素食':'';
   const ingredients=d.labels.map(label=>lookupTranslation(labels,label)||'未识别标记：'+label);
   return `<article class="mensa-dish"><div class="mensa-dish-top"><span class="mensa-dish-type">${escape(type===diet?'':type)}</span>${diet?`<span class="mensa-diet">${diet}</span>`:''}</div><h3 lang="${translatedName?'zh-CN':'de'}">${escape(translatedName||d.name)}</h3>${translatedName?`<p class="mensa-original">德文原名：<span lang="de">${escape(d.name)}</span></p>`:'<p class="mensa-original">中文译名待补充</p>'}<p class="mensa-price">${escape(priceText(d.price))}</p>${ingredients.length?`<details class="mensa-ingredients"><summary>食材与过敏原标记</summary><p>${escape(ingredients.join(' · '))}</p></details>`:''}</article>`;
  }).join('');
 }
 const api={normalizeName,berlinDate,weekOf,offsetDate,weekDates,menuURL,dishesFor,nextMenuDate,availabilityFor,openingHoursText,menuState,renderWeek,lookupTranslation,mergeTranslations,categoryTranslation,priceText,renderDishes};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
 const app=root.document?.getElementById('mensa-app');if(!app)return;
 const $=id=>document.getElementById('mensa-'+id);
 const catalog=JSON.parse(document.getElementById('mensa-catalog').textContent),canteens=new Map(catalog.canteens.map(c=>[c.id,c]));
 const select=$('canteen'),date=$('date'),status=$('status'),dishes=$('dishes'),retry=$('retry'),next=$('next');
 const params=new URLSearchParams(location.search);
 if(canteens.has(params.get('canteen')))select.value=params.get('canteen');
 date.value=berlinDate();
 try{if(params.has('date')){dateValue(params.get('date'));date.value=params.get('date');}}catch(_){}
 const crowding=root.MensaCrowding?.create({catalog,node:$('crowding'),list:$('place-results')});
 const places=root.MensaPlaces?.create({catalog,select,preferred:params.get('canteen'),onRender:()=>crowding?.syncList(),onChoose:()=>load({nearest:date.value===berlinDate()})});
 let run=0,controller=null,loadedWeek=null,loadedFor='',loadedAt=0;
 const chineseWeeks=new Map();
 const dayFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Berlin',month:'long',day:'numeric',weekday:'long'});
 const labelDay=value=>dayFormatter.format(dateValue(value));
 async function readChinese(current,value,signal){
  if(!catalog.translation_url)return null;
  const {year,week}=weekOf(value),key=current.id+'/'+year+'/'+week,cached=chineseWeeks.get(key);
  if(cached&&Date.now()-cached.at<300000)return cached.dishes;
  const url=new URL(catalog.translation_url,location.href);
  url.searchParams.set('canteen',current.id);url.searchParams.set('date',value);
  const response=await fetch(url.href,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)return null;
  const data=await response.json();
  if(data.version!==1||data.canteen!==current.id||data.year!==year||data.week!==week||!data.dishes||typeof data.dishes!=='object'||Array.isArray(data.dishes)||Object.keys(data.dishes).length>1100)return null;
  if(chineseWeeks.size>=16)chineseWeeks.delete(chineseWeeks.keys().next().value);
  chineseWeeks.set(key,{at:Date.now(),dishes:data.dishes});return data.dishes;
 }
 function showWeek(raw,value,options={}){
  const days=weekDates(value),label=day=>`${Number(day.slice(5,7))}月${Number(day.slice(8))}日`;
  $('week-label').textContent=label(days[0])+' — '+label(days[6]);
  $('week').innerHTML=renderWeek(raw,value,{availability:availabilityFor(catalog.availability,select.value),...options});
 }
 function showDate(current,value){
  date.value=value;
  const target=new URL(location.href);target.searchParams.set('canteen',current.id);target.searchParams.set('date',value);
  try{history.replaceState(null,'',target.pathname+target.search);}catch(_){}
  $('date-label').textContent=labelDay(value)+' · 学生价格';
 }
 async function load({nearest=false,withinWeek=false,prefetched=null}={}){
  const token=++run;controller?.abort();
  const current=canteens.get(select.value);if(!current)return;
  places?.sync(current);
  $('name').textContent=current.name;$('address').textContent=current.address;$('source').href=current.menu_url;
  $('hours').textContent=openingHoursText(current.open_hours);
  crowding?.select(current.id);
  const availability=availabilityFor(catalog.availability,current.id),opening=$('opening');
  if(opening){opening.hidden=!availability;opening.href=availability?.source_url||current.menu_url;}
  const requested=date.value;
  try{dateValue(requested);}catch(_){status.textContent='请选择有效日期。';dishes.innerHTML='';retry.hidden=true;next.hidden=true;app.setAttribute('aria-busy','false');return;}
  controller=new AbortController();
  const request=controller;
  const timer=setTimeout(()=>request.abort(),12000);
  showDate(current,requested);
  showWeek(null,requested);
  loadedWeek=null;loadedFor='';
  status.textContent='正在读取菜单…';retry.hidden=true;next.hidden=true;dishes.innerHTML='';app.setAttribute('aria-busy','true');
  try{
   async function readWeek(value){
    const expected=weekOf(value);
    if(prefetched&&prefetched.year===expected.year&&prefetched.number===expected.week){dishesFor(prefetched,value);return prefetched;}
    const response=await fetch(menuURL(current.id,value),{signal:request.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(token!==run)return null;
    if(response.status!==404&&!response.ok)throw Error('菜单暂时没有加载出来。');
    const raw=response.status===404?{year:expected.year,number:expected.week,days:[],missing:true}:await response.json();
    if(token!==run)return null;
    dishesFor(raw,value);return raw;
   }
   const raw=await readWeek(requested);if(!raw)return;
   let displayed=requested,items=dishesFor(raw,requested),displayedWeek=raw,lookupFailed=false;
   if(nearest&&!items.length){
    let candidate=nextMenuDate(raw,requested),upcoming=raw;
    if(!candidate&&!withinWeek){
     try{upcoming=await readWeek(offsetDate(requested,7));if(!upcoming)return;candidate=nextMenuDate(upcoming,requested);}
     catch(_){if(token!==run)return;lookupFailed=true;}
    }
    if(candidate){displayed=candidate;items=dishesFor(upcoming,candidate);displayedWeek=upcoming;}
   }
   if(token!==run)return;
   showDate(current,displayed);
   showWeek(displayedWeek,displayed);
   loadedWeek=displayedWeek;loadedFor=current.id;loadedAt=Date.now();
   dishes.innerHTML=renderDishes(items,catalog.labels,catalog.translations);
   const requestedState=menuState(raw,requested,{availability});
   status.textContent=items.length?(displayed===requested?`${items.length} 道菜品`:`${requested===berlinDate()?'今天':labelDay(requested)}${requestedState.kind==='closed'?'处于官方公告的休息期':requestedState.kind==='weekend-rest'?'周末休息':requestedState.kind==='regular-rest'?'按常规安排通常休息':'暂无菜单数据'}，已显示 ${labelDay(displayed)}的 ${items.length} 道菜品。`):requestedState.message;
   if(lookupFailed){status.textContent+=' 下周菜单读取失败，可重新加载。';retry.hidden=false;}
   next.hidden=items.length>0;
   app.setAttribute('aria-busy','false');
   if(items.length){
    try{
     const chinese=await readChinese(current,displayed,request.signal);
     if(token===run&&chinese)dishes.innerHTML=renderDishes(items,catalog.labels,mergeTranslations(catalog.translations,chinese));
    }catch(_){} // Translation failure must leave the already rendered source menu usable.
   }
  }catch(error){
   if(token!==run)return;
   showWeek(null,requested,{failed:true});
   status.textContent=menuState(null,requested,{failed:true}).message;retry.hidden=false;
  }finally{clearTimeout(timer);if(token===run)app.setAttribute('aria-busy','false');}
 }
 select.addEventListener('change',()=>load({nearest:date.value===berlinDate()}));
 $('today').addEventListener('click',()=>{date.value=berlinDate();load({nearest:true});});
 next.addEventListener('click',()=>{date.value=offsetDate(date.value,1);load({nearest:true});});
 $('week').addEventListener('click',event=>{
  const button=event.target.closest('[data-menu-date]');if(!button)return;
  date.value=button.dataset.menuDate;
  load({prefetched:loadedFor===select.value&&Date.now()-loadedAt<300000?loadedWeek:null});
 });
 for(const [id,direction] of [['previous-week',-7],['next-week',7]])$(id).addEventListener('click',()=>{
  date.value=offsetDate(weekDates(date.value)[0],direction);load({nearest:true,withinWeek:true});
 });
 retry.addEventListener('click',()=>load({nearest:date.value===berlinDate()}));
 load({nearest:!params.has('date')||date.value===berlinDate()});
})(typeof globalThis!=='undefined'?globalThis:this);
