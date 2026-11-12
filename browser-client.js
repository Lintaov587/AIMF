import {connectionBundle} from '/rules.js';
import {API_BASE} from '/runtime-config.js';
export async function createLink({snapshot,execute,status}){
 let session=null,socket=null,closed=false,connecting=null,retry=null,failures=0,lastRevision=-1,connected=false;
 const pending=new Map();
 const post=async(path,data)=>{const r=await fetch(API_BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(v.error||'连接失败');return v;};
 function request(type,data={}){
 if(!connected||socket?.readyState!==WebSocket.OPEN)return Promise.reject(Error('AI 连接已断开'));
 return new Promise((resolve,reject)=>{const mid=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(mid);reject(Error('消息确认超时'));},15000);pending.set(mid,{resolve,reject,timer});socket.send(JSON.stringify({type,mid,...data}));});
 }
 async function open(){
 const url=new URL('/api/session/socket',API_BASE||location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('id',session.id);
 await new Promise((resolve,reject)=>{
 const ws=new WebSocket(url);socket=ws;connected=false;let ready=false,authRevision=-1;
 const timeout=setTimeout(()=>ws.close(4002,'连接超时'),15000);
 ws.onopen=()=>{const state=snapshot();authRevision=state.revision;ws.send(JSON.stringify({type:'auth',browser:session.browser,state}));};
 ws.onmessage=async event=>{const data=JSON.parse(event.data);
 if(data.type==='ready'){clearTimeout(timeout);ready=true;connected=true;failures=0;lastRevision=authRevision;status('协作就绪',true);resolve();link.sync().catch(e=>status(e.message,false));return;}
 if(data.type==='ack'){const p=pending.get(data.mid);if(p){clearTimeout(p.timer);pending.delete(data.mid);data.error?p.reject(Error(data.error)):p.resolve(data);}return;}
 if(data.type==='command'){
 let result,error;try{result=await execute({...data,type:data.action});}catch(e){error=e.message;}
 try{await request('result',{id:data.id,state:result?.error?snapshot():(result||snapshot()),error:error||result?.error});lastRevision=snapshot().revision;}catch(e){status(e.message,false);}
 }
 };
 ws.onclose=event=>{
 clearTimeout(timeout);if(socket!==ws)return;connected=false;
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('AI 连接已断开'));}pending.clear();
 if(!ready)reject(Error(event.reason||'WebSocket 连接失败'));
 if(event.code===4001||event.code===4000){closed=true;status(event.reason||'会话已结束，请刷新页面',false);return;}
 status('连接断开，正在重连',false);
 // Reconnect only after a disconnection; there is no idle timer or polling path.
 if(!closed){clearTimeout(retry);retry=setTimeout(()=>connect().catch(()=>{}),Math.min(30000,1000*2**Math.min(failures++,5)));}
 };
 ws.onerror=()=>{};
 });
 }
 async function connect(){
 if(closed)throw Error('会话已结束，请刷新页面');if(connected&&socket?.readyState===WebSocket.OPEN)return;if(connecting)return connecting;
 connecting=(async()=>{if(!session)session=await post('/api/session/create',{state:snapshot()});await open();})();try{await connecting;}finally{connecting=null;}
 }
 const link={remote:true,connect,get copyText(){return session?connectionBundle(new URL('.',location.href).href.replace(/\/$/,''),session.code,snapshot().mode,API_BASE||location.origin):'';},
 async sync(){if(!session||closed||!connected)return;const state=snapshot();if(state.revision<=lastRevision)return;await request('state',{state});lastRevision=state.revision;},
 async revoke(){const data=await request('revoke');session.code=data.code;return data.code;},
 async end(){closed=true;clearTimeout(retry);if(!session)return;socket?.close(1000,'页面关闭');await post('/api/session/end',{id:session.id,browser:session.browser});status('会话已结束',false);}
 };
 status('未连接 AI',false);
 addEventListener('pagehide',()=>{closed=true;clearTimeout(retry);if(!session)return;socket?.close(1000,'页面关闭');navigator.sendBeacon(API_BASE+'/api/session/end',new Blob([JSON.stringify({id:session.id,browser:session.browser})],{type:'application/json'}));});
 return link;
}
