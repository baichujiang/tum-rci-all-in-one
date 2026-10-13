/* Serialize same-origin local records without expiring localStorage leases. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RCILocalLock=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const unavailable=()=>Object.assign(new Error('浏览器无法安全保存。请先导出备份，再刷新重试。'),{lockUnavailable:true});
 const lost=()=>Object.assign(new Error('本地保存已中断，请刷新并重新核对记录。'),{lockLost:true});
 function create({locks,indexedDB}={}){
  let opening;
  function open(){
   if(opening)return opening;
   opening=new Promise((resolve,reject)=>{
    if(!indexedDB){reject(unavailable());return;}
    let request,failed=false;
    try{request=indexedDB.open('rci:local-data-lock',1);}catch(_){reject(unavailable());return;}
    const fail=()=>{failed=true;reject(unavailable());};
    request.onupgradeneeded=()=>request.result.createObjectStore('mutex');
    request.onerror=fail;request.onblocked=fail;
    request.onsuccess=()=>{
     const db=request.result;
     if(failed){db.close();return;}
     db.onversionchange=()=>{db.close();opening=null;};
     resolve(db);
    };
   });
   return opening;
  }
  async function indexed(work){
   const db=await open();
   return new Promise((resolve,reject)=>{
    let tx,started=false,done=false,live=true,result,error,workFailed=false;
    try{tx=db.transaction('mutex','readwrite');}catch(_){reject(unavailable());return;}
    const assertHeld=()=>{if(!live)throw lost();};
    tx.onabort=()=>{live=false;reject(started?lost():unavailable());};
    tx.oncomplete=()=>{live=false;if(!done)reject(lost());else if(workFailed)reject(error);else resolve(result);};
    // Queue a request before yielding. The transaction stays live while the
    // short read/commit callback runs, including its promise continuations.
    // No dialog or network fetch belongs inside this critical section.
    function pump(){
     if(done||!live)return;
     let request;
     try{request=tx.objectStore('mutex').get('local-data');}catch(_){tx.abort();return;}
     request.onsuccess=()=>{
      if(!live)return;
      if(!started){
       started=true;
       Promise.resolve().then(()=>{assertHeld();return work(assertHeld);}).then(value=>{result=value;done=true;},err=>{error=err;workFailed=true;done=true;});
      }
      pump();
     };
    }
    pump();
   });
  }
  async function run(work){
   if(locks?.request){
    let started=false;
    try{return await locks.request('rci:local-data',()=>{started=true;return work(()=>{});});}
    catch(err){if(started)throw err;throw unavailable();}
   }
   return indexed(work);
  }
  return {run};
 }
 return {create};
});
