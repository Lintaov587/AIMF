const fail=message=>{throw Error(message);};
function publicState(s){
 if(!s||!Array.isArray(s.visibleFaces)||!Array.isArray(s.stickers)||s.stickers.length>27)fail('状态无效');
 if(!['waiting','inspection','playing','finished'].includes(s.phase)||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0)fail('会话状态版本已更新，请刷新页面');
 if(!['traditional','full'].includes(s.mode))fail('会话组别版本已更新，请刷新页面');
 return {mode:s.mode,revision:Number.isSafeInteger(s.revision)?s.revision:0,phase:s.phase,elapsedMs:s.elapsedMs,front:s.front,visibleFaces:s.visibleFaces,busy:!!s.busy,moves:s.moves,solved:!!s.solved,stickers:s.stickers.filter(t=>t.visible&&s.visibleFaces.includes(t.face)).map(t=>({id:t.id,color:t.color,position:t.position,face:t.face,visible:true,center:!!t.center,pushDirections:['up','down','left','right']}))};
}
const sessionProperty={type:'string',description:'页面右上角 AI 连接中复制的会话码。仅用于该局，不得猜测或枚举。'};
const faceProperty={type:'string',enum:['R','L','U','D','F','B']};
const tool=(name,description,properties={},required=[])=>({name,description,inputSchema:{type:'object',properties:{session:sessionProperty,...properties},required:['session',...required],additionalProperties:false}});
const tools=[
 tool('cube_start','开始或重新开始：重新打乱并清零成绩。组别由网页选择；传统比赛组首次拧动后计时，完全计时组打乱后计时。还原后停表。'),
 tool('cube_observe','观察指定会话当前可见贴片，不包含背面、打乱序列或历史。必须自行推理还原，禁止调用外部求解器或编写、运行求解器代码。'),
 tool('cube_face','将当前可见面转到正面。',{face:faceProperty},['face']),
 tool('cube_turn','旋转当前可见面；从面外侧看顺逆时针。',{face:faceProperty,clockwise:{type:'boolean'}},['face','clockwise']),
 tool('cube_push','推动可见贴片所在层。',{sticker:{type:'string'},direction:{type:'string',enum:['up','down','left','right']}},['sticker','direction']),
 tool('cube_sequence',"连续执行最多32个空格分隔的动作。例如 R U R' U'；支持R2半转、@U将可见U面转到正面。执行前预检整组可见性。",{sequence:{type:'string',maxLength:200}},['sequence']),
];
function validateAction(type,a){
 if(!['start','face','turn','push','sequence'].includes(type))fail('不支持的操作');
 if(['face','turn'].includes(type)&&!faceProperty.enum.includes(a.face))fail('无效面');
 if(type==='turn'&&typeof a.clockwise!=='boolean')fail('需要 clockwise 布尔值');
 if(type==='push'&&(typeof a.sticker!=='string'||!['up','down','left','right'].includes(a.direction)))fail('无效推动指令');
 if(type==='sequence'&&(typeof a.sequence!=='string'||a.sequence.length>200||a.sequence.trim().split(/\s+/).length>32||!/^(@[RLUDFB]|[RLUDFB][2']?)(\s+(@[RLUDFB]|[RLUDFB][2']?))*$/.test(a.sequence.trim())))fail('无效连续动作');
}

export {publicState,tools,validateAction};
