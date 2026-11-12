import {publicState,validateAction} from './cube-protocol.js';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID().replaceAll('-','');
export class CubeSession {
 constructor(ctx){this.ctx=ctx;this.session=null;this.pending=null;this.authTimers=new Map();ctx.blockConcurrencyWhile(async()=>{this.session=await ctx.storage.get('session');});}
 send(ws,data){ws.send(JSON.stringify(data));}
 sockets(){return this.ctx.getWebSockets().filter(ws=>{const a=ws.deserializeAttachment();return ws.readyState===1&&a?.authenticated&&a.generation===this.session?.generation;});}
 finish(value,status=200){if(!this.pending)return;const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve(json(value,status));}
 async save(state,force=false){const s=publicState(state);if(force||s.revision>this.session.state.revision){this.session.state=s;this.session.observedAt=Date.now();await this.ctx.storage.put('session',this.session);}}
 state(){const s=this.session.state;return {...s,elapsedMs:s.elapsedMs+(s.phase==='playing'?Math.max(0,Date.now()-this.session.observedAt):0)};}
 async fetch(request){try{
 const path=new URL(request.url).pathname;
 if(path==='/create'&&request.method==='POST'){
 if(this.session)return json({error:'会话已存在'},409);
 const data=await request.json(),browser=token(),ai=token();this.session={id:data.id,browserHash:await hash(browser),aiHash:await hash(ai),state:publicState(data.state),observedAt:Date.now(),expires:Date.now()+86400000,generation:token()};
 await this.ctx.storage.put('session',this.session);await this.ctx.storage.setAlarm(this.session.expires);return json({id:data.id,browser,code:data.id+'.'+ai});
 }
 if(!this.session||this.session.expires<=Date.now())return json({error:'会话已失效，请刷新连接信息'},401);
 if(path==='/socket'){
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
 if(this.ctx.getWebSockets().some(ws=>!ws.deserializeAttachment()?.authenticated))return json({error:'连接正在建立'},409);
 const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);server.serializeAttachment({authenticated:false});this.authTimers.set(server,setTimeout(()=>{this.authTimers.delete(server);if(!server.deserializeAttachment()?.authenticated)server.close(4001,'认证超时');},10000));return new Response(null,{status:101,webSocket:client});
 }
 if(path==='/end'){
 const d=await request.json();if(await hash(String(d.browser))!==this.session.browserHash)return json({error:'会话凭证无效'},401);await this.end();return json({ok:true});
 }
 const secret=request.headers.get('Authorization')?.match(/^Bearer [a-f0-9]{32}\.([a-f0-9]{32})$/)?.[1];
 if(!secret||await hash(secret)!==this.session.aiHash)return json({error:'会话码已失效，请索取新的连接信息'},401);
 const socket=this.sockets()[0];if(!socket)return json({error:'游戏页面未连接，请先打开对应页面'},409);
 if(path==='/state'&&request.method==='GET')return json(this.state());
 if(path==='/action'&&request.method==='POST'){
 const data=await request.json();validateAction(data.type,data);
 if(this.pending||this.session.state.busy)return json({error:'当前操作进行中，请等待完成'},409);
 if(['turn','push','sequence'].includes(data.type)&&!['inspection','playing'].includes(this.session.state.phase))return json({error:'请先开始新一局'},400);
 const payload={type:data.type};for(const k of ['face','clockwise','sticker','direction','sequence'])if(data[k]!==undefined)payload[k]=data[k];
 return new Promise(resolve=>{const id=token();this.pending={id,resolve,timer:setTimeout(()=>this.finish({error:'操作超时，请重新观察当前状态'},504),25000)};try{this.send(socket,{...payload,type:'command',id,action:data.type});}catch{this.finish({error:'连接中断，请重新观察当前状态'},409);}});
 }
 return json({error:'Not found'},404);
 }catch(error){return json({error:error.message},400);}}
 async webSocketMessage(ws,message){let data;try{
 if(typeof message!=='string'||message.length>65536)throw Error('消息无效');data=JSON.parse(message);
 if(!this.session||this.session.expires<=Date.now()){ws.close(4001,'会话已结束');return;}
 const attached=ws.deserializeAttachment();
 if(!attached?.authenticated){
 if(data.type!=='auth'||await hash(String(data.browser))!==this.session.browserHash){ws.close(4001,'会话凭证无效');return;}
 clearTimeout(this.authTimers.get(ws));this.authTimers.delete(ws);const old=this.sockets();this.finish({error:'页面重新连接，请重新观察当前状态'},409);this.session.generation=token();ws.serializeAttachment({authenticated:true,generation:this.session.generation});await this.save(data.state,true);
 for(const other of old)if(other!==ws)other.close(4000,'连接已替换');this.send(ws,{type:'ready'});return;
 }
 if(attached.generation!==this.session.generation){ws.close(4000,'连接已替换');return;}
 if(data.type==='state'){await this.save(data.state);this.send(ws,{type:'ack',mid:data.mid});return;}
 if(data.type==='result'){
 await this.save(data.state);
 if(this.pending?.id===data.id)this.finish(data.error?{error:String(data.error)}:this.state(),data.error?400:200);
 this.send(ws,{type:'ack',mid:data.mid});return;
 }
 if(data.type==='revoke'){
 const ai=token();this.session.aiHash=await hash(ai);await this.ctx.storage.put('session',this.session);this.finish({error:'玩家已撤销 AI 连接'},409);this.send(ws,{type:'ack',mid:data.mid,code:this.session.id+'.'+ai});return;
 }
 throw Error('未知消息');
 }catch(error){this.send(ws,{type:'ack',mid:data?.mid,error:error.message});}}
 webSocketClose(ws,code,reason){if(ws.deserializeAttachment()?.generation===this.session?.generation)this.finish({error:'页面连接已断开，请重新观察当前状态'},409);try{ws.close(code,reason);}catch{}}
 webSocketError(ws){this.webSocketClose(ws,1011,'连接异常');}
 async end(){this.finish({error:'会话已结束'},409);this.session=null;for(const ws of this.ctx.getWebSockets())ws.close(4001,'会话已结束');await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();}
 async alarm(){await this.end();}
}
export default {fetch(){return new Response('Not found',{status:404});}};
