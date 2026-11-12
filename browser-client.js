import {connectionBundle} from '/rules.js';
import {API_BASE} from '/runtime-config.js';
export async function createLink({snapshot,execute,status}){
 let session=null,closed=false,timer=null,inFlight=false;
 const post=async(path,data)=>{const response=await fetch(API_BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error??'连接失败');return result;};
 session=await post('/api/session/create',{state:snapshot()});
 const credentials=()=>({id:session.id,browser:session.browser});
 const link={remote:true,get copyText(){return connectionBundle(new URL('.',location.href).href.replace(/\/$/,''),session.code,snapshot().mode,API_BASE||location.origin);},
 async sync(command,result){if(closed)return;const payload={...credentials(),state:snapshot()};if(command){payload.command=command;if(result?.error)payload.error=result.error;else payload.result=result;}await post('/api/session/sync',payload);},
 async revoke(){const result=await post('/api/session/revoke',credentials());session.code=result.code;return result.code;},
 async end(){await post('/api/session/end',credentials());closed=true;clearTimeout(timer);status('会话已结束',false);},
 };
 async function poll(){
 if(closed)return;
 try{
 inFlight=true;const result=await post('/api/session/poll',{...credentials(),state:snapshot()});status('协作就绪',true);
 if(result.command){try{await link.sync(result.command.id,await execute(result.command));}catch(error){await link.sync(result.command.id,{error:error.message});}}
 }catch(error){status(error.message,false);}finally{inFlight=false;if(!closed)timer=setTimeout(poll,800);}
 }
 status('协作就绪',true);poll();
 addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);navigator.sendBeacon(API_BASE+'/api/session/end',new Blob([JSON.stringify(credentials())],{type:'application/json'}));});
 return link;
}
