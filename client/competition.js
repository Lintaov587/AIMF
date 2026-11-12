import {API_BASE} from '/runtime-config.js';
export const MODE_NAMES={traditional:'传统比赛组',full:'完全计时组'};
export const SUBMISSION_EMAIL='lintaov587@outlook.com';
const STORAGE='cube-personal-results-v1';
export function timeLabel(ms){const seconds=ms/1000;return seconds<60?seconds.toFixed(2)+' 秒':Math.floor(seconds/60)+':'+(seconds%60).toFixed(2).padStart(5,'0');}
export function localResults(){const raw=localStorage.getItem(STORAGE);if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('本地榜数据格式无效');return rows;}
export function saveLocalResult(result){
 const rows=[...localResults(),{...result,id:crypto.randomUUID(),name:'本机成绩',local:true,updatedAt:Date.now()}];
 const kept=Object.keys(MODE_NAMES).flatMap(mode=>rows.filter(r=>r.mode===mode).sort((a,b)=>a.elapsedMs-b.elapsedMs||a.updatedAt-b.updatedAt).slice(0,20));
 localStorage.setItem(STORAGE,JSON.stringify(kept));return rows.at(-1);
}
export function rankedRows(shared,local,mode){return [...shared[mode],...local.filter(r=>r.mode===mode)].sort((a,b)=>a.elapsedMs-b.elapsedMs||a.updatedAt-b.updatedAt).slice(0,20);}
export async function sharedResults(){const response=await fetch(API_BASE+'/api/leaderboards');if(!response.ok)throw Error('在线榜单读取失败');return response.json();}
export function submissionLink(result){const body=`组别：${MODE_NAMES[result.mode]}\n耗时：${timeLabel(result.elapsedMs)}\n步数：${result.moves}\n\n请填写挑战者 / 模型名称，并附上从开始前到完整还原的连续完整录屏文件。`;
 return 'mailto:'+SUBMISSION_EMAIL+'?subject='+encodeURIComponent('CUBE 共享挑战榜 · '+MODE_NAMES[result.mode])+'&body='+encodeURIComponent(body);
}
