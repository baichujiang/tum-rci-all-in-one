/* Read-only audit of live dish names; never freeze menu dates or prices into the site. */
'use strict';
const M=require('../site3/mensa'),catalog=require('../content/canteens.json'),zh=require('../content/mensa-zh.json');
async function main(){
 const selected=process.argv[2]||M.berlinDate();
 M.weekOf(selected);
 const dates=process.argv[2]?[selected]:[-7,0,7,14].map(offset=>M.offsetDate(selected,offset));
 const jobs=catalog.canteens.flatMap(c=>dates.map(date=>({id:c.id,date}))),names=new Set(),missing=new Set(),categories=new Set(),labels=new Set(),errors=[];
 let available=0,unavailable=0;
 for(let start=0;start<jobs.length;start+=5)await Promise.all(jobs.slice(start,start+5).map(async({id,date})=>{
  try{
   const response=await fetch(M.menuURL(id,date),{signal:AbortSignal.timeout(12000)});
   if(response.status===404){unavailable++;return;}
   if(!response.ok)throw Error('HTTP '+response.status);
   const raw=await response.json();
   M.dishesFor(raw,date);
   for(const day of raw.days)for(const dish of M.dishesFor(raw,day.date)){
    names.add(dish.name);
    if(!M.lookupTranslation(zh.dishes,dish.name))missing.add(dish.name);
    if(dish.type&&!M.categoryTranslation(zh.categories,dish.type))categories.add(dish.type);
    for(const label of dish.labels)if(!M.lookupTranslation(catalog.labels,label))labels.add(label);
   }
   available++;
  }catch(error){errors.push(`${id} ${date}: ${error.message}`);}
 }));
 console.log(`${available} 份周菜单可读取，${unavailable} 份未公布；检查 ${names.size} 个菜名，${missing.size} 个待补中文。`);
 if(missing.size)console.log(JSON.stringify([...missing].sort(),null,2));
 console.log(`${categories.size} 个分类、${labels.size} 个食材标记待补中文。`);
 if(categories.size)console.log('分类：'+JSON.stringify([...categories].sort()));
 if(labels.size)console.log('食材标记：'+JSON.stringify([...labels].sort()));
 for(const error of errors)console.error(error);
 if(missing.size||categories.size||labels.size||errors.length)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
