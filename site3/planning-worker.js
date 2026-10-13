/* Run search outside the UI thread. The worker receives only local plan + public facts. */
'use strict';
importScripts('core.js','timetable-core.js','planning-engine.js');
self.onmessage=event=>{try{self.postMessage(RCIPlanning.generate(event.data.plan,event.data.courses,event.data.details));}catch(error){self.postMessage({ok:false,reasons:[error.message],warnings:[]});}};
