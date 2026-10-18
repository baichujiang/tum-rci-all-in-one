/* Verify real menu boundaries: dates, weight prices, source safety and request races. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../site3/mensa'),C=require('../assets/core'),view=require('../scripts/mensa_view');
const catalog=require('../content/canteens.json');
const translations=require('../content/mensa-zh.json');
const availability=require('../content/mensa-availability.json');
const week=(date,name='Pasta',price={base_price:1,price_per_unit:.9,unit:'100g'})=>({number:M.weekOf(date).week,year:M.weekOf(date).year,days:[{date,dishes:[{name,dish_type:'Pasta',prices:{students:price},labels:['VEGETARIAN','MILK']}]}]});
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Berlin dates and ISO week years survive midnight, DST and New Year',()=>{
 assert.equal(M.berlinDate(new Date('2026-10-17T22:30:00Z')),'2026-10-18');
 assert.equal(M.berlinDate(new Date('2026-03-29T22:30:00Z')),'2026-03-30');
 assert.deepEqual(M.weekOf('2027-01-01'),{year:2026,week:53});
 assert.equal(M.menuURL('mensa-garching','2027-01-01'),'https://tum-dev.github.io/eat-api/mensa-garching/2026/53.json');
 assert.equal(M.offsetDate('2026-10-17',1),'2026-10-18');
 assert.equal(M.offsetDate('2026-12-31',1),'2027-01-01');
 for(const date of ['2026-02-30','2026-1-1','not-a-date'])assert.throws(()=>M.weekOf(date));
 assert.throws(()=>M.menuURL('../other','2026-10-17'));
});
test('Only the selected day can supply dishes; empty days never reuse an older menu',()=>{
 assert.equal(M.dishesFor(week('2026-10-16'),'2026-10-17').length,0);
 assert.equal(M.dishesFor(week('2026-10-19'),'2026-10-19')[0].name,'Pasta');
 assert.throws(()=>M.dishesFor(week('2026-10-19'),'2026-10-17'));
 assert.throws(()=>M.dishesFor({number:42,year:2026,days:[{date:'2026-10-17'}]},'2026-10-17'));
});
test('Student weight prices keep the surcharge separate and missing prices stay unknown',()=>{
 assert.equal(M.priceText({base_price:1,price_per_unit:.9,unit:'100g'}),'€0.90 / 100g，另加 €1.00');
 assert.equal(M.priceText({base_price:0,price_per_unit:.9,unit:'100g'}),'€0.90 / 100g');
 assert.equal(M.priceText({base_price:5,price_per_unit:0,unit:'100g'}),'€5.00');
 assert.equal(M.priceText({base_price:0,price_per_unit:3.2,unit:'Portion'}),'€3.20 / 份');
 for(const p of [null,{base_price:null,price_per_unit:.9,unit:'100g'},{base_price:'5'},{base_price:-1},{base_price:0,price_per_unit:.9}])assert.equal(M.priceText(p),'价格未提供');
});
test('Upstream dish names, categories and label descriptions remain inert text',()=>{
 const dishes=M.dishesFor(week('2026-10-19','<img src=x onerror=alert(1)>'),'2026-10-19');
 dishes[0].type='<script>alert(1)</script>';
 const html=M.renderDishes(dishes,{MILK:'<img src=x>'});
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));assert(html.includes('素食'));assert(html.includes('食材与过敏原标记'));
});
test('All 25 source-listed canteens have safe original links and a static fallback',()=>{
 assert.equal(catalog.canteens.length,25);assert.equal(new Set(catalog.canteens.map(c=>c.id)).size,25);
 for(const c of catalog.canteens){assert(/^[a-z0-9-]+$/.test(c.id));assert(['garching','munich','freising','other'].includes(c.group));assert(C.safeURL(c.menu_url));}
 const html=view({catalog,e:C.esc});
 const canteenSelect=html.match(/<select id="mensa-canteen"[^>]*>([\s\S]*?)<\/select>/)[1];assert.equal((canteenSelect.match(/<option /g)||[]).length,25);assert(html.includes('各食堂的原菜单'));assert(canteenSelect.includes('value="'+catalog.canteens[0].id+'" selected'));assert(!canteenSelect.includes('mensa-garching" selected'));
 const regionSelect=html.match(/<select id="mensa-place-region"[^>]*>([\s\S]*?)<\/select>/)[1],regionKeys=[...regionSelect.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);assert.deepEqual(regionKeys,['',...require('../site3/mensa-places').AREAS.map(([id])=>id)]);assert(!regionSelect.includes('<optgroup'));assert(canteenSelect.includes('奥林校区'));assert(!html.includes('只看食堂'));assert(html.includes('mensa-place-searchbar'));
 assert(!html.includes('type="date"'));assert(!html.includes('mensa-controls'));assert(/<nav class="mensa-week-navigation"[^>]*>[\s\S]*id="mensa-today"[\s\S]*<\/nav>/.test(html));
 const hostile={...catalog,canteens:catalog.canteens.map(c=>({...c,name:'</script><img src=x>'}))};
 assert(!view({catalog:hostile,e:C.esc}).includes('</script><img'));
});
test('Week overview spans Monday through Sunday across month and year boundaries',()=>{
 assert.deepEqual(M.weekDates('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
 const html=M.renderWeek(week('2026-10-19'),'2026-10-19');
 assert.equal((html.match(/data-menu-date=/g)||[]).length,7);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert(html.includes('1 道菜'));assert(html.includes('暂无数据'));assert(!M.renderWeek(null,'2026-10-19').includes('未公布'));
 assert.equal((html.match(/data-menu-weekend="true"/g)||[]).length,2);assert.equal((html.match(/周末休息<\/small>/g)||[]).length,2);
});
test('Regular opening hours group matching days without losing Friday differences or filling missing days',()=>{
 const hours=id=>catalog.canteens.find(c=>c.id===id).open_hours;
 assert.equal(M.openingHoursText(hours('mensa-garching')),'常规营业：周一至周五 10:45–14:15');
 assert.equal(M.openingHoursText(hours('mensa-leopoldstr')),'常规营业：周一至周四 11:00–14:30；周五 11:00–14:00');
 assert.equal(M.openingHoursText(hours('stucafe-pasing')),'常规营业：周一至周二 07:45–16:15；周三至周四 07:45–16:00；周五 07:45–14:30');
 const range={start:'11:00',end:'14:00'};assert.equal(M.openingHoursText({mon:range,wed:range,thu:range}),'常规营业：周一 11:00–14:00；周三至周四 11:00–14:00');
 for(const missing of [null,{}, {mon:{start:'<img>',end:'14:00'}},{mon:{start:'14:00',end:'11:00'}},{mon:{start:'24:00',end:'25:00'}}])assert.equal(M.openingHoursText(missing),'常规营业时间暂未提供');
 for(const c of catalog.canteens)assert.notEqual(M.openingHoursText(c.open_hours),'常规营业时间暂未提供',c.id);
 assert(view({catalog,e:C.esc}).includes('常规营业：周一至周五 11:00–14:00'));
});
test('Only sourced notices identify holiday closures; regular rest and absent menus remain distinct',()=>{
 const opening=M.availabilityFor(availability,'mensa-garching');
 for(const date of ['2026-12-24','2027-01-01','2027-01-06']){
  const state=M.menuState({...M.weekOf(date),number:M.weekOf(date).week,days:[]},date,{availability:opening});assert.equal(state.kind,'closed');assert(state.message.includes('圣诞／新年'));assert(state.message.includes('2026-10-18'));assert(state.message.includes('2027-01-06'));
 }
 assert.equal(M.menuState(week('2026-12-24'),'2026-12-24',{availability:opening}).kind,'menu');
 assert.equal(M.menuState(week('2026-10-19'),'2026-10-25',{availability:opening}).kind,'weekend-rest');
 assert.equal(M.menuState(week('2026-10-19'),'2026-10-20',{availability:opening}).kind,'unknown');
 assert.equal(M.menuState(week('2026-10-19'),'2026-10-25').kind,'weekend-rest');
 assert.equal(M.menuState({number:1,year:2027,days:[]},'2027-01-07',{availability:opening}).kind,'unknown');
 const missing=M.menuState({number:43,year:2026,days:[],missing:true},'2026-10-20',{availability:opening});assert(missing.message.includes('本周'));assert(!missing.message.includes('已关门'));
 const failed=M.renderWeek(null,'2026-12-24',{availability:opening,failed:true});assert.equal((failed.match(/data-menu-state="error"/g)||[]).length,7);assert(!failed.includes('公告休息'));
});
test('Availability evidence refers to known canteens, explicit dates and official sources without assuming all 25 share a calendar',()=>{
 const ids=new Set(catalog.canteens.map(c=>c.id));assert.equal(Object.keys(availability.canteens).length,21);assert(!M.availabilityFor(availability,'mensa-bildungscampus-heilbronn'));
 for(const [id,entry] of Object.entries(availability.canteens)){
  assert(ids.has(id));const source=new URL(availability.sources[entry.source]);assert.equal(source.protocol,'https:');assert.equal(source.hostname,'www.studierendenwerk-muenchen-oberbayern.de');assert(entry.regular_days.every(n=>Number.isInteger(n)&&n>=0&&n<=6));
  for(const key of entry.periods){const period=availability.periods[key];M.weekOf(period.from);M.weekOf(period.to);assert(period.from<=period.to);assert(period.reason);}
 }
 const garching=M.renderWeek(week('2026-10-19'),'2026-10-19',{availability:M.availabilityFor(availability,'mensa-garching')});assert(garching.includes('周末休息'));assert(garching.includes('暂无数据'));
 const malicious={closures:[{from:'2026-10-20',to:'2026-10-20',reason:'<img src=x>'}]};assert(!M.renderWeek(week('2026-10-19'),'2026-10-20',{availability:malicious}).includes('<img'));
});
test('Chinese names match the complete German name while keeping original names and live prices',()=>{
 const original=M.dishesFor(week('2026-10-19','Kürbis-Mezzalune mit Ricotta-Sauce'),'2026-10-19');
 const html=M.renderDishes(original,catalog.labels,translations);
 assert(html.includes('<h3 lang="zh-CN">南瓜馅意式半月饺配乳清奶酪酱</h3>'));assert(html.includes('德文原名：<span lang="de">Kürbis-Mezzalune mit Ricotta-Sauce</span>'));
 assert(html.includes('意面'));assert(html.includes('牛奶'));assert(html.includes('€0.90 / 100g，另加 €1.00'));assert.equal(original[0].name,'Kürbis-Mezzalune mit Ricotta-Sauce');
 assert.equal(M.lookupTranslation(translations.dishes,'Ku\u0308rbis-Mezzalune mit Ricotta-Sauce'),translations.dishes[original[0].name]);
 assert.equal(M.lookupTranslation(translations.dishes,' Haferjoghurt  mit Granola \n'),'燕麦酸奶配格兰诺拉麦片');
 assert.equal(M.lookupTranslation(translations.dishes,'Pommes frites'),'薯条');
 assert.equal(M.lookupTranslation(translations.dishes,'PASTA BOLOGNESE'),'博洛尼亚肉酱意面');
 assert.equal(M.lookupTranslation({Pasta:'意面',PASTA:'另一种菜'},'pasta'),'');
 assert.equal(M.lookupTranslation(translations.dishes,'Kürbis-Mezzalune mit anderer Sauce'),'');
 const ambiguous=M.renderDishes([{name:'Grünkohl-Hanfbällchen mit Reis (V)',type:'Gericht 1',labels:['MEAT'],price:{base_price:3}}],catalog.labels,translations);
 assert(!ambiguous.includes('纯素'));assert(!ambiguous.includes('mensa-diet'));assert(ambiguous.includes('肉类'));
});
test('Unlisted dishes and dictionary prototype keys stay in German without invented translations',()=>{
 const raw=week('2026-10-19','Neues Gericht mit anderer Sauce');raw.days[0].dishes.push({...raw.days[0].dishes[0],name:'toString'});
 const html=M.renderDishes(M.dishesFor(raw,'2026-10-19'),catalog.labels,translations);
 assert(html.includes('<h3 lang="de">Neues Gericht mit anderer Sauce</h3>'));assert(html.includes('<h3 lang="de">toString</h3>'));assert(!html.includes('lang="zh-CN"'));assert(html.includes('中文译名待补充'));assert(!html.includes('德文原名：'));
 const hostile=M.renderDishes(M.dishesFor(week('2026-10-19','Pasta'),'2026-10-19'),catalog.labels,{dishes:{Pasta:'<img src=x onerror=alert(1)>'},categories:{Pasta:'<script>bad</script>'}});
 assert(!hostile.includes('<img'));assert(!hostile.includes('<script>'));assert(hostile.includes('&lt;img'));
});
test('Source category codes and newly numbered dishes have Chinese names without losing their numbers',()=>{
 for(const [raw,zh] of [['HG1','主菜 1'],['HG4','主菜 4'],['B4','配菜 4'],['N3','甜品 3'],['Gericht 6','菜品 6'],['Beilage 2','配菜 2']])assert.equal(M.categoryTranslation(translations.categories,raw),zh);
 assert.equal(M.categoryTranslation(translations.categories,'NEW_GROUP'),'');
 const dish={...M.dishesFor(week('2026-10-19','Obstsalat'),'2026-10-19')[0],type:'HG1',labels:['MILK','NEW_MARKER']};
 const html=M.renderDishes([dish],catalog.labels,translations);assert(html.includes('主菜 1'));assert(html.includes('牛奶'));assert(html.includes('未识别标记：NEW_MARKER'));assert(!html.includes('new marker'));
});
test('Chinese reference data has normalized unique keys and Chinese values for every label',()=>{
 assert.equal(translations.version,1);assert.equal(translations.source,'https://tum-dev.github.io/eat-api/');
 for(const dictionary of [translations.dishes,translations.categories])for(const [name,zh] of Object.entries(dictionary)){
  assert.equal(name,name.normalize('NFC').trim().replace(/\s+/g,' '));assert(/[\u3400-\u9fff]/.test(zh));assert(!/[<>]/.test(zh));
 }
 for(const value of Object.values(catalog.labels))assert(/[\u3400-\u9fff]/.test(value));
 const html=view({catalog:{...catalog,translations},e:C.esc});assert(!html.includes('mensa-footnote'));assert(!html.includes('英文参考'));assert(html.includes('南瓜馅意式半月饺'));
});
function harness(search='',now='2026-10-17T12:00:00Z',cloud=false){
 const nodes={};
 for(const id of ['app','canteen','date','status','dishes','retry','next','name','address','hours','source','opening','date-label','today','week','week-label','previous-week','next-week'])nodes['mensa-'+id]={value:id==='canteen'?'mensa-garching':'',hidden:false,innerHTML:'',textContent:'',handlers:{},attrs:{},addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(name,value){this.attrs[name]=value;}};
 nodes['mensa-catalog']={textContent:JSON.stringify({...catalog,translations,availability,translation_url:'/api/mensa-translations'})};
 const requests=[],cloudRequests=[],timers=new Set(),history=[];
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]));}}
 const context={document:{getElementById:id=>nodes[id]},location:{href:'https://rci.example/mensa/'+search,search},history:{replaceState:(_,__,url)=>history.push(url)},URL,URLSearchParams,Intl,Date:FixedDate,AbortController,setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),fetch:(url,options)=>{const isCloud=url.includes('/api/mensa-translations');if(isCloud&&!cloud)return Promise.resolve({ok:false,status:503});return new Promise((resolve,reject)=>(isCloud?cloudRequests:requests).push({url,options,resolve,reject}));}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../site3/mensa'),'utf8'),context);
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {nodes,requests,cloudRequests,timers,history,tick,change:(id,value)=>{if(id==='date')nodes['mensa-week'].handlers.click({target:{closest:()=>({dataset:{menuDate:value}})}});else{nodes['mensa-'+id].value=value;nodes['mensa-'+id].handlers.change();}},resolve:async(index,data,status=200)=>{requests[index].resolve({status,ok:status===200,json:async()=>data});await tick();}};
}
(async()=>{
 const h=harness();assert(h.requests[0].url.endsWith('/mensa-garching/2026/42.json'));assert.equal(h.requests[0].options.credentials,'omit');assert.equal(h.nodes['mensa-hours'].textContent,'常规营业：周一至周五 10:45–14:15');
 await h.resolve(0,week('2026-10-16'));assert.equal(h.requests.length,2);assert(h.requests[1].url.endsWith('/2026/43.json'));
 await h.resolve(1,week('2026-10-19','Monday pasta'));assert.equal(h.nodes['mensa-date'].value,'2026-10-19');assert(h.nodes['mensa-dishes'].innerHTML.includes('Monday pasta'));assert(h.nodes['mensa-status'].textContent.includes('周末休息'));assert(h.nodes['mensa-status'].textContent.includes('10月19日'));assert(h.history.at(-1).includes('date=2026-10-19'));assert(h.nodes['mensa-next'].hidden);
 console.log('PASS Opening on a menu-free weekend automatically shows the next published date and explains the change');count++;
 h.change('canteen','mensa-arcisstr');assert.equal(h.nodes['mensa-hours'].textContent,'常规营业：周一至周五 11:00–14:00');h.change('canteen','mensa-garching');assert.equal(h.nodes['mensa-hours'].textContent,'常规营业：周一至周五 10:45–14:15');assert(h.requests[2].options.signal.aborted);
 await h.resolve(3,week('2026-10-19','Current menu'));await h.resolve(2,week('2026-10-19','Stale menu'));assert(h.nodes['mensa-dishes'].innerHTML.includes('Current menu'));assert(!h.nodes['mensa-dishes'].innerHTML.includes('Stale menu'));
 console.log('PASS Fast canteen switching cannot publish a late menu from a different location');count++;
 h.change('date','2026-10-27');h.change('date','');await h.resolve(4,week('2026-10-27','Wrong date'));assert.equal(h.nodes['mensa-dishes'].innerHTML,'');assert(h.nodes['mensa-status'].textContent.includes('有效日期'));assert.equal(h.nodes['mensa-app'].attrs['aria-busy'],'false');
 console.log('PASS Invalidated dates cancel in-flight menus instead of displaying stale dishes');count++;
 h.change('date','2026-10-21');h.requests[5].reject(Error('offline'));await h.tick();assert(!h.nodes['mensa-retry'].hidden);assert(h.nodes['mensa-status'].textContent.includes('读取失败'));assert.equal(h.nodes['mensa-dishes'].innerHTML,'');assert(h.nodes['mensa-week'].innerHTML.includes('读取失败'));
 h.nodes['mensa-retry'].handlers.click();await h.resolve(6,null,404);assert(h.nodes['mensa-status'].textContent.includes('暂无本周菜单'));assert(h.nodes['mensa-retry'].hidden);assert.equal(h.timers.size,0);
 console.log('PASS Network failure and unavailable menus have distinct retry and empty states');count++;
 const explicit=harness('?date=2026-10-18');await explicit.resolve(0,week('2026-10-16'));assert.equal(explicit.requests.length,1);assert.equal(explicit.nodes['mensa-date'].value,'2026-10-18');assert(explicit.nodes['mensa-status'].textContent.includes('周末休息'));assert.equal(explicit.nodes['mensa-dishes'].innerHTML,'');
 explicit.change('date','2026-10-20');await explicit.resolve(1,week('2026-10-21','Wednesday only'));assert.equal(explicit.requests.length,2);assert.equal(explicit.nodes['mensa-date'].value,'2026-10-20');assert(!explicit.nodes['mensa-dishes'].innerHTML.includes('Wednesday only'));
 console.log('PASS Explicit links and manually selected dates remain exact even when another day has dishes');count++;
 const older=harness('?date=2026-10-09');await older.resolve(0,week('2026-10-09','Amaretto Creme'));assert(older.nodes['mensa-dishes'].innerHTML.includes('杏仁利口酒奶油甜品'));assert(older.nodes['mensa-dishes'].innerHTML.includes('德文原名：'));assert.equal(older.nodes['mensa-date'].value,'2026-10-09');assert(!older.nodes['mensa-dishes'].innerHTML.includes('中文译名待补充'));
 console.log('PASS Historical menu dates use the same Chinese references as current menus');count++;
 const upcoming=harness('?date=2026-10-29');await upcoming.resolve(0,week('2026-10-29','Gegrilltes Putensteak (1 Stück) mit Paprikasauce'));assert(upcoming.nodes['mensa-dishes'].innerHTML.includes('烤火鸡排（1 块），配甜椒酱'));assert(upcoming.nodes['mensa-dishes'].innerHTML.includes('德文原名：'));assert(upcoming.nodes['mensa-dishes'].innerHTML.includes('Gegrilltes Putensteak (1 Stück) mit Paprikasauce'));assert(!upcoming.nodes['mensa-dishes'].innerHTML.includes('中文译名待补充'));
 console.log('PASS The reported turkey steak on October 29 has a Chinese name and retains its German original');count++;
 const current=harness();await current.resolve(0,week('2026-10-17','Saturday lunch'));assert.equal(current.requests.length,1);assert.equal(current.nodes['mensa-date'].value,'2026-10-17');assert(current.nodes['mensa-dishes'].innerHTML.includes('Saturday lunch'));
 assert.equal(M.menuState(week('2026-10-17'),'2026-10-17').kind,'menu');assert(current.nodes['mensa-status'].textContent.includes('1 道菜品'));
 console.log('PASS Published weekend menus stay on today instead of assuming every canteen is closed');count++;
 const sameWeek=harness('','2026-10-19T12:00:00Z');await sameWeek.resolve(0,week('2026-10-21','First available Wednesday'));assert.equal(sameWeek.requests.length,1);assert.equal(sameWeek.nodes['mensa-date'].value,'2026-10-21');assert(sameWeek.nodes['mensa-dishes'].innerHTML.includes('First available Wednesday'));
 console.log('PASS Automatic selection uses the nearest real menu date rather than guessing the next weekday');count++;
 const noFeed=harness();await noFeed.resolve(0,null,404);await noFeed.resolve(1,null,404);assert.equal(noFeed.requests.length,2);assert.equal(noFeed.nodes['mensa-date'].value,'2026-10-17');assert(noFeed.nodes['mensa-status'].textContent.includes('周末休息'));assert(noFeed.nodes['mensa-retry'].hidden);assert.equal(noFeed.timers.size,0);
 console.log('PASS Missing current and next-week feeds stop after two requests without inventing dishes');count++;
 const closure=harness('?date=2026-12-24');await closure.resolve(0,null,404);assert(closure.nodes['mensa-status'].textContent.includes('圣诞／新年假期'));assert(closure.nodes['mensa-status'].textContent.includes('2026-12-24 至 2027-01-06'));assert(!closure.nodes['mensa-opening'].hidden);assert.equal(closure.nodes['mensa-opening'].href,availability.sources.garching);
 closure.change('canteen','fmi-bistro');await closure.resolve(1,null,404);assert(closure.nodes['mensa-opening'].hidden);assert(!closure.nodes['mensa-status'].textContent.includes('圣诞'));assert(closure.nodes['mensa-status'].textContent.includes('无法确认'));
 console.log('PASS Official holiday notices include the exact period and source, while unverified canteens remain unknown');count++;
 const partial=harness();await partial.resolve(0,week('2026-10-16'));partial.requests[1].reject(Error('next week offline'));await partial.tick();assert(partial.nodes['mensa-status'].textContent.includes('周末休息'));assert(partial.nodes['mensa-status'].textContent.includes('下周菜单读取失败'));assert(!partial.nodes['mensa-retry'].hidden);assert(partial.nodes['mensa-week'].innerHTML.includes('1 道菜'));assert(!partial.nodes['mensa-week'].innerHTML.includes('data-menu-state="error"'));
 for(const response of [503,200]){const broken=harness('?date=2026-12-24');await broken.resolve(0,{days:'broken'},response);assert(broken.nodes['mensa-status'].textContent.includes('读取失败'));assert(!broken.nodes['mensa-status'].textContent.includes('官方已公告'));assert(!broken.nodes['mensa-retry'].hidden);}
 console.log('PASS Service and malformed-data failures remain errors; a failed next-week search preserves known current-week state');count++;
 const cancelled=harness();await cancelled.resolve(0,week('2026-10-16'));cancelled.change('canteen','mensa-arcisstr');assert(cancelled.requests[1].options.signal.aborted);await cancelled.resolve(2,week('2026-10-17','Arcis today'));await cancelled.resolve(1,week('2026-10-19','Old location Monday'));assert(cancelled.nodes['mensa-dishes'].innerHTML.includes('Arcis today'));assert(!cancelled.nodes['mensa-dishes'].innerHTML.includes('Old location Monday'));assert.equal(cancelled.nodes['mensa-date'].value,'2026-10-17');assert.equal(cancelled.timers.size,0);
 console.log('PASS A cancelled next-week lookup cannot change the new canteen or its selected date');count++;
 const tabs=harness('?date=2026-10-19');const twoDays=week('2026-10-19','Monday original');twoDays.days.push(week('2026-10-20','Tuesday original').days[0]);await tabs.resolve(0,twoDays);tabs.nodes['mensa-week'].handlers.click({target:{closest:()=>({dataset:{menuDate:'2026-10-20'}})}});await tabs.tick();assert.equal(tabs.requests.length,1);assert.equal(tabs.nodes['mensa-date'].value,'2026-10-20');assert(tabs.nodes['mensa-dishes'].innerHTML.includes('Tuesday original'));assert(!tabs.nodes['mensa-dishes'].innerHTML.includes('Monday original'));
 console.log('PASS Clicking a weekday reuses the loaded week and instantly shows that exact day');count++;
 tabs.nodes['mensa-previous-week'].handlers.click();await tabs.resolve(1,week('2026-10-16','Previous Friday'));assert.equal(tabs.nodes['mensa-date'].value,'2026-10-16');assert.equal(tabs.requests.length,2);assert(tabs.nodes['mensa-week-label'].textContent.includes('10月12日'));
 tabs.nodes['mensa-next-week'].handlers.click();await tabs.resolve(2,null,404);assert.equal(tabs.nodes['mensa-date'].value,'2026-10-19');assert.equal(tabs.requests.length,3);assert(tabs.nodes['mensa-week-label'].textContent.includes('10月19日'));
 console.log('PASS Week arrows stay in the chosen week even if it has no published menu');count++;
 const bilingual=harness('?date=2026-10-19');const chineseDays=week('2026-10-19','Kürbis-Mezzalune mit Ricotta-Sauce');chineseDays.days.push(week('2026-10-20','Veganes Nasi Goreng mit Sprossen').days[0]);await bilingual.resolve(0,chineseDays);
 assert(bilingual.nodes['mensa-dishes'].innerHTML.includes('南瓜馅意式半月饺'));assert(bilingual.nodes['mensa-dishes'].innerHTML.includes('Kürbis-Mezzalune mit Ricotta-Sauce'));assert.equal(bilingual.requests.length,1);assert.equal(bilingual.nodes['mensa-app'].attrs['aria-busy'],'false');
 bilingual.nodes['mensa-week'].handlers.click({target:{closest:()=>({dataset:{menuDate:'2026-10-20'}})}});await bilingual.tick();assert(bilingual.nodes['mensa-dishes'].innerHTML.includes('纯素印尼炒饭配豆芽'));assert(!bilingual.nodes['mensa-dishes'].innerHTML.includes('南瓜馅意式半月饺'));assert.equal(bilingual.requests.length,1);assert.equal(bilingual.timers.size,0);
 console.log('PASS Chinese renders immediately with German originals and follows weekday changes without translation requests');count++;
 const reordered=M.dishesFor(week('2026-10-19','Topfencreme mit Himbeeren'),'2026-10-19');reordered.push({...reordered[0],name:'Karotten-Kürbisragout'});
 const reorderedHtml=M.renderDishes(reordered,catalog.labels,translations);assert(reorderedHtml.indexOf('夸克奶酪甜品配树莓')<reorderedHtml.indexOf('胡萝卜南瓜炖菜'));assert(reorderedHtml.includes('Topfencreme mit Himbeeren'));assert(reorderedHtml.includes('Karotten-Kürbisragout'));
 console.log('PASS Dish reordering cannot attach another dish’s Chinese reference despite identical price and label metadata');count++;

 const cloud=harness('?date=2026-10-19','2026-10-19T12:00:00Z',true);const fresh=week('2026-10-19','Neue Gemüsepfanne');fresh.days.push(week('2026-10-20','Neue Gemüsepfanne').days[0]);await cloud.resolve(0,fresh);
 assert(cloud.nodes['mensa-dishes'].innerHTML.includes('Neue Gemüsepfanne'));assert.equal(cloud.nodes['mensa-app'].attrs['aria-busy'],'false');assert.equal(cloud.cloudRequests.length,1);
 const cloudData={version:1,canteen:'mensa-garching',...M.weekOf('2026-10-19'),dishes:{'Neue Gemüsepfanne':'新鲜蔬菜锅'}};
 cloud.cloudRequests[0].resolve({ok:true,json:async()=>cloudData});await cloud.tick();assert(cloud.nodes['mensa-dishes'].innerHTML.includes('<h3 lang="zh-CN">新鲜蔬菜锅</h3>'));assert(cloud.nodes['mensa-dishes'].innerHTML.includes('德文原名：'));assert(cloud.nodes['mensa-dishes'].innerHTML.includes('€0.90 / 100g，另加 €1.00'));
 cloud.nodes['mensa-week'].handlers.click({target:{closest:()=>({dataset:{menuDate:'2026-10-20'}})}});await cloud.tick();assert.equal(cloud.cloudRequests.length,1);assert.equal(cloud.requests.length,1);assert(cloud.nodes['mensa-dishes'].innerHTML.includes('新鲜蔬菜锅'));
 console.log('PASS Cached new Chinese names appear after source render and are reused across weekdays');count++;
 const stale=harness('?date=2026-10-19','2026-10-19T12:00:00Z',true);await stale.resolve(0,week('2026-10-19','Neue Gemüsepfanne'));stale.change('canteen','mensa-arcisstr');await stale.resolve(1,week('2026-10-19','Arcis menu'));assert(stale.cloudRequests[0].options.signal.aborted);
 stale.cloudRequests[0].resolve({ok:true,json:async()=>cloudData});stale.cloudRequests[1].reject(Error('cache offline'));await stale.tick();assert(stale.nodes['mensa-dishes'].innerHTML.includes('Arcis menu'));assert(!stale.nodes['mensa-dishes'].innerHTML.includes('新鲜蔬菜锅'));assert(stale.nodes['mensa-retry'].hidden);
 console.log('PASS Stale Chinese requests and cache failures cannot replace the selected canteen or hide its menu');count++;
 const mismatched=harness('?date=2026-10-19','2026-10-19T12:00:00Z',true);await mismatched.resolve(0,week('2026-10-19','Neue Gemüsepfanne'));mismatched.cloudRequests[0].resolve({ok:true,json:async()=>({...cloudData,week:44})});await mismatched.tick();assert(!mismatched.nodes['mensa-dishes'].innerHTML.includes('新鲜蔬菜锅'));
 const merged=M.mergeTranslations(translations,{'POMMES FRITES':'错误菜名','Neue Gemüsepfanne':'蔬菜锅',hostile:'<img>中文'});assert.equal(M.lookupTranslation(merged.dishes,'Pommes frites'),'薯条');assert.equal(M.lookupTranslation(merged.dishes,'NEUE Gemüsepfanne'),'蔬菜锅');assert.equal(M.lookupTranslation(merged.dishes,'hostile'),'');
 console.log('PASS Chinese caches require the selected week and curated names retain priority after case normalization');count++;
 console.log(count+' menu checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
