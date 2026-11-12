const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const modes=['traditional','full'];
async function entries(db){return (await db.prepare('SELECT id,mode,name,elapsed_ms AS elapsedMs,moves,updated_at AS updatedAt FROM leaderboard ORDER BY elapsed_ms ASC,updated_at ASC').all()).results;}
export async function leaderboardApi(request,env,path){
 if(path==='/api/leaderboards'&&request.method==='GET'){
 const rows=await entries(env.DB);return reply(Object.fromEntries(modes.map(mode=>[mode,rows.filter(r=>r.mode===mode).slice(0,20)])));
 }
 const email=request.headers.get('oai-authenticated-user-email'),user=request.headers.get('oai-authenticated-user-id');
 if(!user||!email)return reply({error:'请登录站点所有者账号',signIn:'/signin-with-chatgpt?return_to=%2Fadmin'},401);
 if(!env.ADMIN_EMAIL||email.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())return reply({error:'只有站点所有者可以维护榜单'},403);
 const id=path.slice('/api/admin/leaderboards/'.length);
 if(request.method==='GET'&&path==='/api/admin/leaderboards')return reply({entries:await entries(env.DB)});
 if(request.method==='DELETE'&&/^[a-f0-9-]{36}$/.test(id)){
 await env.DB.prepare('DELETE FROM leaderboard WHERE id=?').bind(id).run();return reply({ok:true});
 }
 if(request.method==='POST'||request.method==='PUT'){
 const data=await request.json(),name=typeof data.name==='string'?data.name.trim():'';
 if(!modes.includes(data.mode)||!name||name.length>64||!Number.isSafeInteger(data.elapsedMs)||data.elapsedMs<=0||data.elapsedMs>86400000||!Number.isSafeInteger(data.moves)||data.moves<0)return reply({error:'请填写名称、有效耗时和步数'},400);
 if(request.method==='POST'&&path==='/api/admin/leaderboards'){
 const result=await env.DB.prepare('INSERT INTO leaderboard (id,mode,name,elapsed_ms,moves,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM leaderboard WHERE mode=?)<20').bind(crypto.randomUUID(),data.mode,name,data.elapsedMs,data.moves,Date.now(),data.mode).run();
 if(!result.meta.changes)return reply({error:'该组已有20条记录，请编辑或删除后再添加'},409);
 return reply({ok:true},201);
 }
 if(request.method==='PUT'&&/^[a-f0-9-]{36}$/.test(id)){
 const result=await env.DB.prepare('UPDATE leaderboard SET name=?,elapsed_ms=?,moves=?,updated_at=? WHERE id=? AND mode=?').bind(name,data.elapsedMs,data.moves,Date.now(),id,data.mode).run();
 return result.meta.changes?reply({ok:true}):reply({error:'记录不存在'},404);
 }
 }
 return reply({error:'Not found'},404);
}
