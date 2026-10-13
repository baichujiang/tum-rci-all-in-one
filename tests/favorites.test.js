/* Exercise the real search UI with favorites saved under historical resource IDs. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/core'),S=require('../site3/search'),B=require('../site3/backup-core');
const source=fs.readFileSync(path.join(__dirname,'../site3/app.js'),'utf8').split('// Preserve already shared routes')[0]+'})();';
const docs=[
 {id:'R059',resource_ids:['R055','R059'],kind:'resource',title:'MIRMI Robot Learning Lab',summary:'Research labs',aliases:['MIRMI'],url:'https://example.org/labs/',tasks:['research'],direct:true,status:'Historical entry'},
 {id:'R060',resource_ids:['R060'],kind:'resource',title:'MIRMI Other Lab',summary:'Another laboratory',aliases:[],url:'https://example.org/other/',tasks:['research'],direct:true,status:'Historical entry'},
 {id:'guide:thesis',kind:'guide',title:'Thesis guide',summary:'Writing a thesis',aliases:[],url:'/guides/thesis/',tasks:['research'],status:'Guide'}
];
function control(value=''){
 const listeners={},label={hidden:false};
 return {value,checked:false,hidden:false,innerHTML:'',textContent:'',listeners,
  closest:()=>label,addEventListener:(type,fn)=>{listeners[type]=fn;},focus(){}};
}
async function harness(favorites,{mode='resources',query='MIRMI',onlySaved=true}={}){
 const controls=Object.fromEntries(['page-search','kind-filter','task-filter','group-filter','term-filter','saved-filter','result-count','reset-filters','results','more-results'].map(id=>[id,control()]));
 const form=control(),app={dataset:{mode},querySelector:()=>form,addEventListener(){}};
 const stored=new Map([['rci:v2:saves',JSON.stringify(favorites)]]),windowListeners={},documentListeners={};
 const storageControl={quota:false,readBlocked:false};
 const window={RCILocalLock:require('../site3/local-lock'),RCI:C,RCISearch:S,RCIBackup:B,addEventListener(type,fn){(windowListeners[type]||=[]).push(fn);},dispatchEvent(event){for(const fn of windowListeners[event.type]||[])fn(event);}};
 const toast={children:[],replaceChildren(){this.children=[];},append(el){this.children.push(el);},contains(){return false;}};
 const params=new URLSearchParams({q:query,...(onlySaved?{saved:'1'}:{})});
 const context={window,navigator:{locks:{request:(_name,work)=>work()}},URLSearchParams,location:{search:'?'+params,pathname:'/resources/',hash:''},history:{replaceState(){}},
  document:{querySelector(selector){if(selector==='meta[name="rci-base"]')return {content:''};if(selector==='meta[name="rci-favorite-groups"]')return {content:JSON.stringify([['R055','R059']])};if(selector==='.header-favorites svg')return {outerHTML:'<svg></svg>'};if(selector==='#toast')return toast;if(selector==='#search-app')return app;return controls[selector.slice(1)]||null;},querySelectorAll(){return [];},addEventListener(type,fn){documentListeners[type]=fn;},createElement(){return {listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};}},
  localStorage:{getItem(key){if(storageControl.readBlocked)throw Error('Storage access revoked');return stored.get(key)??null;},setItem(key,value){if(storageControl.quota)throw Error('Quota exceeded');stored.set(key,value);}},
  fetch:async url=>({ok:true,json:async()=>url.endsWith('search-index.json')?{docs,synonyms:[]}:{courses:[],names:{}}}),
  Event:function(type){this.type=type;},setTimeout(){return 0;},clearTimeout(){}};
 vm.runInNewContext(source,context,{filename:'site3/app.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {controls,stored,storageControl,U:window.RCIUI,async storageEvent(key){window.dispatchEvent({type:'storage',key,newValue:null});await new Promise(resolve=>setImmediate(resolve));},notice:()=>toast.children.map(el=>el.textContent||'').join(' '),async clickSave(key){const button={dataset:{save:key,saveStyle:'star'},hasAttribute:name=>name==='data-save',closest:()=>null};await documentListeners.click({target:{closest:()=>button}});},async undo(){const button=toast.children.find(el=>el.textContent==='撤销');assert(button,'Cancellation must offer undo');await button.listeners.click();}};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
(async()=>{
 await test('Other-page storage events cannot discard exportable unsaved courses or bookmarks',async()=>{
  const h=await harness(['R055']);h.storageControl.quota=true;
  await h.clickSave('R060');
  await h.U.savePlan({...h.U.empty(),items:[{code:'OWN1',name:'Session course',custom:true,group:'G',ects:6,status:'planned',semester:1}]});
  h.stored.set(B.keys.plan,JSON.stringify({...h.U.empty(),items:[]}));h.stored.set(B.keys.favorites,JSON.stringify(['R031']));
  const observed=new Map(h.stored);
  for(const key of [B.keys.plan,B.keys.favorites,null,B.keys.journal])await h.storageEvent(key);
  const snapshot=await h.U.backupSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.data.plan.items)).map(item=>item.code),['OWN1']);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.data.favorites)),['R055','R060']);
  assert.equal(h.U.backupPersisted,false);assert.deepEqual(h.stored,observed);
  const persistent=await harness(['R055']);persistent.stored.set(B.keys.favorites,'[]');await persistent.storageEvent(B.keys.favorites);
  assert(persistent.controls['result-count'].textContent.includes('找到 0 条内容'),'Saved pages must continue synchronizing other-page changes');
 });
 await test('A later read failure preserves existing bookmarks while adding an unsaved session bookmark',async()=>{
  const h=await harness(['R055']);h.storageControl.readBlocked=true;await h.clickSave('R060');
  assert.deepEqual(JSON.parse(h.stored.get(B.keys.favorites)),['R055']);assert.equal(h.U.backupPersisted,false);
  assert.deepEqual(JSON.parse(JSON.stringify((await h.U.backupSnapshot()).data.favorites)),['R055','R060']);
 });
 await test('Restored write access cannot silently publish old temporary state over another page’s newer records',async()=>{
  const h=await harness(['R055']);h.storageControl.quota=true;await h.clickSave('R060');
  await h.U.savePlan({...h.U.empty(),items:[{code:'OWN1',name:'Session course',custom:true,group:'G',ects:6,status:'planned',semester:1}]});
  h.stored.set(B.keys.favorites,JSON.stringify(['R031']));h.stored.set(B.keys.plan,JSON.stringify(h.U.empty()));const before=new Map(h.stored);
  h.storageControl.quota=false;await h.clickSave('guide:thesis');
  await h.U.updatePlan(p=>({...p,items:[...p.items,{code:'OWN2',name:'Next session course',custom:true,group:'H',ects:5,status:'planned',semester:2}]}));
  assert.deepEqual(h.stored,before,'Resuming writes must not overwrite records that changed outside this temporary page');
  const snapshot=await h.U.backupSnapshot();assert.equal(snapshot.data.plan.items.length,2);assert.deepEqual(JSON.parse(JSON.stringify(snapshot.data.favorites)),['R055','R060','guide:thesis']);assert.equal(h.U.backupPersisted,false);
 });
 await test('A favorite storage failure keeps an exportable session change and reports it unsaved',async()=>{
  const h=await harness([]);h.storageControl.quota=true;await h.clickSave('R059');
  assert.deepEqual(JSON.parse(h.stored.get(B.keys.favorites)),[]);assert.equal(h.U.backupPersisted,false);
  assert.deepEqual(JSON.parse(JSON.stringify((await h.U.backupSnapshot()).data.favorites)),['R059']);assert(h.notice().includes('当前页面'));
 });
 await test('An already-open page preserves favorites while another import needs recovery',async()=>{
  const h=await harness(['R055']),raw=h.stored.get(B.keys.favorites);
  h.stored.set(B.keys.journal,JSON.stringify({version:1,before:{plan:null,favorites:raw,history:null}}));
  await h.clickSave('R059');assert.equal(h.stored.get(B.keys.favorites),raw);assert(h.notice().includes('恢复'));
 });
 await test('Adding a bookmark cannot make an imported maximum-size collection invalid',async()=>{
  const favorites=Array.from({length:2000},(_,i)=>'OLD-'+i),h=await harness(favorites),raw=h.stored.get('rci:v2:saves');
  await h.clickSave('R059');assert(h.stored.get('rci:v2:saves')===raw,'The original 2000 bookmarks must stay unchanged');assert(h.notice().includes('2000'));
  await h.clickSave('OLD-0');const remaining=JSON.parse(h.stored.get('rci:v2:saves'));assert.equal(remaining.length,1999);
  await h.clickSave('R059');assert.equal(B.favorites(JSON.parse(h.stored.get('rci:v2:saves'))).length,2000);
 });
 await test('Unreadable saved favorites are preserved and tell the user to keep a raw copy',async()=>{
  for(const raw of ['not-json',JSON.stringify({version:3,favorites:['R055']}),JSON.stringify([{}])]){
   const h=await harness([]);h.stored.set('rci:v2:saves',raw);await h.clickSave('R059');assert.equal(h.stored.get('rci:v2:saves'),raw);assert(h.notice().includes('原始'));
  }
 });
 await test('Only-saved search finds a resource bookmarked under its historical ID',async()=>{
  const h=await harness(['R055']);assert(h.controls['result-count'].textContent.includes('找到 1 条内容'));
  assert(h.controls.results.innerHTML.includes('MIRMI Robot Learning Lab'));assert(!h.controls.results.innerHTML.includes('MIRMI Other Lab'));
 });
 await test('Search shows the existing bookmark as selected and cancellation removes that same ID',async()=>{
  const h=await harness(['R055'],{onlySaved:false});assert(h.controls.results.innerHTML.includes('data-save="R055" aria-pressed="true"'));
  await h.clickSave('R055');assert.deepEqual(JSON.parse(h.stored.get('rci:v2:saves')),[]);
  assert(h.controls.results.innerHTML.includes('data-save="R059" aria-pressed="false"'));
 });
 await test('Canonical bookmarks remain visible and other resources remain filtered out',async()=>{
  const h=await harness(['R059']);assert(h.controls['result-count'].textContent.includes('找到 1 条内容'));assert(h.controls.results.innerHTML.includes('data-save="R059" aria-pressed="true"'));
 });
 await test('Guide bookmarks retain their existing IDs and filtering behavior',async()=>{
  const h=await harness(['guide:thesis'],{mode:'search',query:'Thesis'});assert(h.controls['result-count'].textContent.includes('找到 1 条内容'));assert(h.controls.results.innerHTML.includes('data-save="guide:thesis" aria-pressed="true"'));
 });
 await test('Cancellation removes every historical ID for the same website, and undo restores them',async()=>{
  const h=await harness(['R055','R059']);await h.clickSave('R059');assert.deepEqual(JSON.parse(h.stored.get('rci:v2:saves')),[]);
  await h.undo();assert.deepEqual(JSON.parse(h.stored.get('rci:v2:saves')),['R055','R059']);assert(h.controls['result-count'].textContent.includes('找到 1 条内容'));
 });
 await test('The shared favorite count groups historical IDs without dropping unknown bookmarks',async()=>{
  const h=await harness(['R055','R059','UNKNOWN']);assert.equal(h.U.countFavorites(['R055','R059','UNKNOWN']),2);
 });
 console.log(count+' favorite search checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
