/* Exercise backup preview recovery through the production dialog event handlers. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/core'),B=require('../site3/backup-core');
const courses=C.csv(fs.readFileSync(path.join(__dirname,'../data/courses_legal_2025.csv'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../site3/backup-ui.js'),'utf8');
const plan=items=>({version:2,cohort:'unknown',conditional:false,timeline:{count:4,start:'winter'},items});
function element(){return {value:'',textContent:'',hidden:true,disabled:false,listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},replaceChildren(){},append(){}};}
async function harness(records=[]){
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
 const dialog={...element(),open:false,querySelector:node,showModal(){this.open=true;},close(){this.open=false;this.listeners.close();}};
 let current={plan:plan([{code:'IN2067',status:'planned',semester:1}]),favorites:['R010']},imports=0;
 const control={historyError:false,backupPersisted:true};
 const history=[...records],documentListeners={},windowListeners={};
 const U={data:async()=>({courses}),backupSnapshot:async()=>({data:current,fingerprint:B.fingerprint(current)}),get backupPersisted(){return control.backupPersisted;},getBackupHistory(){if(control.historyError)throw new Error('历史备份无法读取。');return history;},
  async importBackup(incoming,mode,expected){if(expected.fingerprint!==B.fingerprint(current))throw new Error('当前数据已更新，请重新核对导入预览。');history.unshift(B.create(current,courses));current=B.prepare(current,incoming,mode,courses);imports++;}};
 const document={getElementById:()=>dialog,addEventListener:(type,fn)=>{documentListeners[type]=fn;},createElement:element};
 vm.runInNewContext(source,{window:{RCIUI:U,RCIBackup:B,addEventListener(type,fn){windowListeners[type]=fn;}},document},{filename:'site3/backup-ui.js'});
 await documentListeners.click({target:{closest:()=>({})},preventDefault(){}});
 const incoming=B.create({plan:plan([{code:'IN2064',status:'passed',semester:3}]),favorites:['R031']},courses),text=JSON.stringify(incoming);
 node('#backup-file').files=[{size:Buffer.byteLength(text),name:'fixture.json',text:async()=>text}];
 await node('#backup-file').listeners.change();node('#backup-mode').value='replace';await node('#backup-mode').listeners.change();
 return {node,dialog,history,control,async signal(){await windowListeners['rci:planchange']?.();},async reopen(){dialog.close();await documentListeners.click({target:{closest:()=>({})},preventDefault(){}});},changeCurrent(){current={...current,plan:plan([...current.plan.items,{code:'IN2076',status:'planned',semester:1}])};},imports:()=>imports};
}
(async()=>{
 const live=await harness();live.changeCurrent();await live.signal();
 assert(live.node('#backup-current').textContent.includes('2 门课程'),'An open backup panel must reflect another page’s new course');
 assert.equal(live.node('#backup-apply').disabled,true);assert.equal(live.node('#backup-refresh-preview').hidden,false);assert.equal(live.imports(),0);
 console.log('PASS Another page’s change updates current counts and disables a stale preview without importing');
 const temporary=await harness();temporary.control.historyError=true;temporary.control.backupPersisted=false;await temporary.reopen();
 assert(temporary.node('#backup-current').textContent.includes('1 门课程'),'A history failure must not hide the readable current plan');
 assert(temporary.node('#backup-current').textContent.includes('未保存'));assert(temporary.node('#backup-status').textContent.includes('仍可导出'));assert.equal(temporary.node('#backup-recovery').hidden,true);
 console.log('PASS Unreadable history does not hide an exportable temporary plan');
 const selectedRecord=B.create({plan:plan([{code:'IN2064',status:'planned',semester:1},{code:'IN2320',status:'planned',semester:4}]),favorites:['R031']},courses,'2026-10-12T10:00:00.000Z');
 const recovery=await harness([selectedRecord]);recovery.node('#backup-recovery-select').value='0';
 recovery.history.unshift(B.create({plan:plan([]),favorites:[]},courses,'2026-10-13T10:00:00.000Z'));
 await recovery.signal();
 await recovery.node('#backup-recovery-preview').listeners.click();
 assert(recovery.node('#backup-preview-counts').textContent.includes('导入后：2 门课程'),'Recovery must preview the displayed selection even if another page changes history');
 assert(recovery.node('#backup-file-name').textContent.includes('2026/10/12'));assert.equal(recovery.imports(),0);
 console.log('PASS Recovery previews the displayed record after another page changes history');
 const race=await harness();let finishFile;
 const next=B.create({plan:plan([{code:'IN2320',status:'planned',semester:4}]),favorites:[]},courses),text=JSON.stringify(next);
 race.node('#backup-file').files=[{size:Buffer.byteLength(text),name:'slow-file.json',text:()=>new Promise(resolve=>{finishFile=resolve;})}];
 const selected=race.node('#backup-file').listeners.change();await new Promise(resolve=>setImmediate(resolve));
 race.node('#backup-mode').value='merge';await race.node('#backup-mode').listeners.change();finishFile(text);await selected;
 assert.equal(race.node('#backup-preview').hidden,false,'Changing the import mode must not discard the selected file');
 assert.equal(race.node('#backup-apply').disabled,false);assert.equal(race.node('#backup-file-name').textContent,'slow-file.json');assert(race.node('#backup-preview-counts').textContent.includes('导入后：2 门课程'));
 console.log('PASS Changing the import mode while a file is loading still previews the selected file');
 const h=await harness();assert.equal(h.node('#backup-apply').disabled,false);
 h.changeCurrent();await h.node('#backup-apply').listeners.click();
 assert.equal(h.imports(),0);assert.equal(h.node('#backup-apply').disabled,true);assert(h.node('#backup-status').textContent.includes('当前数据已更新'));
 assert.equal(h.node('#backup-refresh-preview').hidden,false,'A stale preview needs a visible refresh action');
 console.log('PASS Stale previews preserve current records and offer an explicit refresh');
 await h.node('#backup-refresh-preview').listeners.click();
 assert(h.node('#backup-current').textContent.includes('2 门课程'));assert(h.node('#backup-preview-counts').textContent.includes('当前：2 门课程'));
 assert.equal(h.node('#backup-apply').disabled,false);assert.equal(h.imports(),0,'Refreshing must not apply the import');
 console.log('PASS Refresh updates current counts and requests confirmation without importing');
 await h.node('#backup-apply').listeners.click();assert.equal(h.imports(),1);assert.equal(h.node('#backup-preview').hidden,true);assert.equal(h.node('#backup-refresh-preview').hidden,true);
 console.log('PASS Confirmation after refresh imports once and clears the stale state');
 h.dialog.close();assert.equal(h.node('#backup-refresh-preview').hidden,true);
 console.log('PASS Closing the dialog clears the refresh action');
 console.log('8 backup dialog checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
