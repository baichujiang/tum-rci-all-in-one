'use strict';
const C=require('../assets/core'),T=require('../site3/course-topics'),e=C.esc,{backLink}=require('./control_view');
module.exports=function topicDetailView(topic,detail,{base=''}={}){
 const moduleName=topic.module==='IN2106'?'Praktikum':'Seminar',credits=topic.module==='IN2106'?10:5;
 const prose=(text,missing)=>Array.isArray(text)?`<ul class="topic-detail-points">${text.map(point=>`<li>${e(point)}</li>`).join('')}</ul>`:`<p${text?'':' class="topic-detail-missing"'}>${e(text||missing)}</p>`;
 const missingOverview='本学期官方页面未提供具体内容介绍，或只提供通知与外部链接。请查看原页或向授课团队确认。';
 return `<article class="topic-detail" id="topic-detail" data-topic-id="${e(topic.id)}" data-topic-module="${topic.module}">
 ${backLink(base+'/courses/'+topic.module+'/','返回 '+moduleName+' 模块',{classes:'topic-detail-back'})}
 <header class="topic-detail-header"><p class="topic-detail-kicker">${e(C.topicTermLabel(topic.term))} · ${topic.module} 具体课题</p><h1>${e(T.displayTitle(topic.title))}</h1>
 <div class="topic-detail-overview">${prose(detail.overview,'官方页暂未提供课题简介，内容需向授课团队确认。')}</div>
 <dl class="topic-detail-facts"><div><dt>授课教师</dt><dd>${e(detail.teachers.join('、')||'官方页面暂未提供')}</dd></div><div><dt>授课语言</dt><dd>${e(detail.languages.map(x=>({EN:'英语',DE:'德语'}[x]||x)).join(' / ')||'待确认')}</dd></div><div><dt>负责机构</dt><dd>${e(detail.organization||'官方页面暂未提供')}</dd></div><div><dt>所属模块</dt><dd>${moduleName} · ${credits} ECTS<small>课题记录在模块下，沿用模块学分</small></dd></div></dl></header>
 <div class="topic-detail-layout"><div class="topic-detail-body">
 <section class="topic-detail-section" id="topic-content" aria-labelledby="topic-content-title"><h2 id="topic-content-title">课程介绍</h2>
 ${prose(detail.topics,missingOverview)}
 ${detail.outcomes?`<div id="topic-outcomes" class="topic-detail-fragment">${prose(detail.outcomes.join(' '),'')}</div>`:''}</section>
 <section class="topic-detail-section" id="topic-requirements" aria-labelledby="topic-requirements-title"><h2 id="topic-requirements-title">参加要求</h2>
 ${prose(detail.prerequisites,'本学期公开页面未单独列明先修要求，请向授课团队确认；不能据此认定没有要求。')}
 <p class="topic-detail-application">课题收录自余位名单，名额可能已变化；是否仍接收申请及额外材料要求，请以当期官方说明和授课团队答复为准。<a class="text-link" href="${e(base+'/guides/matching/')}">查看名额申请步骤 →</a></p></section>
 <section class="topic-detail-section" id="topic-learning" aria-labelledby="topic-learning-title"><h2 id="topic-learning-title">上课与考核</h2>
 ${detail.teaching?prose(detail.teaching,''):''}
 <div id="topic-work" class="topic-detail-fragment">${detail.activities?prose(detail.activities,''):''}</div>
 ${detail.assessment?`<p class="topic-detail-assessment"><strong>考核：</strong>${e(detail.assessment)}</p>`:`<p class="topic-detail-missing">${detail.teaching||detail.activities?'官方页未单独说明考核形式或评分比例，请查看当期课程要求。':'官方页未单独说明具体教学与考核安排，请向授课团队确认。'}</p>`}</section>
 <footer class="topic-detail-source"><p>按 ${e(C.topicTermLabel(topic.term))} 官方独立课程页${detail.websiteSources?.length?'及授课团队资料':''}原创整理 · 核对于 ${e(detail.checkedOn)}<br>具体安排以当期课程要求和授课团队通知为准。</p>${detail.sourceReviewNote?`<p>${e(detail.sourceReviewNote)}</p>`:''}<div class="topic-detail-source-links"><a class="text-link" href="${e(detail.officialURL)}" target="_blank" rel="noopener noreferrer">查看完整官方课程页 ↗</a>${(detail.websiteSources||[]).map(source=>`<a class="text-link" href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.label)} ↗</a>`).join('')}</div></footer></div>
 <aside class="topic-detail-plan" aria-labelledby="topic-detail-plan-title"><h2 id="topic-detail-plan-title">添加到候选清单</h2><label for="topic-detail-semester">安排学期<select id="topic-detail-semester" disabled><option value="1">第 1 学期</option></select></label><button type="button" class="button" data-topic-pick="${e(topic.id)}" data-course-topic-open="${topic.module}" data-topic-target="topic-detail-semester" aria-haspopup="dialog" aria-controls="course-topic-dialog" disabled>加入候选</button><p data-topic-detail-status role="status" aria-live="polite">正在读取计划…</p><a class="text-link" href="${e(base+'/planner/')}">查看我的计划 →</a><noscript><p>管理候选需要启用 JavaScript；正文和官方入口仍可查看。</p></noscript></aside></div></article>`;
};
