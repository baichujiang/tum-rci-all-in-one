'use strict';
const T=require('../site3/course-topics'),C=require('../assets/core');
module.exports=function courseTopicsView(code,catalog){
 if(!T.supported(code))return '';
 return `<div class="course-topic-static" id="course-topics" data-topic-static="${code}">${T.field(code,[],{ready:false,target:'detail-semester'})}</div><noscript><p class="meta">管理候选需要启用 JavaScript。<a class="text-link" href="${C.esc(catalog.sourceURL)}" target="_blank" rel="noopener noreferrer">查看官方课题名单与申请说明 ↗</a></p></noscript>`;
};
