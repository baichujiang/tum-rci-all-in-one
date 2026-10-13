/* The production checklist handlers must preserve another page's progress. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),C=require('../assets/core');
const key='rci:v2:checklist',source='(function(){const checklist='+fs.readFileSync(path.join(__dirname,'../site3/app.js'),'utf8').split('const checklist=')[1].replace(/\}\)\(\);\s*$/,'')+'})();';
async function page(storage,quota=false){
 const listeners={},events={},cells=Array.from({length:3},(_,i)=>({value:String(i),type:'checkbox',checked:false}));let notice='',writes=0;
 const read=(name,fallback)=>{try{return JSON.parse(storage.get(name)||'null')??fallback;}catch(_){return fallback;}};
 for(const cell of cells)cell.checked=(read(key,[])||[]).includes(Number(cell.value));
 const checklist={innerHTML:'',querySelectorAll:()=>cells,addEventListener(type,fn){listeners[type]=fn;}};
 vm.runInNewContext(source,{$:()=>checklist,esc:C.esc,data:async()=>({checklist:['First item','Second item','Third item']}),read,store(name,value){if(quota)return false;storage.set(name,JSON.stringify(value));writes++;return true;},
  localStorage:{getItem:name=>storage.get(name)??null},storageUnavailable:false,requireRecovered(){},withLocalLock:async fn=>fn(),toast:message=>{notice=message;},window:{addEventListener(type,fn){events[type]=fn;}}});
 await new Promise(resolve=>setImmediate(resolve));
 return {cells,notice:()=>notice,writes:()=>writes,async toggle(index){const cell=cells[index];cell.checked=!cell.checked;await listeners.change({target:cell});},storageEvent:()=>events.storage?.({key})};
}
(async()=>{
 const storage=new Map(),first=await page(storage),second=await page(storage);
 await first.toggle(0);await second.toggle(1);assert.deepEqual(JSON.parse(storage.get(key)),[0,1]);
 first.storageEvent();second.storageEvent();assert(first.cells[0].checked&&first.cells[1].checked&&second.cells[0].checked&&second.cells[1].checked);
 console.log('PASS Two pages preserve separate checklist changes and synchronize visible checks');
 const damaged=new Map([[key,'{damaged checklist']]),h=await page(damaged);await h.toggle(0);
 assert.equal(damaged.get(key),'{damaged checklist');assert.equal(h.writes(),0);assert.equal(h.cells[0].checked,false);assert(h.notice().includes('原始'));
 console.log('PASS Unreadable checklist records stay intact and the rejected check is restored');
 const blocked=new Map(),temporary=await page(blocked,true);await temporary.toggle(0);await temporary.toggle(1);
 assert(temporary.cells[0].checked&&temporary.cells[1].checked);assert.equal(blocked.has(key),false);assert(temporary.notice().includes('当前页面'));
 console.log('PASS Unsaved checklist changes remain together for the current page');
 console.log('3 checklist checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
