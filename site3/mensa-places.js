/* Local-only place preferences and a Leaflet map linked to the existing menu selector. */
(function(root){
 'use strict';
 const GROUPS=[['garching','Garching · 加兴'],['munich','慕尼黑及周边'],['freising','Freising · Weihenstephan'],['other','其他校区']];
 // RCI-oriented presentation order, shared by the campus filter and restaurant list.
 const AREAS=[
  ['garching','Garching · 加兴','garching'],
  ['stammgelaende','主校区 · Arcisstraße','munich'],
  ['lmu','LMU 大学区','munich'],
  ['olympiapark','奥林校区 · Olympiapark','munich'],
  ['freising','Weihenstephan · Freising','freising'],
  ['lothstr','Lothstraße · HM 校区','munich'],
  ['karlstr','Karlstraße · HM 校区','munich'],
  ['medizin-innenstadt','Goethestraße · 医学区','munich'],
  ['rechts-der-isar','Rechts der Isar · 医学校区','munich'],
  ['martinsried','Großhadern / Martinsried','munich'],
  ['pasing','Pasing · HM 校区','munich'],
  ['straubing','Straubing · 施特劳宾','other'],
  ['heilbronn','Heilbronn · 海尔布隆','other'],
  ['rosenheim','Rosenheim · 罗森海姆','other']
 ];
 const KEY='rci.mensa.recent.v1';
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').trim();
 function placeName(c){return c.name.replace(/^(Mensa|StuBistro|StuCafé)\s+/,'');}
 function placeKind(c){return /\bmensa\b/i.test(c.name)?0:c.name.startsWith('StuBistro ')?1:c.name.startsWith('StuCafé ')?2:3;}
 function comparePlaces(a,b){return placeKind(a)-placeKind(b)||placeName(a).localeCompare(placeName(b),'de');}
 function matches(c,query,{area=''}={}){
  if(area&&c.area!==area)return false;
  const text=normalize([c.name,c.address,placeName(c),...(c.aliases||[]),GROUPS.find(g=>g[0]===c.group)?.[1]||'',AREAS.find(g=>g[0]===c.area)?.[1]||''].join(' '));
  return normalize(query).split(/\s+/).every(word=>text.includes(word));
 }
 function readLast(storage,canteens){
  try{const value=JSON.parse(storage?.getItem(KEY)||'[]'),valid=new Set(canteens.map(c=>c.id));return Array.isArray(value)?value.find(id=>valid.has(id))||'':'';}catch(_){return '';}
 }
 function navigationURL(c){
  const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',c.latitude+','+c.longitude);return url.href;
 }
 function renderOptions(canteens,query,selected,filters={},crowding=[]){
  const filtered=canteens.filter(c=>matches(c,query,filters));
  if(!filtered.length){
   const elsewhere=filters.area&&query.trim()?canteens.filter(c=>matches(c,query)):[];
   if(elsewhere.length){
    const areaIds=new Set(elsewhere.map(c=>c.area)),area=areaIds.size===1?AREAS.find(([id])=>areaIds.has(id)):null;
    const label=area?area[1].split(' · ')[0]:'其他校区';
    return `<p class="mensa-place-empty">当前校区没有匹配结果，${esc(label)}找到 ${elsewhere.length} 家。</p><button type="button" class="text-link mensa-place-action" data-place-expand>查看结果 →</button>`;
   }
   return '<p class="mensa-place-empty">没有找到食堂，试试其他校区、地区或清除筛选。</p><button type="button" class="text-link mensa-place-action" data-place-reset>清除筛选</button>';
  }
  const sections=AREAS.map(([id,label])=>[label,filtered.filter(c=>c.area===id).sort(comparePlaces)]);
  return sections.filter(([,items])=>items.length).map(([label,items])=>`<div class="mensa-place-group"><p>${esc(label)}</p>${items.map(c=>{
   const type=['食堂','小餐厅','咖啡厅','餐厅'][placeKind(c)];
   const badge=crowding.includes(c.id)?`<span class="mensa-crowding" data-crowding-canteen="${esc(c.id)}" hidden></span>`:'';
   return `<button type="button" class="mensa-place-option" data-canteen-id="${esc(c.id)}" aria-pressed="${c.id===selected}"><span><span class="mensa-place-name"><b>${esc(c.name)}</b>${badge}</span><span class="mensa-place-type">${type}</span></span><small>${esc(c.address)}</small></button>`;
  }).join('')}</div>`).join('');
 }
 function coordinates(c){return Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180;}
 function create({catalog,select,preferred,onChoose,onRender=()=>{},document:doc=root.document,leaflet:L=root.L,storage}={}){
  const $=id=>doc.getElementById('mensa-'+id),canteens=catalog.canteens,index=new Map(canteens.map(c=>[c.id,c]));
  try{if(storage===undefined)storage=root.localStorage;}catch(_){}
  let selected=index.has(preferred)?preferred:readLast(storage,canteens)||select.value,pendingMapChoice=null;
  if(!index.has(selected))selected=canteens[0].id;select.value=selected;
  const picker=$('picker'),search=$('place-search'),results=$('place-results'),region=$('place-region');let rendered=false;
  const filters=()=>({area:region.value}),visible=c=>matches(c,search.value,filters());
  const rows=()=>[...results.querySelectorAll('[data-canteen-id]')];
  function updateRows(){
   const buttons=rows(),tabStop=buttons.some(row=>row.dataset.canteenId===selected)?selected:buttons[0]?.dataset.canteenId;
   for(const row of buttons){row.setAttribute('aria-pressed',String(row.dataset.canteenId===selected));row.setAttribute('tabindex',row.dataset.canteenId===tabStop?'0':'-1');}
  }
  function render(frame=false){
   results.innerHTML=renderOptions(canteens,search.value,selected,filters(),catalog.crowding_canteens);results.scrollTop=0;rendered=true;
   const count=canteens.filter(visible).length;
   $('place-count').textContent=search.value.trim()||region.value?count+' / '+canteens.length+' 个':canteens.length+' 个';
   updateRows();filterMap(frame);onRender();
  }
  function resetFilters(){
   search.value='';region.value='';render(true);
  }
  function revealSelected(){
   const row=rows().find(row=>row.dataset.canteenId===selected);if(!row)return;
   const bounds=results.getBoundingClientRect(),item=row.getBoundingClientRect();
   if(item.top<bounds.top)results.scrollTop+=item.top-bounds.top;
   else if(item.bottom>bounds.bottom)results.scrollTop+=item.bottom-bounds.bottom;
  }
  function choose(id,fromMap=false){
   if(!index.has(id)||!visible(index.get(id)))return;
   if(id===selected){if(!fromMap)focusMap(id,true);return;}
   pendingMapChoice=fromMap?id:null;select.value=id;onChoose(id);
  }
  $('native-place').hidden=true;$('explorer').hidden=false;
  search.addEventListener('input',()=>render(true));
  region.addEventListener('change',()=>{
   render(true);
   const places=canteens.filter(c=>c.area===region.value);
   if(places.length===1&&visible(places[0]))choose(places[0].id);
  });
  results.addEventListener('click',event=>{
   if(event.target.closest('[data-place-reset]')){resetFilters();search.focus();return;}
   if(event.target.closest('[data-place-expand]')){region.value='';render(true);search.focus();return;}
   const row=event.target.closest('[data-canteen-id]');if(row)choose(row.dataset.canteenId);
  });
  picker.addEventListener('keydown',event=>{
   const buttons=rows(),position=buttons.indexOf(doc.activeElement);
   if(event.target!==search&&position<0)return;
   if(event.key==='Escape'&&search.value){event.preventDefault();search.value='';render(true);search.focus();return;}
   if(event.target===search&&event.key==='Enter'){event.preventDefault();if(buttons[0])choose(buttons[0].dataset.canteenId);return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();if(buttons.length)buttons[position<0?(event.key==='ArrowDown'?0:buttons.length-1):(position+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
   }
  });
  let map=null,cluster=null,mapInitialized=false;const markers=new Map(),disclosure=$('map-disclosure'),mapNode=$('map'),mapStatus=$('map-status'),locate=$('map-locate');
  function mapUnavailable(message){mapNode.hidden=true;locate.hidden=true;mapStatus.hidden=false;mapStatus.textContent=message;}
  function refreshMarkers(){
   for(const [id,marker] of markers){const el=marker.getElement();if(el){el.classList.toggle('is-selected',id===selected);el.setAttribute('aria-label',index.get(id).name);el.setAttribute('aria-pressed',String(id===selected));}}
  }
  function focusMap(id,open=false){
   const c=index.get(id),marker=markers.get(id);if(!map||!disclosure.open||!marker||!visible(c))return;
   map.setView([c.latitude,c.longitude],15,{animate:false});
   if(open&&cluster)cluster.zoomToShowLayer(marker,()=>{if(selected===id&&visible(c)){refreshMarkers();marker.openPopup();}});
   else if(open)marker.openPopup();
  }
  function filterMap(frame){
   if(!map||!disclosure.open)return;
   map.closePopup();
   const places=canteens.filter(c=>visible(c)&&coordinates(c));
   if(cluster){cluster.clearLayers();cluster.addLayers(places.map(c=>markers.get(c.id)));}
   else for(const [id,marker] of markers){if(visible(index.get(id)))map.addLayer(marker);else map.removeLayer(marker);}
   refreshMarkers();cluster?.refreshClusters();
   if(frame&&places.length){
    if(search.value.trim()||region.value)map.fitBounds(places.map(c=>[c.latitude,c.longitude]),{padding:[24,24],maxZoom:15,animate:false});
    else focusMap(selected);
   }
  }
  function initializeMap(){
   if(mapInitialized)return;
   mapInitialized=true;
   try{
    if(!L)throw Error('Map unavailable');
    const current=index.get(selected);if(!coordinates(current))throw Error('Location unavailable');
    const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    map=L.map(mapNode,{scrollWheelZoom:false,minZoom:5,maxZoom:19,zoomControl:false,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced}).setView([current.latitude,current.longitude],15);
    L.control.zoom({zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(map);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map);
    tiles.on('tileerror',()=>{mapStatus.hidden=false;mapStatus.textContent='底图暂时无法加载，食堂标记和列表仍可使用。';});
    tiles.on('tileload',()=>{mapStatus.hidden=true;});
    if(L.markerClusterGroup)cluster=L.markerClusterGroup({maxClusterRadius:30,showCoverageOnHover:false,animate:!reduced,iconCreateFunction:group=>L.divIcon({className:'mensa-map-cluster'+(group.getAllChildMarkers().some(m=>m.options.canteenId===selected)?' is-selected':''),html:'<span>'+group.getChildCount()+'</span>',iconSize:[40,40]})});
    const layer=cluster||map;
    for(const c of canteens.filter(coordinates)){
     const marker=L.marker([c.latitude,c.longitude],{title:c.name,keyboard:true,riseOnHover:true,canteenId:c.id,icon:L.divIcon({className:'mensa-map-pin',html:'<span aria-hidden="true"></span>',iconSize:[36,36],iconAnchor:[18,18],popupAnchor:[0,-12]})});
     marker.bindPopup(`<div class="mensa-map-popup"><b>${esc(c.name)}</b><p>${esc(c.address)}</p><a href="${esc(navigationURL(c))}" target="_blank" rel="noopener noreferrer">导航 ↗</a></div>`,{autoPanPadding:[16,16]});
     marker.on('click',()=>choose(c.id,true));marker.on('add',refreshMarkers);markers.set(c.id,marker);layer.addLayer(marker);
    }
    if(cluster){map.addLayer(cluster);cluster.on('animationend spiderfied',refreshMarkers);}
    map.on('zoomend moveend',refreshMarkers);refreshMarkers();
    locate.addEventListener('click',()=>{if(!visible(index.get(selected)))resetFilters();focusMap(selected,true);});
   }catch(_){if(map)map.remove();map=null;cluster=null;markers.clear();mapUnavailable('地图暂时无法加载，仍可从食堂列表选择。');}
  }
  function showMap(){
   if(!disclosure.open)return;
   initializeMap();
   if(map){map.invalidateSize({pan:false});filterMap(true);}
   revealSelected();
  }
  disclosure.addEventListener('toggle',showMap);
  showMap();
  function sync(current){
   const changed=selected!==current.id,fromMap=pendingMapChoice===current.id;pendingMapChoice=null;selected=current.id;select.value=selected;
   try{const value=JSON.stringify([selected]);if(storage?.getItem(KEY)!==value)storage?.setItem(KEY,value);}catch(_){}
   if(!rendered)render();
   else updateRows();
   if(changed&&fromMap)revealSelected();
   refreshMarkers();cluster?.refreshClusters();
   if(changed&&!fromMap)focusMap(selected,true);
  }
  sync(index.get(selected));
  return {sync};
 }
 const api={AREAS,KEY,normalize,placeName,comparePlaces,matches,readLast,navigationURL,renderOptions,coordinates,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MensaPlaces=api;
})(typeof globalThis!=='undefined'?globalThis:this);
