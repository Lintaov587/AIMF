import assets from './assets.generated.mjs';
import {FAIR_PLAY} from './rules.js';
import {leaderboardApi} from './leaderboard-api.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=message=>{throw Error(message);};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID().replaceAll('-','');
function publicState(s){
 if(!s||!Array.isArray(s.visibleFaces)||!Array.isArray(s.stickers)||s.stickers.length>27)fail('状态无效');
 if(!['waiting','inspection','playing','finished'].includes(s.phase)||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0)fail('会话状态版本已更新，请刷新页面');
 if(!['traditional','full'].includes(s.mode))fail('会话组别版本已更新，请刷新页面');
 return {mode:s.mode,revision:Number.isSafeInteger(s.revision)?s.revision:0,phase:s.phase,elapsedMs:s.elapsedMs,front:s.front,visibleFaces:s.visibleFaces,busy:!!s.busy,moves:s.moves,solved:!!s.solved,stickers:s.stickers.filter(t=>t.visible&&s.visibleFaces.includes(t.face)).map(t=>({id:t.id,color:t.color,position:t.position,face:t.face,visible:true,center:!!t.center,pushDirections:['up','down','left','right']}))};
}
const sessionProperty={type:'string',description:'页面右上角 AI 连接中复制的会话码。仅用于该局，不得猜测或枚举。'};
const faceProperty={type:'string',enum:['R','L','U','D','F','B']};
const tool=(name,description,properties={},required=[])=>({name,description,inputSchema:{type:'object',properties:{session:sessionProperty,...properties},required:['session',...required],additionalProperties:false}});
const tools=[
 tool('cube_start','开始或重新开始：重新打乱并清零成绩。组别由网页选择；传统比赛组首次拧动后计时，完全计时组打乱后计时。还原后停表。'),
 tool('cube_observe','观察指定会话当前可见贴片，不包含背面、打乱序列或历史。必须自行推理还原，禁止调用外部求解器或编写、运行求解器代码。'),
 tool('cube_face','将当前可见面转到正面。',{face:faceProperty},['face']),
 tool('cube_turn','旋转当前可见面；从面外侧看顺逆时针。',{face:faceProperty,clockwise:{type:'boolean'}},['face','clockwise']),
 tool('cube_push','推动可见贴片所在层。',{sticker:{type:'string'},direction:{type:'string',enum:['up','down','left','right']}},['sticker','direction']),
 tool('cube_sequence',"连续执行最多32个空格分隔的动作。例如 R U R' U'；支持R2半转、@U将可见U面转到正面。执行前预检整组可见性。",{sequence:{type:'string',maxLength:200}},['sequence']),
];
async function readBrowser(db,id,bearer){
 if(typeof id!=='string'||typeof bearer!=='string')fail('缺少会话凭证');
 const s=await db.prepare('SELECT * FROM sessions WHERE id=? AND browser_hash=? AND expires>?').bind(id,await hash(bearer),Date.now()).first();
 if(!s)fail('会话已结束或凭证无效');return s;
}
async function browserApi(request,db,path){
 const data=await request.json(),now=Date.now();
 if(path==='/api/session/create'){
 const id=token(),browser=token(),ai=token(),state=publicState(data.state);
 await db.batch([
 db.prepare('DELETE FROM commands WHERE expires<?').bind(now-86400000),
 db.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
 db.prepare('INSERT INTO sessions (id,browser_hash,ai_hash,owner,state,last_seen,expires) VALUES (?,?,?,?,?,?,?)').bind(id,await hash(browser),await hash(ai),request.headers.get('oai-authenticated-user-id'),JSON.stringify(state),now,now+86400000),
 ]);
 return json({id,browser,code:id+'.'+ai});
 }
 const s=await readBrowser(db,data.id,data.browser);
 if(path==='/api/session/end'){
 await db.batch([db.prepare('DELETE FROM commands WHERE session=?').bind(s.id),db.prepare('DELETE FROM sessions WHERE id=?').bind(s.id)]);return json({ok:true});
 }
 if(path==='/api/session/revoke'){
 const ai=token();await db.batch([db.prepare('UPDATE commands SET status=\'cancelled\' WHERE session=? AND status IN (\'pending\',\'running\')').bind(s.id),db.prepare('UPDATE sessions SET ai_hash=?,ai_owner=NULL,active_command=NULL WHERE id=?').bind(await hash(ai),s.id)]);return json({code:s.id+'.'+ai});
 }
 if(path==='/api/session/sync'||path==='/api/session/poll'){
 const state=publicState(data.state);
 const operations=[db.prepare('UPDATE sessions SET state=CASE WHEN coalesce(json_extract(state,\'$.revision\'),0)<=? THEN ? ELSE state END,last_seen=? WHERE id=?').bind(state.revision,JSON.stringify(state),now,s.id)];
 if(data.command){
 const result=data.error?{error:String(data.error)}:publicState(data.result);
 operations.push(db.prepare('UPDATE commands SET status=\'done\',result=? WHERE id=? AND session=? AND status=\'running\'').bind(JSON.stringify(result),data.command,s.id));
 operations.push(db.prepare('UPDATE sessions SET active_command=NULL WHERE id=? AND active_command=?').bind(s.id,data.command));
 }
 await db.batch(operations);
 if(path.endsWith('/sync'))return json({ok:true});
 // A command can only be delivered once, including when requests overlap.
 const command=await db.prepare('UPDATE commands SET status=\'running\' WHERE id=(SELECT id FROM commands WHERE session=? AND status=\'pending\' AND expires>? LIMIT 1) AND status=\'pending\' RETURNING id,payload').bind(s.id,now).first();
 return json({command:command?{id:command.id,...JSON.parse(command.payload)}:null});
 }
 return json({error:'Not found'},404);
}
function validateAction(type,a){
 if(!['start','face','turn','push','sequence'].includes(type))fail('不支持的操作');
 if(['face','turn'].includes(type)&&!faceProperty.enum.includes(a.face))fail('无效面');
 if(type==='turn'&&typeof a.clockwise!=='boolean')fail('需要 clockwise 布尔值');
 if(type==='push'&&(typeof a.sticker!=='string'||!['up','down','left','right'].includes(a.direction)))fail('无效推动指令');
 if(type==='sequence'&&(typeof a.sequence!=='string'||a.sequence.length>200||a.sequence.trim().split(/\s+/).length>32||!/^(@[RLUDFB]|[RLUDFB][2']?)(\s+(@[RLUDFB]|[RLUDFB][2']?))*$/.test(a.sequence.trim())))fail('无效连续动作');
}
async function runAction(db,s,type,a){
 const id=s.id;validateAction(type,a);
 const current=JSON.parse(s.state);
 if(['turn','push','sequence'].includes(type)&&!['inspection','playing'].includes(current.phase))fail(current.phase==='waiting'?'请先发送开始指令':'本局已完成');
 const payload={type};for(const key of ['face','clockwise','sticker','direction','sequence'])if(a[key]!==undefined)payload[key]=a[key];
 const command=token(),expires=Date.now()+25000;
 const results=await db.batch([
 db.prepare('UPDATE sessions SET active_command=? WHERE id=? AND (active_command IS NULL OR NOT EXISTS (SELECT 1 FROM commands WHERE id=sessions.active_command AND expires>? AND status IN (\'pending\',\'running\'))) AND json_extract(state,\'$.busy\')=0').bind(command,id,Date.now()),
 db.prepare('INSERT INTO commands (id,session,payload,status,expires) SELECT ?,?,?,\'pending\',? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND active_command=?)').bind(command,id,JSON.stringify(payload),expires,id,command),
 ]);
 if(!results[1].meta.changes)fail('当前操作进行中，请等待完成');
 for(let i=0;i<34;i++){
 await new Promise(resolve=>setTimeout(resolve,700));
 const c=await db.prepare('SELECT status,result FROM commands WHERE id=?').bind(command).first();
 if(c?.status==='done'){const value=JSON.parse(c.result);return value;}
 if(c?.status==='cancelled')fail('玩家已撤销 AI 连接');
 }
 await db.batch([db.prepare('UPDATE commands SET status=\'timeout\' WHERE id=? AND status IN (\'pending\',\'running\')').bind(command),db.prepare('UPDATE sessions SET active_command=NULL WHERE id=? AND active_command=?').bind(id,command)]);fail('操作超时，请重新观察当前状态');
}
async function mcp(request,db){
 const rpc=await request.json(),respond=result=>json({jsonrpc:'2.0',id:rpc.id,result});
 if(rpc.method==='server/discover')return respond({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(rpc.method==='initialize')return respond({protocolVersion:rpc.params?.protocolVersion??'2025-03-26',serverInfo:{name:'cube-cloud',version:'2.1.0'},capabilities:{tools:{}},instructions:FAIR_PLAY+' 每次操作需要玩家从页面复制的会话码。只允许控制玩家当时可见的面。'});
 if(rpc.method==='ping')return respond({});
 if(rpc.method==='tools/list')return respond({tools});
 if(rpc.id===undefined)return new Response(null,{status:202});
 if(rpc.method!=='tools/call')return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}});
 try{
 const {name,arguments:a}=rpc.params??{};
 if(!tools.some(t=>t.name===name)||!a||typeof a.session!=='string')fail('工具或会话码无效');
 const [id,secret,...extra]=a.session.split('.');if(extra.length||!id||!secret)fail('会话码无效');
 const user=request.headers.get('oai-authenticated-user-id');if(!user)fail('请登录后通过 Site 插件连接 AI');
 const s=await db.prepare('SELECT * FROM sessions WHERE id=? AND ai_hash=? AND expires>?').bind(id,await hash(secret),Date.now()).first();
 if(!s||(s.owner&&s.owner!==user)||(s.ai_owner&&s.ai_owner!==user))fail('会话码无效或不属于当前账号');
 if(Date.now()-s.last_seen>15000)fail('游戏页面未在线，请先打开对应页面');
 const claimed=await db.prepare('UPDATE sessions SET ai_owner=? WHERE id=? AND (ai_owner IS NULL OR ai_owner=?) RETURNING id').bind(user,id,user).first();
 if(!claimed)fail('会话已连接到其他账号');
 if(name==='cube_observe')return respond({content:[{type:'text',text:JSON.stringify(JSON.parse(s.state))}]});
 const value=await runAction(db,s,name.slice(5),a);return respond({content:[{type:'text',text:JSON.stringify(value)}],isError:!!value.error});
 }catch(error){return respond({content:[{type:'text',text:error.message}],isError:true});}
}
async function httpAi(request,db,path){
 if(path==='/api/ai/schema'&&request.method==='GET')return json({authentication:'Authorization: Bearer <session code>',state:{method:'GET',path:'/api/ai/state'},action:{method:'POST',path:'/api/ai/action',contentType:'application/json',types:tools.filter(t=>t.name!=='cube_observe').map(t=>({type:t.name.slice(5),description:t.description,properties:Object.fromEntries(Object.entries(t.inputSchema.properties).filter(([k])=>k!=='session')),required:t.inputSchema.required.filter(k=>k!=='session')}))},rules:FAIR_PLAY});
 if(!((path==='/api/ai/state'&&request.method==='GET')||(path==='/api/ai/action'&&request.method==='POST')))return json({error:'Not found'},404);
 const code=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!code||!/^[a-f0-9]{32}\.[a-f0-9]{32}$/.test(code))return json({error:'缺少有效会话码'},401);
 const [id,secret]=code.split('.');
 const session=await db.prepare('SELECT * FROM sessions WHERE id=? AND ai_hash=? AND expires>?').bind(id,await hash(secret),Date.now()).first();
 if(!session)return json({error:'会话码已失效'},401);
 if(Date.now()-session.last_seen>15000)return json({error:'游戏页面未在线'},409);
 if(path==='/api/ai/state')return json(JSON.parse(session.state));
 const args=await request.json();if(!args||typeof args!=='object'||Array.isArray(args))return json({error:'无效操作'},400);
 const value=await runAction(db,session,args.type,args);return json(value,value.error?400:200);
}
async function route(request,env,url){
 if(url.pathname==='/api/leaderboards'||url.pathname.startsWith('/api/admin/leaderboards'))return await leaderboardApi(request,env,url.pathname);
 if(url.pathname.startsWith('/api/ai/'))return await httpAi(request,env.DB,url.pathname);
 if(request.method==='POST'&&url.pathname==='/mcp')return await mcp(request,env.DB);
 if(request.method==='POST'&&url.pathname.startsWith('/api/session/'))return await browserApi(request,env.DB,url.pathname);
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname==='/admin'?'/admin.html':url.pathname];
 if(request.method==='GET'&&asset)return new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
 return json({error:'Not found'},404);
}

export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin');
 const corsPath=url.pathname==='/api/leaderboards'||url.pathname.startsWith('/api/session/')||url.pathname.startsWith('/api/ai/');
 const configured=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const cross=!!origin&&origin!==url.origin;
 if(cross&&(!corsPath||!configured.includes(origin)))return json({error:'Origin rejected'},403);
 let response;
 if(request.method==='OPTIONS'&&cross)response=new Response(null,{status:204});
 else try{response=await route(request,env,url);}catch(error){response=json({error:error.message},400);}
 if(cross){const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');headers.set('Access-Control-Max-Age','600');headers.set('Vary','Origin');response=new Response(response.body,{status:response.status,headers});}
 return response;
}};
