import * as THREE from 'three';
import {RoomEnvironment} from '/vendor/room-environment.js';
import RAPIER from '/vendor/rapier.js';
import {generateScramble} from '/scramble-client.js';
import {createLink} from '/transport.js';
import {MODE_NAMES,timeLabel,localResults,saveLocalResult,rankedRows,sharedResults,submissionLink} from '/competition.js';
let mode='full',runId='',boardMode='full';
let link=null,initialized=false,revision=0;
const $=id=>document.getElementById(id), V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const axes={R:V(1,0,0),L:V(-1,0,0),U:V(0,1,0),D:V(0,-1,0),F:V(0,0,1),B:V(0,0,-1)};
const colors={R:'#e47550',L:'#edb95e',U:'#eeeede',D:'#e9cf62',F:'#7caa84',B:'#719db7'},names={R:'右',L:'左',U:'上',D:'下',F:'前',B:'后'};
let busy=false,turnAnimation=null,front='F',moves=0,history=[],undoStack=[],started=0,finished=0,phase='waiting',connected=false;
let cubies=[],stickers=[],hover=null,down=null;const initialCameraPosition=V(5,3.8,7.5),pointer=new THREE.Vector2();
const scene=new THREE.Scene();scene.background=new THREE.Color('#f7f7f4');scene.fog=new THREE.Fog('#f7f7f4',17,35);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#f7f7f4');$('viewport').appendChild(renderer.domElement);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const camera=new THREE.PerspectiveCamera(44,1,.1,100);camera.position.copy(initialCameraPosition);camera.lookAt(0,0,0);
const cubeRoot=new THREE.Group();scene.add(cubeRoot);
const cubeBase=new THREE.Quaternion(),cubeGoal=new THREE.Quaternion();
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.65;
scene.add(new THREE.HemisphereLight('#ffffff','#d5d8d6',1.1));
const key=new THREE.DirectionalLight('#fff9ef',2.6);key.position.set(-4,8,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.camera.near=.5;key.shadow.camera.far=25;key.shadow.normalBias=.018;key.shadow.bias=-.0001;key.shadow.radius=10;key.shadow.blurSamples=16;scene.add(key);
const fill=new THREE.DirectionalLight('#e5efff',.7);fill.position.set(6,3,-2);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#f7f7f4',roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.95;floor.receiveShadow=true;scene.add(floor);
let world;
const bodyMaterial=new THREE.MeshPhysicalMaterial({color:'#222a2c',roughness:.34,metalness:0,clearcoat:.25,clearcoatRoughness:.3});
// Rounded solid geometry: bevels are part of the 3D mesh, not a painted cube.
function roundedBox(size,r){const s=new THREE.Shape(),h=size/2;s.moveTo(-h+r,-h);s.lineTo(h-r,-h);s.quadraticCurveTo(h,-h,h,-h+r);s.lineTo(h,h-r);s.quadraticCurveTo(h,h,h-r,h);s.lineTo(-h+r,h);s.quadraticCurveTo(-h,h,-h,h-r);s.lineTo(-h,-h+r);s.quadraticCurveTo(-h,-h,-h+r,-h);const g=new THREE.ExtrudeGeometry(s,{depth:size-2*r,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r/2,bevelThickness:r,curveSegments:5});g.translate(0,0,-(size-2*r)/2);return g;}
const blockGeo=roundedBox(.90,.055),tileGeo=roundedBox(.76,.035);tileGeo.scale(1,1,.025);
function createCube(){
 for(const c of cubies){cubeRoot.remove(c.mesh);world.removeRigidBody(c.body);}cubies=[];stickers=[];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
 if(!x&&!y&&!z)continue;const mesh=new THREE.Group();mesh.position.set(x,y,z);
 const block=new THREE.Mesh(blockGeo,bodyMaterial);block.castShadow=true;block.receiveShadow=true;mesh.add(block);
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x,y,z));world.createCollider(RAPIER.ColliderDesc.cuboid(.465,.465,.465).setFriction(.7),body);
 const c={id:`${x+1}${y+1}${z+1}`,mesh,body};cubies.push(c);cubeRoot.add(mesh);
 for(const [face,n]of Object.entries(axes))if(V(x,y,z).dot(n)===1){const tile=new THREE.Mesh(tileGeo,new THREE.MeshPhysicalMaterial({color:colors[face],roughness:.3,metalness:0,clearcoat:.55,clearcoatRoughness:.22}));tile.position.copy(n).multiplyScalar(.477);tile.quaternion.setFromUnitVectors(V(0,0,1),n);tile.castShadow=true;tile.userData={cubie:c,normal:n.clone(),color:face,id:crypto.randomUUID()};mesh.add(tile);stickers.push(tile);}
 }
}
const ray=new THREE.Raycaster();function pick(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(stickers,false)[0]?.object;}
function normal(tile){return tile.userData.normal.clone().applyQuaternion(tile.userData.cubie.mesh.quaternion).round();}
function faceFor(n){return Object.keys(axes).find(f=>axes[f].dot(n)>.99);}
function visible(){return Object.keys(axes).filter(f=>axes[f].clone().applyQuaternion(cubeRoot.quaternion).dot(camera.position.clone().normalize())>.12);}
function center(tile){return tile.userData.cubie.mesh.position.clone().cross(normal(tile)).length()<.1;}
function screenVector(v){v=v.clone().applyQuaternion(cubeRoot.quaternion);return new THREE.Vector2(v.dot(V(1,0,0).applyQuaternion(camera.quaternion)),v.dot(V(0,1,0).applyQuaternion(camera.quaternion)));}
function pushMove(tile,direction){
 const n=normal(tile),wanted={up:new THREE.Vector2(0,1),down:new THREE.Vector2(0,-1),left:new THREE.Vector2(-1,0),right:new THREE.Vector2(1,0)}[direction];if(!wanted)throw Error('无效推动方向');
 const tangents=[V(1,0,0),V(-1,0,0),V(0,1,0),V(0,-1,0),V(0,0,1),V(0,0,-1)].filter(v=>Math.abs(v.dot(n))<.1);
 const tangent=tangents.sort((a,b)=>screenVector(b).normalize().dot(wanted)-screenVector(a).normalize().dot(wanted))[0];const rotationAxis=n.clone().cross(tangent).round();const axis=['x','y','z'].find(k=>Math.abs(rotationAxis[k])>.5);return {axis,layer:Math.round(tile.userData.cubie.mesh.position[axis]),sign:rotationAxis[axis]};
}
function solved(){return Object.values(axes).every(n=>new Set(stickers.filter(t=>normal(t).dot(n)>.99).map(t=>t.userData.color)).size===1);}
function snapshot(){const visibleFaces=visible();return {revision,phase,mode,elapsedMs:started?Math.max(0,(finished||performance.now())-started):0,front,visibleFaces,busy,moves,solved:phase==='finished'&&solved(),stickers:stickers.filter(t=>visibleFaces.includes(faceFor(normal(t)))).map(t=>({id:t.userData.id,color:t.userData.color,position:t.userData.cubie.mesh.position.toArray().map(Math.round),face:faceFor(normal(t)),visible:true,center:center(t),pushDirections:['up','down','left','right']}))};}
async function sync(id,result){try{await link?.sync(id,result);}catch{connectionStatus('服务断开',false);}}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600);}
function connectionStatus(label,ready){$('connection').textContent=label;$('mcp').title=label+' · AI 连接';$('connection-dot').classList.toggle('ready',ready);}
function renderTimer(now=performance.now()){
 const seconds=started?Math.floor(((finished||now)-started)/1000):0;
 $('time').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
function finishIfSolved(){if(phase==='playing'&&solved()){finished=performance.now();phase='finished';renderTimer();completeResult();}}
function ui(){
 document.body.classList.toggle('busy',busy);$('viewport').setAttribute('aria-busy',String(busy));
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=busy;});
 $('moves').textContent=String(moves).padStart(2,'0');$('solved').textContent=({waiting:'等待 AI 开始',inspection:'准备中 · 首次拧动后计时',playing:'还原中',finished:'已还原'})[phase];
}
async function rotate(move,actor='HUMAN',record=true,track=true){
 if(track){if(phase==='inspection'){started=performance.now();phase='playing';}$('activity').textContent=move.label??'';}const selected=cubies.filter(c=>Math.round(c.mesh.position[move.axis])===move.layer);const unit=V();unit[move.axis]=1;
 await new Promise(resolve=>{turnAnimation={start:performance.now(),selected: selected.map(c=>({c,p:c.mesh.position.clone(),q:c.mesh.quaternion.clone()})),unit,angle:move.sign*(move.turns??1)*Math.PI/2,resolve};});
 if(track){finishIfSolved();moves++;if(record)undoStack.push({...move});history.unshift({index:history.length+1,label:move.label??`${move.axis.toUpperCase()}${move.layer} ${move.sign>0?'↶':'↷'}`,actor});ui();}
}
async function faceView(face){
 if(!visible().includes(face))throw Error('只能切换到当前可见面的中心');
 if(face===front)return;
 // Move the selected face into the current front slot with one local quarter-turn.
 const quarterTurn=new THREE.Quaternion().setFromUnitVectors(axes[face],axes[front]);
 cubeBase.multiply(quarterTurn).normalize();cubeGoal.copy(cubeBase);front=face;
 await new Promise(resolve=>setTimeout(resolve,380));
}
async function action(command,actor='HUMAN'){
 if(busy)throw Error('请等待当前操作完成');
 if(['turn','push','sequence','undo'].includes(command.type)&&!['inspection','playing'].includes(phase))throw Error(phase==='waiting'?'请由 AI 发送开始指令':'本局已完成');
 busy=true;revision++;ui();
 try{
 if(command.type==='sequence'){
 if(typeof command.sequence!=='string')throw Error('需要 sequence 字符串');
 const tokens=command.sequence.trim().split(/\s+/);
 if(tokens.length>32||tokens.some(t=>!/^(@[RLUDFB]|[RLUDFB][2']?)$/.test(t)))throw Error("指令需为 1–32 个空格分隔的词，支持 R、R′（使用英文 '）、R2、@U");
 // Preflight the full plan before moving; visibility follows planned whole-cube turns.
 const orientation=cubeBase.clone();let plannedFront=front;
 for(const token of tokens){const face=token.startsWith('@')?token[1]:token[0];
 if(axes[face].clone().applyQuaternion(orientation).dot(camera.position.clone().normalize())<=.12)throw Error(`指令 ${token} 操作了不可见面，请先用 @面 换面`);
 if(token.startsWith('@')){orientation.multiply(new THREE.Quaternion().setFromUnitVectors(axes[face],axes[plannedFront])).normalize();plannedFront=face;}
 }
 for(const token of tokens){
 if(token.startsWith('@')){await faceView(token[1]);continue;}
 const n=axes[token[0]],axis=['x','y','z'].find(k=>n[k]);
 await rotate({axis,layer:n[axis],sign:(token.endsWith("'")?1:-1)*n[axis],turns:token.endsWith('2')?2:1,label:token},actor);
 if(phase==='finished')break;
 }
 }
 else if(command.type==='face'){if(!axes[command.face])throw Error('无效面');await faceView(command.face);}
 else if(command.type==='turn'){if(!visible().includes(command.face))throw Error('只能旋转当前可见面');if(typeof command.clockwise!=='boolean')throw Error('需要 clockwise 布尔值');const n=axes[command.face],axis=['x','y','z'].find(k=>n[k]);await rotate({axis,layer:n[axis],sign:(command.clockwise?-1:1)*n[axis],label:command.face+(command.clockwise?'':"′")},actor);}
 else if(command.type==='push'){const tile=stickers.find(t=>t.userData.id===command.sticker);if(!tile||!visible().includes(faceFor(normal(tile))))throw Error('贴片不在可见面');await rotate({...pushMove(tile,command.direction),label:({up:'↑',down:'↓',left:'←',right:'→'})[command.direction]+' 推动'},actor);}
 else if(command.type==='start'){
 $('activity').textContent='打乱中';
 const data={algorithm:await generateScramble()};
 createCube();hover=null;down=null;
 for(const token of data.algorithm.trim().split(/\s+/)){
 const n=axes[token[0]],axis=['x','y','z'].find(k=>n[k]);
 const q=new THREE.Quaternion().setFromAxisAngle(n,(token.endsWith('2')?2:token.endsWith("'")?1:-1)*Math.PI/2);
 for(const c of cubies.filter(c=>Math.round(c.mesh.position[axis])===n[axis])){c.mesh.position.applyQuaternion(q).round();c.mesh.quaternion.premultiply(q).normalize();}
 }
 for(const c of cubies){c.body.setTranslation(c.mesh.position,true);c.body.setRotation(c.mesh.quaternion,true);c.body.setNextKinematicTranslation(c.mesh.position);c.body.setNextKinematicRotation(c.mesh.quaternion);}
 data.algorithm=null;runId=crypto.randomUUID();moves=0;history=[];undoStack=[];finished=0;started=mode==='full'?performance.now():0;phase=mode==='full'?'playing':'inspection';renderTimer();
 }
 else if(command.type==='undo'){const move=undoStack.pop();if(move)await rotate({...move,sign:-move.sign,label:'撤回 '+(move.label??'推动')},actor,false);}
 else if(command.type==='reset'){createCube();moves=0;history=[];undoStack=[];started=0;finished=0;phase='waiting';renderTimer();}
 else throw Error('未知操作');
 }finally{busy=false;revision++;$('activity').textContent='';ui();await sync();}return snapshot();
}
function run(c){action(c).catch(e=>toast(e.message));}
renderer.domElement.addEventListener('pointermove',e=>{
 hover=pick(e);renderer.domElement.style.cursor=hover?(center(hover)?'pointer':'grab'):'default';
 if(!down&&!busy){cubeGoal.copy(cubeBase);const r=renderer.domElement.getBoundingClientRect();
 const px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;
 if(Math.abs(px)>.12||Math.abs(py)>.12){
 const right=V(1,0,0).applyQuaternion(camera.quaternion),up=V(0,1,0).applyQuaternion(camera.quaternion);
 const tilt=new THREE.Quaternion().setFromAxisAngle(up,px*.35).multiply(new THREE.Quaternion().setFromAxisAngle(right,py*.28));
 cubeGoal.copy(tilt).multiply(cubeBase);
 }}
});
renderer.domElement.addEventListener('pointerleave',()=>{cubeGoal.copy(cubeBase);hover=null;});
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||busy||!initialized||!['inspection','playing'].includes(phase))return;const tile=pick(e);if(tile){down={tile,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointerup',e=>{if(!down)return;const {tile,x,y}=down;down=null;const dx=e.clientX-x,dy=e.clientY-y;if(Math.hypot(dx,dy)<8&&center(tile)){run({type:'face',face:faceFor(normal(tile))});return;}const direction=Math.hypot(dx,dy)>=8?(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')):(e.shiftKey?'left':'right');run({type:'push',sticker:tile.userData.id,direction});});
renderer.domElement.addEventListener('pointercancel',()=>down=null);
$('config').textContent='正在连接…';
function bindDialog(dialog,trigger,close){
 let returnFocus=trigger;
 trigger.onclick=()=>{returnFocus=document.activeElement;dialog.showModal();};close.onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>returnFocus?.focus({preventScroll:true}));
}
bindDialog($('dialog'),$('mcp'),$('close'));bindDialog($('help-dialog'),$('help'),$('help-close'));
bindDialog($('leaderboard-dialog'),$('leaderboard-open'),$('leaderboard-close'));
$('leaderboard-open').addEventListener('click',()=>{boardMode=mode;renderLeaderboard();});
$('result-close').onclick=()=>$('result-dialog').close();
$('result-dialog').addEventListener('click',e=>{if(e.target!==$('result-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
$('copy').onclick=()=>navigator.clipboard.writeText(link?.copyText??'').then(()=>toast('已复制')).catch(()=>toast('请选中配置复制'));
document.addEventListener('keydown',e=>{
 if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(document.querySelector('dialog[open]'))return;
 const key=e.key.toLowerCase();
  if(key==='h'){e.preventDefault();$('help').click();return;}
});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=async()=>{
 if(busy||mode===button.dataset.mode)return;mode=button.dataset.mode;phase='waiting';started=0;finished=0;moves=0;revision++;runId='';renderTimer();ui();if(link)$('config').textContent=link.copyText;await sync();
});
document.querySelectorAll('[data-board-mode]').forEach(button=>button.onclick=()=>{boardMode=button.dataset.boardMode;renderLeaderboard();});
async function renderLeaderboard(){
 const selected=boardMode;document.querySelectorAll('[data-board-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.boardMode===selected);b.setAttribute('aria-pressed',String(b.dataset.boardMode===selected));});
 $('leaderboard-status').textContent='读取在线成绩…';$('leaderboard-rows').replaceChildren();
 try{const shared=await sharedResults();if(selected!==boardMode)return;const rows=rankedRows(shared,localResults(),selected);$('leaderboard-status').textContent=rows.length?'':'尚无审核成绩';
 for(const [i,row]of rows.entries()){const tr=document.createElement('tr');for(const value of [String(i+1),row.local?'本机 · '+row.name:row.name,timeLabel(row.elapsedMs),String(row.moves)]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}if(row.local)tr.className='local-score';$('leaderboard-rows').appendChild(tr);}
 }catch(error){if(selected===boardMode)$('leaderboard-status').textContent=error.message;}
}
async function completeResult(){
 const result={mode,elapsedMs:Math.round(finished-started),moves:moves+1,runId};
 $('result-title').textContent='完成还原';$('result-time').textContent=timeLabel(result.elapsedMs);$('result-message').textContent='正在核对在线排名…';$('submit-score').hidden=true;
 let saved;try{saved=saveLocalResult(result);}catch(error){$('result-message').textContent='本地成绩未保存：'+error.message;}
 // Let any already-open instructions finish without stacking dialogs.
 const openDialog=document.querySelector('dialog[open]');if(!openDialog)$('result-dialog').showModal();else{openDialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))$('result-dialog').showModal();},{once:true});toast('已完成 · '+timeLabel(result.elapsedMs));}
 if(!saved)return;
 try{const shared=await sharedResults();const rank=rankedRows(shared,localResults(),result.mode).findIndex(r=>r.id===saved.id)+1;
 if(rank){$('result-title').textContent='本地上榜 · 第 '+rank+' 名';$('result-message').textContent=MODE_NAMES[result.mode]+'。请将包含从开始前到完整还原的完整录屏文件发送到 lintaov587@outlook.com，申请参加共享挑战榜。';$('submit-score').href=submissionLink(result);$('submit-score').hidden=false;}
 else $('result-message').textContent=MODE_NAMES[result.mode]+' · 已在本机保存，尚未进入前 20。';
 }catch(error){$('result-message').textContent='成绩已在本机保存。'+error.message;}
}
let viewportHeight=1;
const hudCorners=[];for(const x of [-1.52,1.52])for(const y of [-1.52,1.52])for(const z of [-1.52,1.52])hudCorners.push(V(x,y,z));
function positionHud(){let top=-Infinity;for(const p of hudCorners)top=Math.max(top,p.clone().applyQuaternion(cubeRoot.quaternion).project(camera).y);const hudTop=Math.max(140,(1-top)*viewportHeight/2-95);$('hud').style.top=hudTop+'px';document.querySelector('.mode-switch').style.top=(hudTop-49)+'px';}
function resize(){const r=$('viewport').getBoundingClientRect();viewportHeight=r.height;renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe($('viewport'));
try{
 await RAPIER.init();world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;createCube();ui();
 $('activity').textContent='正在连接';
 // Start rendering before awaiting worker-based generation.
 bootSession();
 async function bootSession(){try{
 $('activity').textContent='';
 link=await createLink({snapshot,execute:c=>action(c,'AI'),status:connectionStatus});
 $('config').textContent=link.copyText;$('mcp').addEventListener('click',async()=>{$('copy').disabled=true;try{await link.connect();$('config').textContent=link.copyText;}catch(error){$('config').textContent=error.message;}finally{$('copy').disabled=!link.copyText;}});initialized=true;document.body.classList.remove('initializing');ui();$('help-dialog').showModal();
 if(link.remote){$('connect-title').textContent='让 AI 还原这一局';$('dialog').querySelector('p').textContent='复制后发给支持 HTTP 请求的 AI，连接这一局。';$('copy').textContent='复制全部';
 const revoke=document.createElement('button');revoke.textContent='撤销 AI 连接';revoke.className='secondary';revoke.onclick=async()=>{if(busy)return;try{await link.revoke();$('config').textContent=link.copyText;toast('旧会话码已失效');}catch(e){toast(e.message);}};$('dialog').appendChild(revoke);
 }
 }catch(error){$('activity').textContent='';$('hint').textContent=error.message;connectionStatus('连接失败',false);}}

 let last=performance.now(),acc=0;
 function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;acc+=dt;
 if(turnAnimation){const a=turnAnimation,t=Math.min((now-a.start)/250,1),ease=t*t*(3-2*t),q=new THREE.Quaternion().setFromAxisAngle(a.unit,a.angle*ease);for(const {c,p,q:base}of a.selected){c.body.setNextKinematicTranslation(p.clone().applyQuaternion(q));c.body.setNextKinematicRotation(q.clone().multiply(base));}if(t===1){for(const {c,p,q:base}of a.selected){const pos=p.clone().applyQuaternion(q).round(),rot=q.clone().multiply(base).normalize();c.body.setTranslation(pos,true);c.body.setRotation(rot,true);c.body.setNextKinematicTranslation(pos);c.body.setNextKinematicRotation(rot);c.mesh.position.copy(pos);c.mesh.quaternion.copy(rot);}turnAnimation=null;a.resolve();}}
 while(acc>=1/60){world.step();acc-=1/60;}for(const c of cubies){c.mesh.position.copy(c.body.translation());c.mesh.quaternion.copy(c.body.rotation());}
 for(const t of stickers)t.material.emissive.set(t===hover?'#26321c':'#000000');cubeRoot.quaternion.slerp(cubeGoal,1-Math.exp(-dt*9));renderer.render(scene,camera);positionHud();
 renderTimer(now);
 }requestAnimationFrame(frame);
}catch(error){$('hint').textContent='引擎启动失败：'+error.message;connectionStatus('启动失败',false);console.error(error);}
