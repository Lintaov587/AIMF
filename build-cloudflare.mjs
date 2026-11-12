import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {FAIR_PLAY} from './rules.js';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
const {default:assets}=await import('./assets.generated.mjs');
const output='cloudflare-dist';await fs.mkdir(output,{recursive:true});
for(const [url,asset]of Object.entries(assets)){
 const file=path.join(output,url.slice(1));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,asset.body);
}
await fs.cp('licenses',path.join(output,'licenses'),{recursive:true});await fs.copyFile('THIRD_PARTY_NOTICES.md',path.join(output,'THIRD_PARTY_NOTICES.md'));
let adminHtml=assets['/admin.html'].body.replace('正在验证账号…','').replace(/<a id="admin-signin"[^>]*>[^<]*<\/a>/,'<form id="admin-signin" hidden><label>管理密钥<input id="admin-key" type="password" required autocomplete="current-password"></label><button class="primary" type="submit">进入</button></form>');
let adminJs=assets['/admin.js'].body.replace("editing=null;","editing=null,adminKey='';").replace("headers:{'Content-Type':'application/json'}","headers:{'Content-Type':'application/json','Authorization':'Bearer '+adminKey}");
adminJs+="\n$('admin-signin').onsubmit=async e=>{e.preventDefault();adminKey=$('admin-key').value;$('admin-key').value='';try{await load();}catch(error){adminKey='';$('admin-content').hidden=true;$('admin-status').textContent=error.message;}};\n";
await fs.writeFile('cloudflare-admin.generated.mjs','export const adminHtml='+JSON.stringify(adminHtml)+';\nexport const adminJs='+JSON.stringify(adminJs)+';\n');
const core=(await fs.readFile('worker.js','utf8')).replace("import assets from './assets.generated.mjs';",'const assets={};');
await fs.writeFile('cloudflare-core.generated.mjs',core);
await build({absWorkingDir:root,tsconfigRaw:{},entryPoints:['cloudflare-worker.js'],outfile:path.join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/admin','/admin.html','/admin.js','/mcp'],exclude:[]}));
await fs.writeFile(path.join(output,'_headers'),'/admin\n  Cache-Control: no-store\n/admin.html\n  Cache-Control: no-store\n/admin.js\n  Cache-Control: no-store\n');
console.log('Built Cloudflare Pages: static assets + same-origin API');
