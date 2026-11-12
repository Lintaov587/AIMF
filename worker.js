import assets from './assets.generated.mjs';
import {FAIR_PLAY} from './rules.js';
import {leaderboardApi} from './leaderboard-api.js';
import {tools} from './cube-protocol.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return json({error:'Origin rejected'},403);
 try{
 if(path==='/api/leaderboards'||path.startsWith('/api/admin/leaderboards'))return leaderboardApi(request,env,path);
 if(path==='/api/ai/schema'&&request.method==='GET')return json({authentication:'Authorization: Bearer <session code>',state:{method:'GET',path:'/api/ai/state'},action:{method:'POST',path:'/api/ai/action',contentType:'application/json',types:tools.filter(t=>t.name!=='cube_observe').map(t=>({type:t.name.slice(5),description:t.description,properties:Object.fromEntries(Object.entries(t.inputSchema.properties).filter(([k])=>k!=='session')),required:t.inputSchema.required.filter(k=>k!=='session')}))},rules:FAIR_PLAY});
 if(path==='/api/session/create'&&request.method==='POST'){
 const data=await request.json(),id=crypto.randomUUID().replaceAll('-','');
 return env.CUBE_SESSIONS.get(env.CUBE_SESSIONS.idFromName(id)).fetch('https://session/create',{method:'POST',body:JSON.stringify({id,state:data.state})});
 }
 if(path==='/api/session/socket'&&request.method==='GET'){
 const id=url.searchParams.get('id');if(!/^[a-f0-9]{32}$/.test(id||''))return json({error:'会话无效，请刷新连接信息'},401);
 return env.CUBE_SESSIONS.get(env.CUBE_SESSIONS.idFromName(id)).fetch(new Request('https://session/socket',{headers:request.headers}));
 }
 if(path==='/api/session/end'&&request.method==='POST'){
 const data=await request.json();if(!/^[a-f0-9]{32}$/.test(data.id||''))return json({error:'会话无效'},401);
 return env.CUBE_SESSIONS.get(env.CUBE_SESSIONS.idFromName(data.id)).fetch('https://session/end',{method:'POST',body:JSON.stringify(data)});
 }
 if((path==='/api/ai/state'&&request.method==='GET')||(path==='/api/ai/action'&&request.method==='POST')){
 const code=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{32}\.[a-f0-9]{32})$/)?.[1];if(!code)return json({error:'缺少有效会话码'},401);
 const id=code.split('.')[0];return env.CUBE_SESSIONS.get(env.CUBE_SESSIONS.idFromName(id)).fetch(new Request('https://session'+(path.endsWith('/state')?'/state':'/action'),request));
 }
 if(path.startsWith('/api/session/'))return json({error:'连接协议已更新，请刷新游戏页面并重新复制连接信息'},410);
 const asset=assets[path==='/'?'/index.html':path==='/admin'?'/admin.html':path];if(request.method==='GET'&&asset)return new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
 return json({error:'Not found'},404);
 }catch(error){return json({error:error.message},400);}
}};
