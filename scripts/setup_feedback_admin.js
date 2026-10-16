/* Run locally once. Generated credentials stay in .vercel/ and never print to logs. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {hashPassword}=require('../lib/feedback-admin');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'.vercel'),envFile=path.join(root,'.env.local');
 const reset=process.argv.includes('--reset'),production=process.argv.includes('--production');
 if(process.argv.slice(2).some(arg=>!['--reset','--production'].includes(arg)))throw Error('仅支持可选参数 --production 和 --reset。');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
 if(production){
  const credentials=path.join(dir,'feedback-admin-production-login.txt');
  if(fs.existsSync(credentials)&&!reset)throw Error('生产管理员已配置。需要重置时明确使用 --production --reset。');
  const password=randomBytes(24).toString('base64url');
  const values={FEEDBACK_ADMIN_PASSWORD_HASH:await hashPassword(password),FEEDBACK_ADMIN_SESSION_SECRET:randomBytes(48).toString('base64url'),FEEDBACK_RATE_LIMIT_SECRET:randomBytes(32).toString('hex')};
  fs.writeFileSync(credentials,`反馈管理登录（正式网站）\n\n地址：https://tum-rci-all-in-one.vercel.app/admin/feedback/\n管理员密码：${password}\n\n这是独立的生产密码，与本地／预览不同。仅供你本人使用，请保存在密码管理器中。此文件不要上传或分享。\n`,{mode:0o600,flag:reset?'w':'wx'});
  fs.chmodSync(credentials,0o600);
  for(const [index,[key,value]]of Object.entries(values).entries()){
   const file=path.join(dir,'feedback-admin-production-env-'+index+'.json');
   fs.writeFileSync(file,JSON.stringify({key,value,type:'sensitive',target:['production']}),{mode:0o600,flag:reset?'w':'wx'});fs.chmodSync(file,0o600);
  }
  console.log('生产管理员登录信息保存在：'+credentials);
  console.log('三个生产环境请求体位于 .vercel/feedback-admin-production-env-0.json 至 env-2.json；同步成功后删除请求体。');
  return;
 }
 let current=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):'';
 if(/^FEEDBACK_ADMIN_/m.test(current)&&!reset)throw Error('管理员已配置。需要重置时明确使用 --reset。');
 if(reset)current=current.split('\n').filter(line=>!/^FEEDBACK_ADMIN_/.test(line)).join('\n');
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password),secret=randomBytes(48).toString('base64url');
 const values={FEEDBACK_ADMIN_PASSWORD_HASH:hash,FEEDBACK_ADMIN_SESSION_SECRET:secret};
 const credentials=path.join(dir,'feedback-admin-login.txt');
 fs.writeFileSync(credentials,`反馈管理登录（本地与预览环境）\n\n地址：http://127.0.0.1:8001/admin/feedback/\n管理员密码：${password}\n\n仅供你本人使用，请保存在密码管理器中。此文件不要上传或分享。\n`,{mode:0o600,flag:reset?'w':'wx'});
 fs.writeFileSync(envFile,current.replace(/\s*$/,'')+'\n'+Object.entries(values).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});fs.chmodSync(envFile,0o600);
 for(const [index,[key,value]]of Object.entries(values).entries())fs.writeFileSync(path.join(dir,'feedback-admin-env-'+index+'.json'),JSON.stringify({key,value,type:'encrypted',target:['development','preview']}),{mode:0o600,flag:reset?'w':'wx'});
 console.log('管理员已配置。登录信息保存在：'+credentials);
 console.log('环境配置保存在 .vercel/feedback-admin-env-0.json 与 feedback-admin-env-1.json，供同步到同一项目的非生产环境。');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
