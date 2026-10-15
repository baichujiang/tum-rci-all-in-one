/* Exercise the homepage's real input/reset handlers with combined name and purpose queries. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('../site3/search');
const source=fs.readFileSync(path.join(__dirname,'../site3/app.js'),'utf8').split('// A small website directory: direct links stay usable if enhancement fails.')[1].split('function dest(d)')[0];
function card(id,title,summary,keywords){return {dataset:{portal:id,keywords},hidden:false,querySelector:selector=>({textContent:selector==='h3'?title:summary})};}
const cards=[
 card('R031','Moodle','课件 · 作业 · 课程通知','Moodle 课件 · 作业 · 课程通知 www.moodle.tum.de 学习资料 讲义 slides'),
 card('R138','考试专用 Moodle','Exam-TUM-Moodle · 指定考试','考试专用 Moodle Exam-TUM-Moodle · 指定考试 exam.moodle.tum.de 考试平台 考试 Moodle Exam Moodle 在线考试 考试系统'),
 card('R035','TUM IT 支持','账号 · Wi-Fi · VPN · 邮箱','TUM IT 支持 账号 Wi-Fi VPN 邮箱 IT service'),
 card('R139','校园打印与扫描','CIT · PDF 上传与取件步骤','校园打印与扫描 CIT PDF 上传与取件步骤'),
 card('R140','英语写作辅导预约','免费咨询 · 论文与求职文本','英语写作辅导预约 免费咨询 · 论文与求职文本 tumenglishwritingcenter.simplybook.it 英语写作 英文论文 English Writing Center EWC writing 简历 求职信'),
 card('R131','研究组论文题目','参与平台的研究组 · 非全校完整题库','找论文题目 研究组论文题目 Thesis Management'),
 {...card('R145','全校论文题目公告栏','跨学院发布 · 不保证收齐全部题目','全校论文题目公告栏 Themenbörse'),dataset:{portal:'R145',keywords:'全校论文题目公告栏 Themenbörse',desktopOnly:'true'}}
];
const courses={hidden:false,querySelector:()=>cards.slice(0,2).find(c=>!c.hidden)||null},support={hidden:false,querySelector:()=>cards.slice(2).find(c=>!c.hidden)||null};
function element(){return {value:'',hidden:false,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},focus(){this.focused=true;}};}
const input=element(),reset=element(),status=element(),empty=element(),controls=element(),directory={querySelectorAll:selector=>selector==='[data-portal]'?cards:[courses,support]};
const nodes={'#portal-controls':controls,'#websites':directory,'#portal-search':input,'#portal-empty':empty,'#portal-status':status,'[data-portal-reset]':reset};
const media={matches:true,addEventListener(type,fn){this.change=fn;}};
vm.runInNewContext(source,{window:{RCISearch:S,matchMedia:()=>media},$:selector=>nodes[selector]});
function search(query){input.value=query;input.listeners.input();return cards.filter(c=>!c.hidden).map(c=>c.dataset.portal);}
assert.deepEqual(search('moodle 作业'),['R031']);assert.equal(courses.hidden,false);assert.equal(support.hidden,true);console.log('PASS Website name plus purpose finds the right homepage card');
assert.deepEqual(search('作业 moodle'),['R031']);console.log('PASS Reordering name and purpose retains the same result');
assert.deepEqual(search('IT'),['R035']);console.log('PASS Short IT query does not match CIT inside another word');
assert.deepEqual(search('simplybook.it'),['R140']);console.log('PASS Full hostnames remain searchable without matching a country suffix alone');
assert.deepEqual(search('不存在xyz'),[]);assert.equal(empty.hidden,false);console.log('PASS Unknown query shows the empty state');
reset.listeners.click();assert.equal(cards.filter(c=>!c.hidden).length,7);assert.equal(empty.hidden,true);assert(input.focused);console.log('PASS Reset restores all website modules and focuses the search field');
assert.deepEqual(search('论文题目'),['R131','R145']);assert.equal(status.textContent,'找到 2 个网站');console.log('PASS Desktop thesis search finds both complementary destinations');
assert.deepEqual(search('Themenbörse'),['R145']);console.log('PASS The university bulletin is searchable by its official name');
media.matches=false;media.change();assert.equal(empty.hidden,false);assert.equal(status.textContent,'找到 0 个网站');
media.matches=true;media.change();assert.equal(empty.hidden,true);assert.equal(status.textContent,'找到 1 个网站');console.log('PASS Desktop-only entries keep search counts and empty states consistent at the desktop boundary');
console.log('9 homepage search checks passed');
