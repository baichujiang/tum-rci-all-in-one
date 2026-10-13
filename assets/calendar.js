/* A small, explicit weekly iCalendar interchange. MIT. */
(function(root){
'use strict';
function parse(text){
 if(typeof text!=='string'||text.length>500000)throw new Error('ICS 文件上限 500 KB');
 if(!text.includes('BEGIN:VCALENDAR'))throw new Error('不是 iCalendar 文件');
 const unfolded=text.replace(/\r?\n[ \t]/g,''),events=[],warnings=[];
 const unescape=s=>s.replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1');
 for(const block of unfolded.split('BEGIN:VEVENT').slice(1)){
  const lines=block.split('END:VEVENT')[0].split(/\r?\n/),get=key=>lines.find(x=>x.startsWith(key+':')||x.startsWith(key+';'));
  const rr=get('RRULE');
  if(!rr||!/(?:^|;)FREQ=WEEKLY(?:;|$)/.test(rr.split(':').slice(1).join(':'))||/(?:^|;)INTERVAL=(?!1(?:;|$))/.test(rr)){warnings.push('跳过非每周事件（单次事件和隔周事件不会自动重复）。');continue;}
  function date(line){
   if(!line)throw new Error('每周事件缺少开始或结束时间');
   const value=line.slice(line.indexOf(':')+1),m=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
   if(!m)throw new Error('仅支持有具体时刻的每周事件');
   if(line.includes('TZID=')&&!line.includes('TZID=Europe/Berlin'))throw new Error('请先把日历时区转换为 Europe/Berlin 或 UTC');
   let year=+m[1],month=+m[2],day=+m[3],hour=+m[4],minute=+m[5];
   if(m[7]){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(Date.UTC(year,month-1,day,hour,minute)));const values=Object.fromEntries(parts.map(x=>[x.type,x.value]));year=+values.year;month=+values.month;day=+values.day;hour=+values.hour;minute=+values.minute;}
   return {date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,weekday:(new Date(Date.UTC(year,month-1,day)).getUTCDay()+6)%7,time:hour*60+minute};
  }
  const start=date(get('DTSTART')),end=date(get('DTEND'));
  if(start.date!==end.date||start.time>=end.time)throw new Error('暂不支持跨午夜的每周事件');
  const days=rr.match(/(?:^|;)BYDAY=([^;\r\n]+)/)?.[1].split(',')??[];
  const codes=['MO','TU','WE','TH','FR','SA','SU'],weekdays=days.length?days.map(x=>codes.indexOf(x)):[start.weekday];
  if(weekdays.some(x=>x<0))throw new Error('不支持按序号重复的星期规则');
  const summary=get('SUMMARY'),location=get('LOCATION');
  for(const day of weekdays)events.push({title:unescape(summary?.slice(summary.indexOf(':')+1)||'导入事件').slice(0,160),day,start:start.time,end:end.time,room:unescape(location?.slice(location.indexOf(':')+1)||'').slice(0,160),kind:'personal',allowOverlap:false});
  if(get('EXDATE')||get('RDATE')||rr.includes('UNTIL=')||rr.includes('COUNT='))warnings.push('此文件有日期范围或例外；导入的是典型每周时间，节假日和单次变动需另行核对。');
 }
 if(events.length>500)throw new Error('每周事件超过 500 项');
 return {events,warnings:[...new Set(warnings)]};
}
function exportWeek(events,monday){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(monday))throw new Error('请选择本周周一日期');
 const base=new Date(monday+'T12:00:00Z');if(base.getUTCDay()!==1)throw new Error('周课表导出日期须为周一');
 const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RCI All-in-One//Weekly Plan//ZH','CALSCALE:GREGORIAN'];
 events.filter(x=>x.kind!=='blocked').forEach((event,i)=>{
  const date=new Date(base);date.setUTCDate(date.getUTCDate()+event.day);const value=date.toISOString().slice(0,10).replace(/-/g,'');
  const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}${String(n%60).padStart(2,'0')}00`;
  if(event.dates&&!event.dates.includes(date.toISOString().slice(0,10)))return;
  lines.push('BEGIN:VEVENT',`UID:${value}-${i}@rci.local`,'DTSTAMP:20261013T000000Z',`DTSTART;TZID=Europe/Berlin:${value}T${time(event.start)}`,`DTEND;TZID=Europe/Berlin:${value}T${time(event.end)}`,`SUMMARY:${escape(event.title)}`,`LOCATION:${escape(event.room||'')}`,'END:VEVENT');
 });lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n';
}
const api={parse,exportWeek};if(typeof module==='object'&&module.exports)module.exports=api;else root.RCICalendar=api;
})(typeof globalThis!=='undefined'?globalThis:this);
