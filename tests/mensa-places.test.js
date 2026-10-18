/* Place search, preferences, map/list selection and failure recovery; no live tiles or personal data. */
'use strict';
const assert=require('node:assert/strict'),P=require('../site3/mensa-places'),catalog=require('../content/canteens.json');
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const byId=new Map(catalog.canteens.map(c=>[c.id,c]));
function harness({preferred,remembered=[],initial='mensa-garching',blockedStorage=false,noMap=false,brokenMap=false,noCluster=false,mapOpen=true}={}){
 const nodes={},doc={activeElement:null,handlers:{},getElementById:id=>nodes[id],addEventListener(type,fn){this.handlers[type]=fn;}};
 for(const id of ['explorer','picker','place-search','place-region','place-results','native-place','place-count','map-panel','map-disclosure','map','map-status','map-locate'])nodes['mensa-'+id]={id,value:'',hidden:['explorer','map-status'].includes(id),textContent:'',innerHTML:'',scrollTop:0,attrs:{},handlers:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},focus(){doc.activeElement=this;},addEventListener(type,fn){this.handlers[type]=fn;},getBoundingClientRect(){return {top:0,bottom:280};},querySelectorAll(){
  if(this.rowsHTML!==this.innerHTML){this.rowsHTML=this.innerHTML;this.rows=[...this.innerHTML.matchAll(/data-canteen-id="([^"]+)"/g)].map(([,id])=>({dataset:{canteenId:id},attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){doc.activeElement=this;},getBoundingClientRect(){return {top:20,bottom:80};}}));}
  return this.rows||[];
 }};
 nodes['mensa-map-disclosure'].open=mapOpen;
 const selection={value:initial},changes=[],storageReads=[],state=new Map([[P.KEY,JSON.stringify(remembered)]]);
 const storage={getItem(key){storageReads.push(key);if(blockedStorage)throw Error('blocked');return state.get(key)||null;},setItem(key,value){assert.equal(key,P.KEY);if(blockedStorage)throw Error('blocked');state.set(key,value);}};
 const map={center:null,removed:false,created:0,resized:0,layers:new Set(),setView(point,zoom){this.center=point;this.zoom=zoom;return this;},fitBounds(points,options){this.bounds=points;this.fitOptions=options;return this;},invalidateSize(options){this.resized++;assert.equal(options.pan,false);},closePopup(){},addLayer(marker){this.layers.add(marker);},removeLayer(marker){this.layers.delete(marker);},on(){return this;},remove(){this.removed=true;}},markers=[],tileHandlers={};let cluster;
 const L={map(){map.created++;return map;},control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){return this;},on(type,fn){tileHandlers[type]=fn;return this;}}),divIcon:options=>options,markerClusterGroup(){cluster={layers:[],addLayer(marker){this.layers.push(marker);if(brokenMap)throw Error('render error');},clearLayers(){this.layers=[];},addLayers(markers){this.layers.push(...markers);},on(){},refreshClusters(){},zoomToShowLayer(marker,fn){fn();}};return cluster;},marker(point,options){const el={attrs:{},classes:{},setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(key,value){el.classes[key]=value;}}};const marker={point,options,handlers:{},popupOpened:false,bindPopup(content){this.popup=content;return this;},on(type,fn){this.handlers[type]=fn;return this;},getElement:()=>el,openPopup(){this.popupOpened=true;}};markers.push(marker);return marker;}};
 if(noCluster)delete L.markerClusterGroup;
 let service;service=P.create({catalog,select:selection,preferred,storage,document:doc,leaflet:noMap?null:L,onChoose:id=>{changes.push(id);service.sync(byId.get(id));}});
 return {nodes,doc,selection,changes,state,storageReads,map,markers,get cluster(){return cluster;},tileHandlers,service,toggleMap(open){nodes['mensa-map-disclosure'].open=open;nodes['mensa-map-disclosure'].handlers.toggle();},search(value){nodes['mensa-place-search'].value=value;nodes['mensa-place-search'].handlers.input();},region(value){nodes['mensa-place-region'].value=value;nodes['mensa-place-region'].handlers.change();},choose(id){nodes['mensa-place-results'].handlers.click({target:{closest:selector=>selector==='[data-canteen-id]'?{dataset:{canteenId:id}}:null}});},reset(){nodes['mensa-place-results'].handlers.click({target:{closest:selector=>selector==='[data-place-reset]'?{}:null}});},expand(){nodes['mensa-place-results'].handlers.click({target:{closest:selector=>selector==='[data-place-expand]'?{}:null}});}};
}
test('A closed map stays unloaded while list choices work; expanding initializes the current filtered selection',()=>{
 const h=harness({mapOpen:false});assert.equal(h.map.created,0);assert.equal(h.markers.length,0);assert.deepEqual(Object.keys(h.tileHandlers),[]);
 h.search('Arcis');h.choose('mensa-arcisstr');assert.equal(h.selection.value,'mensa-arcisstr');assert.equal(h.map.created,0);
 h.toggleMap(true);assert.equal(h.map.created,1);assert.equal(h.markers.length,25);assert.equal(h.cluster.layers.length,2);assert.equal(h.map.bounds.length,2);assert.deepEqual(h.map.center,[byId.get('mensa-arcisstr').latitude,byId.get('mensa-arcisstr').longitude]);assert.equal(h.changes.length,1);
 h.toggleMap(false);h.search('');h.region('olympiapark');h.toggleMap(true);assert.equal(h.map.created,1);assert.equal(h.map.resized,2);assert.equal(h.markers.length,25);assert.deepEqual(h.cluster.layers.map(m=>m.options.canteenId),['stucafe-connollystr']);assert.equal(h.selection.value,'stucafe-connollystr');assert.equal(h.nodes['mensa-place-region'].value,'olympiapark');
});
test('Expanding an unavailable map leaves list, campus choice and collapse usable',()=>{
 const h=harness({mapOpen:false,noMap:true});h.toggleMap(true);assert(h.nodes['mensa-map'].hidden);assert(h.nodes['mensa-map-status'].textContent.includes('仍可从食堂列表选择'));
 h.toggleMap(false);h.region('olympiapark');assert.equal(h.selection.value,'stucafe-connollystr');h.toggleMap(true);assert.equal(h.map.created,0);assert(h.nodes['mensa-map-status'].textContent.includes('仍可从食堂列表选择'));
});
test('All 25 canteens have source coordinates and Chinese, German and street searches find the right places',()=>{
 assert.equal(catalog.canteens.length,25);assert(catalog.canteens.every(P.coordinates));
 assert.equal(new Set(P.AREAS.map(([id])=>id)).size,14);assert.deepEqual(P.AREAS.slice(0,5).map(([id])=>id),['garching','stammgelaende','lmu','olympiapark','freising']);for(const c of catalog.canteens)assert.equal(P.AREAS.find(([id])=>id===c.area)?.[2],c.group,c.id);
 for(const query of ['加兴','加兴食堂','GARCHING','Boltzmannstraße','BOLTZMANNSTRASSE'])assert(P.matches(byId.get('mensa-garching'),query));
 for(const query of ['主校区','ARCISSTRASSE','Arcisstraße 17','München Arcis'])assert(P.matches(byId.get('mensa-arcisstr'),query));
 assert(!P.matches(byId.get('mensa-garching'),'Arcis'));assert(P.matches(byId.get('fmi-bistro'),'FMI'));assert(!P.coordinates({latitude:91,longitude:0}));
});
test('Only the last valid choice is read from legacy history; corrupt or unavailable storage is ignored',()=>{
 const storage=value=>({getItem:()=>value});assert.equal(P.readLast(storage('["unknown","mensa-arcisstr","mensa-arcisstr","mensa-garching",3,"mensa-lothstr","fmi-bistro"]'),catalog.canteens),'mensa-arcisstr');
 for(const value of ['null','{}','broken','["__proto__"]'])assert.equal(P.readLast(storage(value),catalog.canteens),'');
 assert.equal(P.readLast({getItem(){throw Error('blocked');}},catalog.canteens),'');
});
test('Search results retain original names and addresses, show each place once and escape source text',()=>{
 const html=P.renderOptions(catalog.canteens,'','mensa-garching');assert.equal((html.match(/data-canteen-id=/g)||[]).length,25);assert(!html.includes('最近查看'));assert(html.indexOf('Garching · 加兴')<html.indexOf('主校区 · Arcisstraße'));assert(html.includes('Arcisstraße 17'));assert(html.includes('Mensa Arcisstraße'));
 const withCounts=P.renderOptions(catalog.canteens,'','mensa-lothstr',{},['mensa-lothstr','mensa-pasing','stucafe-pasing']);assert.equal((withCounts.match(/data-crowding-canteen=/g)||[]).length,3);assert(withCounts.includes('<b>Mensa Lothstraße</b><span class="mensa-crowding" data-crowding-canteen="mensa-lothstr"'));
 for(const [area,expected] of [['garching',['mensa-garching','stucafe-boltzmannstr','stucafe-garching','fmi-bistro']],['lmu',['mensa-leopoldstr','stubistro-schellingstr','stucafe-adalbertstr']],['freising',['mensa-weihenstephan','stucafe-akademie-weihenstephan','stucafe-weihenstephan-maximus']]])assert.deepEqual([...P.renderOptions(catalog.canteens,'',null,{area}).matchAll(/data-canteen-id="([^"]+)"/g)].map(([,id])=>id),expected);
 assert(html.includes('<b>Mensa Garching</b>'));assert(html.includes('<b>StuBistro Garching</b>'));assert(html.includes('<small>'+byId.get('mensa-garching').address+'</small>'));
 const search=P.renderOptions(catalog.canteens,'主校区','mensa-garching');assert.equal((search.match(/data-canteen-id=/g)||[]).length,2);assert(!search.includes('data-canteen-id="mensa-garching"'));
 assert(P.renderOptions(catalog.canteens,'xyz-no-place',null).includes('没有找到食堂'));
 assert(!P.renderOptions([{...catalog.canteens[0],name:'<img src=x>',address:'<script>bad</script>'}],'',null).includes('<img'));
});
test('Shared links take priority over history; normal entries restore the last selected canteen',()=>{
 const shared=harness({preferred:'mensa-garching',remembered:['mensa-arcisstr']});assert.equal(shared.selection.value,'mensa-garching');
 const restored=harness({remembered:['mensa-arcisstr','mensa-lothstr']});assert.equal(restored.selection.value,'mensa-arcisstr');assert.deepEqual(restored.map.center,[byId.get('mensa-arcisstr').latitude,byId.get('mensa-arcisstr').longitude]);assert(restored.storageReads.every(key=>key===P.KEY));assert(!restored.nodes['mensa-place-results'].innerHTML.includes('最近查看'));assert.equal(restored.nodes['mensa-place-results'].innerHTML,harness({initial:'mensa-arcisstr'}).nodes['mensa-place-results'].innerHTML);
 assert.equal(harness({preferred:'unknown',remembered:['mensa-lothstr']}).selection.value,'mensa-lothstr');
});
test('Choosing a visible search result preserves the panel and search while updating map and history',()=>{
 const h=harness();assert(!h.nodes['mensa-explorer'].hidden);assert(h.nodes['mensa-native-place'].hidden);h.search('Arcis');h.choose('mensa-arcisstr');
 assert.deepEqual(h.changes,['mensa-arcisstr']);assert.deepEqual(JSON.parse(h.state.get(P.KEY)),['mensa-arcisstr']);assert.equal(h.selection.value,'mensa-arcisstr');assert.equal(h.nodes['mensa-place-search'].value,'Arcis');assert(!h.nodes['mensa-explorer'].hidden);assert.equal(JSON.parse(h.state.get(P.KEY))[0],'mensa-arcisstr');
 assert.deepEqual(h.map.center,[byId.get('mensa-arcisstr').latitude,byId.get('mensa-arcisstr').longitude]);assert(h.markers.find(m=>m.options.canteenId==='mensa-arcisstr').popupOpened);
});
test('Clicking a map marker updates the list exactly once without moving away from the clicked map view',()=>{
 const h=harness(),marker=h.markers.find(m=>m.options.canteenId==='fmi-bistro'),center=h.map.center;marker.handlers.click();assert.deepEqual(h.changes,['fmi-bistro']);assert.equal(h.selection.value,'fmi-bistro');assert.equal(h.nodes['mensa-place-results'].querySelectorAll().find(row=>row.dataset.canteenId==='fmi-bistro').attrs['aria-pressed'],'true');assert.equal(h.map.center,center);assert.equal(marker.getElement().attrs['aria-pressed'],'true');
 marker.handlers.click();assert.equal(h.changes.length,1);assert.equal(h.markers.length,25);
});
test('Keyboard search selects a result and Escape clears the filter without hiding the list',()=>{
 const h=harness();h.search('FMI');let prevented=false;h.nodes['mensa-picker'].handlers.keydown({key:'Enter',target:h.nodes['mensa-place-search'],preventDefault(){prevented=true;}});assert(prevented);assert.equal(h.selection.value,'fmi-bistro');h.nodes['mensa-picker'].handlers.keydown({key:'Escape',target:h.nodes['mensa-place-search'],preventDefault(){}});assert.equal(h.nodes['mensa-place-search'].value,'');assert(!h.nodes['mensa-explorer'].hidden);assert.equal(h.doc.activeElement,h.nodes['mensa-place-search']);
});
test('Missing or broken maps and unavailable storage leave place selection usable',()=>{
 for(const options of [{noMap:true},{brokenMap:true},{blockedStorage:true}]){const h=harness(options);h.search('Arcis');h.choose('mensa-arcisstr');assert.equal(h.selection.value,'mensa-arcisstr');if(!options.blockedStorage){assert(!h.nodes['mensa-map-status'].hidden);assert(h.nodes['mensa-map'].hidden);}}
 const h=harness();h.tileHandlers.tileerror();assert(h.nodes['mensa-map-status'].textContent.includes('标记和列表仍可使用'));assert(!h.nodes['mensa-map'].hidden);h.tileHandlers.tileload();assert(h.nodes['mensa-map-status'].hidden);
});
test('Searching filters map markers together with the list, and a stale hidden marker cannot select a restaurant',()=>{
 const h=harness();h.search('Arcis');assert.equal(h.nodes['mensa-place-count'].textContent,'2 / 25 个');assert.equal(h.cluster.layers.length,2);assert(h.cluster.layers.every(m=>m.options.canteenId.includes('arcis')));h.markers.find(m=>m.options.canteenId==='fmi-bistro').handlers.click();assert.equal(h.nodes['mensa-place-search'].value,'Arcis');assert.equal(h.nodes['mensa-place-count'].textContent,'2 / 25 个');assert.equal(h.selection.value,'mensa-garching');assert.equal(h.changes.length,0);
});
test('Map selection reveals its restaurant inside the list, and menu refreshes preserve list scrolling',()=>{
 const h=harness(),results=h.nodes['mensa-place-results'],row=results.querySelectorAll().find(row=>row.dataset.canteenId==='mensa-arcisstr');row.getBoundingClientRect=()=>({top:400,bottom:480});h.markers.find(m=>m.options.canteenId==='mensa-arcisstr').handlers.click();assert.equal(results.scrollTop,200);
 h.search('Arcis');results.scrollTop=35;h.service.sync(byId.get('mensa-arcisstr'));assert.equal(results.scrollTop,35);assert.equal(h.nodes['mensa-place-search'].value,'Arcis');
});
test('Map popup navigation uses the source coordinates and a fixed trusted destination',()=>{
 const h=harness(),marker=h.markers.find(m=>m.options.canteenId==='mensa-garching');const url=new URL(P.navigationURL(byId.get('mensa-garching')));assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('destination'),'48.268132,11.672263');assert(marker.popup.includes('noopener noreferrer'));assert(marker.popup.includes('Boltzmannstraße 19'));
});
test('Multiple-restaurant campuses retain the current menu, and a single-restaurant campus opens its menu',()=>{
 const h=harness();h.region('garching');assert.equal(h.nodes['mensa-place-count'].textContent,'4 / 25 个');assert.equal(h.cluster.layers.length,4);assert.equal(h.map.bounds.length,4);
 h.region('martinsried');assert.equal(h.nodes['mensa-place-count'].textContent,'3 / 25 个');assert.equal(h.cluster.layers.length,3);assert.equal(h.selection.value,'mensa-garching');assert.equal(h.changes.length,0);
 h.region('rechts-der-isar');assert.deepEqual(h.changes,['mediziner-mensa']);h.search('Mediziner');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(h.cluster.layers[0].options.canteenId,'mediziner-mensa');assert(h.nodes['mensa-place-results'].innerHTML.includes('>食堂</span>'));h.choose('mediziner-mensa');assert.deepEqual(h.changes,['mediziner-mensa']);assert.equal(h.nodes['mensa-place-region'].value,'rechts-der-isar');assert.equal(h.nodes['mensa-place-search'].value,'Mediziner');assert.equal(h.map.fitOptions.maxZoom,15);
});
test('Automatic campus choice runs once, updates history and works without maps or browser storage',()=>{
 for(const options of [{},{noMap:true,blockedStorage:true}]){
  const h=harness(options),id='stucafe-connollystr';h.region('olympiapark');assert.equal(h.selection.value,id);assert.deepEqual(h.changes,[id]);assert.equal(h.nodes['mensa-place-region'].value,'olympiapark');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(h.nodes['mensa-place-results'].querySelectorAll()[0].attrs['aria-pressed'],'true');
  if(!options.noMap)assert.deepEqual(h.map.center,[byId.get(id).latitude,byId.get(id).longitude]);
  if(!options.blockedStorage)assert.equal(JSON.parse(h.state.get(P.KEY))[0],id);
  h.service.sync(byId.get(id));h.region('olympiapark');h.region('');assert.deepEqual(h.changes,[id]);assert.equal(h.selection.value,id);
 }
});
test('Typing a unique result never auto-selects, and an excluded sole venue does not override search',()=>{
 const h=harness();h.search('Mediziner');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(h.changes.length,0);
 h.region('olympiapark');assert.equal(h.nodes['mensa-place-count'].textContent,'0 / 25 个');assert.equal(h.selection.value,'mensa-garching');assert.equal(h.changes.length,0);
 h.search('');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(h.changes.length,0);
 h.region('');h.search('FMI');h.region('garching');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(h.changes.length,0);
});
test('An empty campus search points to another campus and expands results without clearing the query or menu',()=>{
 const h=harness();h.region('garching');h.search('Arcis');assert(h.nodes['mensa-place-results'].innerHTML.includes('主校区找到 2 家'));assert(h.nodes['mensa-place-results'].innerHTML.includes('data-place-expand'));assert(!h.nodes['mensa-place-results'].innerHTML.includes('data-canteen-id='));assert.equal(h.cluster.layers.length,0);
 h.expand();assert.equal(h.nodes['mensa-place-region'].value,'');assert.equal(h.nodes['mensa-place-search'].value,'Arcis');assert.equal(h.nodes['mensa-place-count'].textContent,'2 / 25 个');assert.equal(h.cluster.layers.length,2);assert.equal(h.map.bounds.length,2);assert(h.cluster.layers.every(m=>m.options.canteenId.includes('arcis')));assert.equal(h.doc.activeElement,h.nodes['mensa-place-search']);assert.deepEqual(h.changes,[]);assert.equal(h.selection.value,'mensa-garching');
 h.choose('mensa-arcisstr');assert.deepEqual(h.changes,['mensa-arcisstr']);assert.equal(h.nodes['mensa-place-search'].value,'Arcis');
});
test('Cross-campus recovery counts all other matches; global misses keep ordinary clear-filter recovery',()=>{
 const h=harness({noMap:true});h.region('olympiapark');h.search('Mensa');const count=catalog.canteens.filter(c=>P.matches(c,'Mensa')).length;
 assert(h.nodes['mensa-place-results'].innerHTML.includes('其他校区找到 '+count+' 家'));h.expand();assert.equal(h.nodes['mensa-place-count'].textContent,count+' / 25 个');assert.equal(h.nodes['mensa-place-search'].value,'Mensa');assert.deepEqual(h.changes,['stucafe-connollystr']);
 const plain=P.renderOptions(catalog.canteens,'no-such-restaurant',null,{area:'garching'});assert(plain.includes('data-place-reset'));assert(!plain.includes('data-place-expand'));
 assert(!P.renderOptions(catalog.canteens,'Arcis',null).includes('data-place-expand'));assert(!P.renderOptions(catalog.canteens,'',null,{area:'unknown'}).includes('data-place-expand'));
 const sole=harness();sole.region('garching');sole.search('奥林');sole.expand();assert.equal(sole.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.equal(sole.selection.value,'mensa-garching');assert.deepEqual(sole.changes,[]);
});
test('An empty combination removes every marker and offers one-click recovery without changing the menu',()=>{
 const h=harness();h.region('garching');h.search('no-such-restaurant');assert.equal(h.cluster.layers.length,0);assert.equal(h.nodes['mensa-place-count'].textContent,'0 / 25 个');assert(h.nodes['mensa-place-results'].innerHTML.includes('data-place-reset'));h.reset();assert.equal(h.cluster.layers.length,25);assert.equal(h.nodes['mensa-place-count'].textContent,'25 个');assert.equal(h.nodes['mensa-place-region'].value,'');assert.equal(h.nodes['mensa-place-search'].value,'');assert.equal(h.changes.length,0);
});
test('Selection and menu refreshes preserve filters and list position; locating a filtered-out selection restores it',()=>{
 const h=harness();h.region('stammgelaende');h.nodes['mensa-place-results'].scrollTop=45;h.choose('mensa-arcisstr');h.service.sync(byId.get('mensa-arcisstr'));assert.equal(h.nodes['mensa-place-results'].scrollTop,45);assert.equal(h.nodes['mensa-place-region'].value,'stammgelaende');assert.equal(h.cluster.layers.length,2);
 h.region('garching');h.nodes['mensa-map-locate'].handlers.click();assert.equal(h.nodes['mensa-place-region'].value,'');assert.equal(h.cluster.layers.length,25);assert(h.markers.find(m=>m.options.canteenId==='mensa-arcisstr').popupOpened);assert.deepEqual(h.changes,['mensa-arcisstr']);
});
test('Campus controls retain native arrow keys, and Escape only clears search while keeping the campus',()=>{
 const h=harness();h.region('freising');h.search('Weihen');h.doc.activeElement=h.nodes['mensa-place-region'];let prevented=false;h.nodes['mensa-picker'].handlers.keydown({key:'ArrowDown',target:h.nodes['mensa-place-region'],preventDefault(){prevented=true;}});assert(!prevented);
 h.nodes['mensa-picker'].handlers.keydown({key:'Escape',target:h.nodes['mensa-place-search'],preventDefault(){}});assert.equal(h.nodes['mensa-place-search'].value,'');assert.equal(h.nodes['mensa-place-region'].value,'freising');assert.equal(h.nodes['mensa-place-count'].textContent,'3 / 25 个');
});
test('Filtering works with plain Leaflet and without a map',()=>{
 const plain=harness({noCluster:true});plain.region('garching');assert.equal(plain.map.layers.size,4);plain.region('olympiapark');assert.equal(plain.map.layers.size,1);assert.equal([...plain.map.layers][0].options.canteenId,'stucafe-connollystr');
 const offline=harness({noMap:true,blockedStorage:true});offline.region('stammgelaende');assert.equal(offline.nodes['mensa-place-count'].textContent,'2 / 25 个');offline.choose('mensa-arcisstr');assert.equal(offline.selection.value,'mensa-arcisstr');
});
test('Olympiapark has a peer campus filter and its cafe remains available with Chinese and German aliases',()=>{
 const c=byId.get('stucafe-connollystr');assert.equal(c.area,'olympiapark');for(const query of ['奥林','奥林校区','奥林食堂','Olympiapark','Olympiacampus','ZHS'])assert(P.matches(c,query),query);
 assert(!P.matches(byId.get('mensa-arcisstr'),'奥林'));assert(P.matches(c,'',{area:'olympiapark'}));assert(!P.matches(c,'',{area:'stammgelaende'}));
 const h=harness();h.region('olympiapark');assert.equal(h.nodes['mensa-place-count'].textContent,'1 / 25 个');assert.deepEqual(h.cluster.layers.map(m=>m.options.canteenId),['stucafe-connollystr']);assert(h.nodes['mensa-place-results'].innerHTML.includes('奥林校区'));
 h.choose(c.id);assert.equal(h.selection.value,c.id);assert.equal(h.nodes['mensa-place-region'].value,'olympiapark');h.service.sync(c);assert.equal(h.cluster.layers.length,1);
});
test('Peer campus filters separate venues without losing cafes, bistros or restaurants',()=>{
 const expected={stammgelaende:2,lmu:3,lothstr:1,karlstr:1,pasing:2,martinsried:3,'medizin-innenstadt':1,'rechts-der-isar':1,rosenheim:1,straubing:1,heilbronn:1};
 const h=harness();for(const [area,count] of Object.entries(expected)){h.region(area);assert.equal(h.cluster.layers.length,count,area);assert(h.cluster.layers.every(m=>byId.get(m.options.canteenId).area===area),area);assert.equal((h.nodes['mensa-place-results'].innerHTML.match(/data-canteen-id=/g)||[]).length,count,area);}
 h.region('stammgelaende');assert.equal(h.cluster.layers.length,2);h.region('martinsried');h.search('Großhadern');assert.equal(h.cluster.layers.length,3);
 h.region('');h.search('');assert.equal(h.cluster.layers.length,25);assert.equal((h.nodes['mensa-place-results'].innerHTML.match(/data-canteen-id=/g)||[]).length,25);
});
test('A fresh page restores the last chosen restaurant and never overrides its initial selection with Garching',()=>{
 const initial=catalog.canteens[0].id;assert.notEqual(initial,'mensa-garching');assert.equal(harness({initial}).selection.value,initial);
 const first=harness({initial});first.region('olympiapark');first.choose('stucafe-connollystr');const restored=harness({initial,remembered:JSON.parse(first.state.get(P.KEY))});assert.equal(restored.selection.value,'stucafe-connollystr');assert.equal(restored.nodes['mensa-place-region'].value,'');assert.equal(restored.nodes['mensa-place-count'].textContent,'25 个');assert.deepEqual(restored.map.center,[byId.get('stucafe-connollystr').latitude,byId.get('stucafe-connollystr').longitude]);
});
console.log(count+' place selection checks passed');
