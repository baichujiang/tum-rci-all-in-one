/* Serve the built site and its feedback API together, bound to this Mac only. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const feedback=require('../api/feedback');
const handlers={'/api/feedback':feedback,'/api/admin-session':require('../api/admin-session'),'/api/admin-feedback':require('../api/admin-feedback'),'/api/admin-analytics':require('../api/admin-analytics')};
const root=path.resolve(__dirname,'../dist'),port=Number(process.env.PORT||8001);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 const send=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
 let url;try{url=new URL(req.url,'http://localhost');}catch(_){return send(400,'Bad request');}
 const handler=handlers[url.pathname.replace(/\/$/,'')];
 if(handler){
  let body='',bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>12000)return send(413,'Feedback too long');body+=chunk;}
  req.body=body;
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
  try{await handler(req,res);}catch(_){if(!res.headersSent)res.status(500).json({error:'服务暂时不可用，请稍后重试。'});}
  return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return send(405,'Method not allowed');
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch(_){return send(400,'Bad request');}
 if(file!==root&&!file.startsWith(root+path.sep))return send(403,'Forbidden');
 try{
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  const stat=fs.statSync(file);if(!stat.isFile())return send(404,'Not found');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(_){send(404,'Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`RCI site and feedback API: http://127.0.0.1:${port}`));
