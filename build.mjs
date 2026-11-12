import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url)),source=path.join(root,'client');
const assets={};
async function add(url,file,type='text/javascript; charset=utf-8',transform=s=>s){assets[url]={type,body:transform(await fs.readFile(file,'utf8'))};}
for(const [url,file,type] of [['/index.html','index.html','text/html; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8'],['/app.js','app.js'],['/scramble-client.js','scramble-client.js']])await add(url,path.join(source,file),type);
await add('/competition.js',path.join(source,'competition.js'));
await add('/runtime-config.js',path.join(source,'runtime-config.js'));
await add('/admin.html',path.join(source,'admin.html'),'text/html; charset=utf-8');
await add('/admin.js',path.join(source,'admin.js'));
await add('/transport.js',path.join(root,'browser-client.js'));
await add('/rules.js',path.join(root,'rules.js'));
await add('/vendor/three.js',path.join(root,'node_modules/three/build/three.module.js'));
await add('/vendor/three.core.js',path.join(root,'node_modules/three/build/three.core.js'));
await add('/vendor/room-environment.js',path.join(root,'node_modules/three/examples/jsm/environments/RoomEnvironment.js'));
await add('/vendor/rapier.js',path.join(root,'node_modules/@dimforge/rapier3d-compat/rapier.mjs'));
const random=await fs.readFile(path.resolve(await fs.realpath(path.join(root,'node_modules/cubing')),'../random-uint-below/dist/esm/index.js'),'utf8');
assets['/vendor/random.js']={type:'text/javascript',body:random};
await fs.writeFile(path.join(root,'vendor-random.js'),random);
const cubing=path.join(root,'node_modules/cubing/dist/lib/cubing');
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(item.name.endsWith('.js'))await add('/vendor/cubing/'+path.relative(cubing,file).replaceAll('\\','/'),file,undefined,s=>s.replaceAll('"random-uint-below"','"/vendor/random.js"'));}}
await walk(cubing);
// Version application modules together so browser caches cannot mix protocol releases.
const version=createHash('sha256').update(Object.entries(assets).filter(([url])=>!url.startsWith('/vendor/')).map(([url,a])=>url+a.body).join('')).digest('hex').slice(0,12);
for(const [url,asset]of Object.entries(assets))if(!url.startsWith('/vendor/')&&(url.endsWith('.js')||url.endsWith('.html')))asset.body=asset.body.replace(/(["'])\/(app\.js|style\.css|transport\.js|scramble-client\.js|rules\.js|competition\.js|runtime-config\.js|admin\.js)(["'])/g,(_,quote,name,end)=>quote+'/'+name+'?v='+version+end);
await fs.writeFile(path.join(root,'assets.generated.mjs'),'export default '+JSON.stringify(assets)+';');
await fs.mkdir(path.join(root,'dist/server'),{recursive:true});await fs.mkdir(path.join(root,'dist/.openai'),{recursive:true});
await build({absWorkingDir:root,tsconfigRaw:{},entryPoints:['worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await fs.mkdir('dist/relay',{recursive:true});
await build({absWorkingDir:root,tsconfigRaw:{},entryPoints:['relay-worker.js'],outfile:'dist/relay/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log('Built Worker and',Object.keys(assets).length,'assets');

