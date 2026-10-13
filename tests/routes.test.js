/* Keep previously shared hash routes valid on case-sensitive static hosting. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site3/app.js'),'utf8').split('// Preserve already shared routes on the same origin.')[1].split('const checklist=')[0];
function redirect(hash,base=''){
 let result=null;vm.runInNewContext(source,{location:{hash,replace:value=>{result=value;}},full:value=>base+value});return result;
}
const cases=[
 ['#/course/in2067','/courses/IN2067/'],
 ['#/course/IN2067?semester=3','/courses/IN2067/?semester=3'],
 ['#/course/ed160028','/courses/ED160028/'],
 ['#/courses?group=G','/courses/?group=G'],
 ['#/article/curriculum','/guides/curriculum/'],
 ['#/guide/02','/archive/02/'],
 ['#/course/../planner',null],
 ['#bookmarks',null]
];
for(const [hash,expected] of cases){assert.equal(redirect(hash),expected,hash);console.log('PASS shared route',hash);}
assert.equal(redirect('#/course/in2067?semester=2','/tum-rci-all-in-one'),'/tum-rci-all-in-one/courses/IN2067/?semester=2');
console.log('9 legacy route checks passed');
