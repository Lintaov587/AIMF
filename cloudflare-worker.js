import app from './cloudflare-core.generated.mjs';
import {adminHtml,adminJs} from './cloudflare-admin.generated.mjs';
const json=(value,status)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/mcp')return json({error:'Not found'},404);
 if(path==='/admin'||path==='/admin.html'||path==='/admin.js')return new Response(path==='/admin.js'?adminJs:adminHtml,{headers:{'Content-Type':path==='/admin.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const headers=new Headers(request.headers);
 for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);
 if(path.startsWith('/api/admin/')){
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Origin rejected'},403);
  const key=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!key||!env.ADMIN_TOKEN_HASH)return json({error:'请输入管理密钥'},401);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==env.ADMIN_TOKEN_HASH)return json({error:'管理密钥无效'},401);
  headers.set('oai-authenticated-user-id','cloudflare-owner');headers.set('oai-authenticated-user-email','cloudflare-owner@internal');
 }
 return app.fetch(new Request(request,{headers}),{...env,ADMIN_EMAIL:'cloudflare-owner@internal'},ctx);
}};
