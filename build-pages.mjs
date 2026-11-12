import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=process.env.PAGES_BASE;
const backend=process.env.PAGES_BACKEND;
if(!base||!base.startsWith('/')||!base.endsWith('/')||base.includes('..'))throw Error('PAGES_BASE must be an absolute path ending in /');
if(!backend)throw Error('Set PAGES_BACKEND to the deployed API origin');
const api=new URL(backend);if(api.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(api.hostname))throw Error('Use HTTPS for the public API');
const {default:assets}=await import('./assets.generated.mjs');
const output=path.join(root,'docs');await fs.mkdir(output,{recursive:true});
for(const [url,asset]of Object.entries(assets)){
 if(url==='/admin.html'||url==='/admin.js')continue;
 let body=asset.body;
 if(url.endsWith('.js')||url.endsWith('.html'))body=body.replace(/(["'])\/(vendor\/|app\.js|style\.css|transport\.js|scramble-client\.js|rules\.js|competition\.js|runtime-config\.js)/g,(_,quote,rest)=>quote+base+rest);
 if(url.startsWith('/vendor/cubing/'))body='/* cubing.js 0.66.1 — MPL-2.0. Static-host import paths modified. See /licenses/ and THIRD_PARTY_NOTICES.md. */\n'+body;
 if(url==='/runtime-config.js')body='export const API_BASE='+JSON.stringify(api.origin)+';\n';
 const target=path.join(output,url.slice(1));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,body);
}
await fs.cp(path.join(root,'licenses'),path.join(output,'licenses'),{recursive:true});
await fs.copyFile(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
await fs.writeFile(path.join(output,'.nojekyll'),'');
console.log('Built GitHub Pages at '+base+' using API '+api.origin);
