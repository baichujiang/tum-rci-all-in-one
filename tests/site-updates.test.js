/* Persistence is scoped to an announcement; explicit history links always reopen it. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const config=require('../content/site-updates.json'),render=require('../scripts/site_updates_view'),{esc}=require('../assets/core');
const source=fs.readFileSync(require.resolve('../site3/site-updates.js'),'utf8'),key='rci.site-updates.dismissed';
function setup({saved='',version=config.id+':'+config.status,hash='',blocked=false,missing=false}={}){
 const stored=new Map([[key,saved],['rci.plan','private-plan'],['rci.saved','private-favorites']]),writes=[],events={};
 const location={hash,pathname:'/',search:'?preview=1'};
 const summary={focus(){this.focused=true;}},details={open:false},heading={focus(){this.focused=true;}},dismiss={hidden:true,addEventListener(_,fn){this.click=fn;}};
 const nodes={'details':details,'summary':summary,'[data-site-update-dismiss]':dismiss};
 const banner={dataset:{siteUpdate:version},hidden:false,querySelector:s=>nodes[s],scrollIntoView(){this.scrolled=true;}};
 const link={addEventListener(_,fn){this.click=fn;}};
 const history={state:{keep:true},replaceState(state,_,url){this.url=url;this.keptState=state;location.hash='';}};
 vm.runInNewContext(source,{
  document:{querySelector:s=>s==='[data-site-update]'?(missing?null:banner):heading,querySelectorAll:()=>[link]},
  window:{addEventListener:(event,fn)=>{events[event]=fn;}},location,history,
  localStorage:{getItem(k){if(blocked)throw Error('unavailable');return stored.get(k)||null;},setItem(k,v){if(blocked)throw Error('unavailable');stored.set(k,v);writes.push(k);}}
 });
 return {banner,summary,details,heading,dismiss,link,history,location,events,stored,writes};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('New versions appear collapsed and dismissing persists only their own key',()=>{
 const ui=setup();assert.equal(ui.banner.hidden,false);assert.equal(ui.details.open,false);assert.equal(ui.dismiss.hidden,false);
 ui.dismiss.click();assert.equal(ui.banner.hidden,true);assert.equal(ui.heading.focused,true);
 assert.deepEqual(ui.writes,[key]);assert.equal(ui.stored.get('rci.plan'),'private-plan');assert.equal(ui.stored.get('rci.saved'),'private-favorites');
 assert.equal(setup({saved:ui.stored.get(key)}).banner.hidden,true);
 assert.equal(setup({saved:'previous-release:published'}).banner.hidden,false);
 assert.equal(setup({saved:ui.stored.get(key),version:config.id+':'+(config.status==='draft'?'published':'draft')}).banner.hidden,false);
});
test('History links reopen a dismissed notice even if the URL hash is unchanged',()=>{
 const ui=setup({saved:config.id+':'+config.status});assert.equal(ui.banner.hidden,true);
 ui.link.click();assert.equal(ui.banner.hidden,false);assert.equal(ui.details.open,true);assert.equal(ui.summary.focused,true);assert.equal(ui.banner.scrolled,true);
 ui.location.hash='#site-updates';ui.events.hashchange();ui.details.open=false;ui.link.click();assert.equal(ui.details.open,true);
 assert.deepEqual(ui.writes,[]);
});
test('Deep links and page restoration reveal details; closing clears the hash and preserves history state',()=>{
 const ui=setup({saved:config.id+':'+config.status,hash:'#site-updates'});
 assert.equal(ui.banner.hidden,false);assert.equal(ui.details.open,true);
 ui.dismiss.click();assert.equal(ui.location.hash,'');assert.equal(ui.history.url,'/?preview=1');assert.equal(ui.history.keptState,ui.history.state);
 ui.events.pageshow();assert.equal(ui.banner.hidden,true);
 ui.location.hash='#site-updates';ui.events.hashchange();assert.equal(ui.details.open,true);assert.equal(ui.banner.hidden,false);
});
test('Unavailable browser storage still allows dismissing, restoring, and reopening within the visit',()=>{
 const ui=setup({blocked:true});ui.dismiss.click();ui.events.pageshow();assert.equal(ui.banner.hidden,true);
 ui.link.click();assert.equal(ui.banner.hidden,false);assert.equal(ui.details.open,true);
 assert.doesNotThrow(()=>setup({missing:true}));
});
test('Announcement data escapes text, prefixes links, and rejects invalid dates, links or excessive sections',()=>{
 const html=render({...config,status:'draft',summary:'<script> & "update"'},{e:esc,url:p=>'/rci'+p});
 assert(html.includes('&lt;script&gt;'));assert(html.includes('href="/rci/courses/IN2106/"'));
 assert(html.includes('待发布'));assert(html.includes('尚未发布'));assert(html.includes('<details '));assert(!html.includes('<dialog'));
 const published=render({...config,status:'published'},{e:esc,url:p=>p});assert(!published.includes('待发布'));assert(!published.includes('尚未发布'));
 for(const invalid of [{...config,date:'2026-02-30'},{...config,changes:Array(5).fill(config.changes[0])},{...config,changes:[{...config.changes[0],href:'javascript:alert(1)'}]}])assert.throws(()=>render(invalid,{e:esc,url:p=>p}));
});
console.log(count+' site update checks passed');
