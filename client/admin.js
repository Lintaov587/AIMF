import {timeLabel} from '/competition.js';
const $=id=>document.getElementById(id);let rows=[],mode='traditional',editing=null;
async function request(path,method='GET',data){
 const response=await fetch('/api/admin/leaderboards'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const value=await response.json();if(!response.ok){if(response.status===401)$('admin-signin').hidden=false;throw Error(value.error);}return value;
}
function resetForm(){editing=null;$('entry-form').reset();$('entry-save').textContent='添加成绩';$('entry-cancel').hidden=true;}
function render(){
 document.querySelectorAll('[data-admin-mode]').forEach(b=>b.classList.toggle('active',b.dataset.adminMode===mode));$('admin-rows').replaceChildren();
 for(const [i,row]of rows.filter(r=>r.mode===mode).entries()){
 const tr=document.createElement('tr');for(const value of [i+1,row.name,timeLabel(row.elapsedMs),row.moves]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}
 const actions=document.createElement('td'),edit=document.createElement('button'),remove=document.createElement('button');edit.textContent='编辑';remove.textContent='删除';
 edit.onclick=()=>{editing=row.id;$('entry-name').value=row.name;$('entry-time').value=row.elapsedMs/1000;$('entry-moves').value=row.moves;$('entry-save').textContent='保存修改';$('entry-cancel').hidden=false;$('entry-name').focus();};
 remove.onclick=async()=>{remove.disabled=true;try{await request('/'+row.id,'DELETE');if(editing===row.id)resetForm();await load();}catch(error){$('admin-status').textContent=error.message;remove.disabled=false;}};
 actions.append(edit,remove);tr.appendChild(actions);$('admin-rows').appendChild(tr);
 }
}
async function load(){const data=await request('');rows=data.entries;$('admin-content').hidden=false;$('admin-signin').hidden=true;$('admin-status').textContent='';render();}
document.querySelectorAll('[data-admin-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.adminMode;resetForm();render();});$('entry-cancel').onclick=resetForm;
$('entry-form').onsubmit=async e=>{e.preventDefault();$('entry-save').disabled=true;try{
 await request(editing?'/'+editing:'',editing?'PUT':'POST',{mode,name:$('entry-name').value,elapsedMs:Math.round(Number($('entry-time').value)*1000),moves:Number($('entry-moves').value)});resetForm();await load();
 }catch(error){$('admin-status').textContent=error.message;}finally{$('entry-save').disabled=false;}};
load().catch(error=>$('admin-status').textContent=error.message);
