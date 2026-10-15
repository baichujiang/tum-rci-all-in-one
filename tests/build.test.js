/* A failed source edit must not destroy the last complete local preview. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rci-build-test-'));
const environment={...process.env,BASE_PATH:'',SITE_URL:'',VERCEL_PROJECT_PRODUCTION_URL:'',VERCEL_GIT_COMMIT_SHA:'',GITHUB_SHA:''};
function build(extra={}){return spawnSync(process.execPath,['scripts/build_site.js'],{cwd:fixture,env:{...environment,...extra},encoding:'utf8'});}
function manifest(dir){
 const files=fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?manifest(path.join(dir,entry.name)).map(([name,hash])=>[entry.name+'/'+name,hash]):[[entry.name,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,entry.name))).digest('hex')]]);
 return files.sort(([a],[b])=>a.localeCompare(b));
}
try{
 const deployment=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 assert(deployment.buildCommand.length<=256,'Vercel build commands must fit the deployment schema limit');
 const releaseScript=deployment.buildCommand.match(/^node (scripts\/[a-z_-]+\.js)$/);
 assert(releaseScript&&fs.existsSync(path.join(root,releaseScript[1])),'The release command must reference an existing local verification script');
 console.log('PASS Release build command fits the platform schema and resolves its local script');
 for(const folder of ['scripts','assets','site3','content','data','guides'])fs.cpSync(path.join(root,folder),path.join(fixture,folder),{recursive:true});
 const first=build();assert.equal(first.status,0,first.stderr);const original=manifest(path.join(fixture,'dist'));
 const navFile=path.join(fixture,'content/navigation.json'),nav=JSON.parse(fs.readFileSync(navFile,'utf8'));
 fs.writeFileSync(navFile,JSON.stringify({...nav,resource_display_ids:['MISSING-RESOURCE']}));
 const failed=build();assert.notEqual(failed.status,0);assert(failed.stderr.includes('Unknown resource display ID'));
 const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 assert.equal(digest(manifest(path.join(fixture,'dist'))),digest(original),'A failed build must leave the previous output byte-for-byte intact');
 console.log('PASS Source validation failure preserves the complete previous preview');
 fs.writeFileSync(navFile,JSON.stringify(nav));
 const prefixed=build({BASE_PATH:'/rci',SITE_URL:'https://rci.example.invalid'});assert.equal(prefixed.status,0,prefixed.stderr);
 const info=JSON.parse(fs.readFileSync(path.join(fixture,'dist/build-info.json'),'utf8'));
 assert.equal(info.base,'/rci');assert.equal(info.pages,638);assert.equal(info.searchRecords,809);
 assert(fs.readFileSync(path.join(fixture,'dist/sitemap.xml'),'utf8').includes('https://rci.example.invalid/rci/guides/matching/'));
 console.log('PASS A following valid build publishes a complete prefixed site without temporary files');
 const published=digest(manifest(path.join(fixture,'dist')));
 for(const options of [{BASE_PATH:'//rci'},{BASE_PATH:'/rci//nested'},{SITE_URL:'https://rci.example.invalid?source=qa'},{SITE_URL:'https://rci.example.invalid#about'},{SITE_URL:'https://qa:placeholder@rci.example.invalid'},{SITE_URL:'https://rci.example.invalid\\unexpected'},{SITE_URL:'https://rci.example.invalid\n'}]){
  const invalid=build(options);assert.notEqual(invalid.status,0,'Malformed deployment settings must be rejected');
  assert.equal(digest(manifest(path.join(fixture,'dist'))),published);
 }
 assert(!fs.readdirSync(fixture).some(name=>name.startsWith('.site-build-')),'Completed and failed builds must clean their staging files');
 console.log('PASS Invalid deployment paths and non-origin URLs cannot publish broken navigation');
 const rejectFile=path.join(fixture,'reject-publication.cjs');
 fs.writeFileSync(rejectFile,"const fs=require('node:fs'),path=require('node:path'),rename=fs.renameSync;fs.renameSync=(from,to)=>{const name=path.basename(from);if(name.startsWith('.site-build-')&&!name.endsWith('-previous')&&path.basename(to)==='dist')throw Error('Forced publication failure');return rename(from,to);};");
 const refused=spawnSync(process.execPath,['--require',rejectFile,'scripts/build_site.js'],{cwd:fixture,env:environment,encoding:'utf8'});
 assert.notEqual(refused.status,0);assert(refused.stderr.includes('Forced publication failure'));
 assert.equal(digest(manifest(path.join(fixture,'dist'))),published,'Publication failure must restore the previous complete output');
 assert(!fs.readdirSync(fixture).some(name=>name.startsWith('.site-build-')),'Rollback must clean the unpublished staging files');
 console.log('PASS Publication failure restores the previous complete preview byte-for-byte');
 const factsFile=path.join(fixture,'data/courses_legal_2025.csv'),factsText=fs.readFileSync(factsFile,'utf8'),C=require('../assets/core'),facts=C.csv(factsText),fields=Object.keys(facts[0]);
 const quoted=value=>'"'+String(value).replace(/"/g,'""')+'"';
 for(const changes of [{ects:'not-a-number'},{section_2025:'Z Unknown'},{module_code:'IN2076/EXTRA'},{module_name_legal_2025:' '}]){
  const bad=facts.map(row=>row.module_code==='IN2076'?{...row,...changes}:row);
  fs.writeFileSync(factsFile,[fields,...bad.map(row=>fields.map(field=>row[field]))].map(row=>row.map(quoted).join(',')).join('\n')+'\n');
  const invalid=build();assert.notEqual(invalid.status,0,'Invalid course facts must not publish a broken planner');
  assert.equal(digest(manifest(path.join(fixture,'dist'))),published);
  const validation=spawnSync('python3',['scripts/validate_repo.py'],{cwd:fixture,encoding:'utf8'});assert.notEqual(validation.status,0,'Offline validation must also reject invalid course facts');
 }
 const fractional=facts.map(row=>row.module_code==='IN9003'?{...row,ects:'5.5'}:row);
 fs.writeFileSync(factsFile,[fields,...fractional.map(row=>fields.map(field=>row[field]))].map(row=>row.map(quoted).join(',')).join('\n')+'\n');
 const decimalBuild=build();assert.equal(decimalBuild.status,0,decimalBuild.stderr);
 const decimalValidation=spawnSync('python3',['scripts/validate_repo.py'],{cwd:fixture,encoding:'utf8'});assert.equal(decimalValidation.status,0,decimalValidation.stderr);
 assert.equal(C.calculate({version:2,cohort:'unknown',conditional:false,items:[{code:'IN9003',status:'planned'}]},fractional).allocated,5.5);
 fs.writeFileSync(factsFile,factsText);
 assert(!fs.readdirSync(fixture).some(name=>name.startsWith('.site-build-')),'Data validation builds must also clean their staging files');
 console.log('PASS Invalid elective credits, groups, module paths and empty names preserve the last complete site');
 console.log('PASS Valid fractional ECTS remain supported without changing canonical course facts');
 console.log('7 build checks passed');
}finally{fs.rmSync(fixture,{recursive:true,force:true});}
