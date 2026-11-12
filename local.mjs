import http from 'node:http';
import {WebSocketServer} from 'ws';
import {Miniflare} from 'miniflare';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT||3210);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
await mkdir(path.join(root,'.local'),{recursive:true});
const mf=new Miniflare({host:'127.0.0.1',d1Persist:path.join(root,'.local/d1'),durableObjectsPersist:path.join(root,'.local/objects'),workers:[{name:'local-app',modules:true,scriptPath:path.join(root,'dist/server/index.js'),compatibilityDate:'2026-07-30',d1Databases:{DB:'cube-local'},bindings:{ADMIN_EMAIL:'local-admin@localhost'},durableObjects:{CUBE_SESSIONS:{className:'CubeSession',scriptName:'local-relay'}}},{name:'local-relay',modules:true,scriptPath:path.join(root,'dist/relay/index.js'),compatibilityDate:'2026-07-30',durableObjects:{CUBE_SESSIONS:{className:'CubeSession',useSQLite:true}}}]});
const db=await mf.getD1Database('DB','local-app');
await db.prepare('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)').run();
for(const name of (await readdir(path.join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort()){
 if(await db.prepare('SELECT name FROM __local_migrations WHERE name=?').bind(name).first())continue;
 const sql=await readFile(path.join(root,'drizzle',name),'utf8');
 await db.batch([...sql.split('--> statement-breakpoint').filter(s=>s.trim()).map(s=>db.prepare(s)),db.prepare('INSERT INTO __local_migrations (name) VALUES (?)').bind(name)]);
}
const server=http.createServer(async(req,res)=>{
 try{
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(400);res.end('Invalid host');return;}
 const url=new URL(req.url,'http://'+req.headers.host),headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
 // This adapter is loopback-only. Production identity remains the hosting provider's responsibility.
 if(url.pathname.startsWith('/api/admin/')){headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','local-admin@localhost');}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw Error('Request too large');chunks.push(chunk);}
 const response=await mf.dispatchFetch(url.href,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
const wss=new WebSocketServer({noServer:true,maxPayload:65536});
server.on('upgrade',async(req,socket,head)=>{try{
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){socket.destroy();return;}
 const response=await mf.dispatchFetch('http://'+req.headers.host+req.url,{headers:req.headers});
 if(response.status!==101||!response.webSocket){socket.end('HTTP/1.1 '+response.status+' Rejected\r\nConnection: close\r\n\r\n');return;}
 const target=response.webSocket;target.accept();wss.handleUpgrade(req,socket,head,client=>{target.addEventListener('message',event=>{if(client.readyState===1)client.send(event.data);});target.addEventListener('close',event=>client.close(event.code===1005?1000:event.code,event.reason));client.on('message',data=>target.send(data.toString()));client.on('close',(code,reason)=>target.close(code===1005?1000:code,reason.toString()));client.on('error',()=>target.close());});
 }catch{socket.destroy();}});
server.listen(port,'127.0.0.1',()=>console.log('LLM 模仿挑战 / http://127.0.0.1:'+port+'\n本地榜单后台 / http://127.0.0.1:'+port+'/admin'));
process.on('SIGINT',async()=>{server.close();await mf.dispose();process.exit();});
