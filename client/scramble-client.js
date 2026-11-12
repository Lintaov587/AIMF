import {randomScrambleForEvent} from '/vendor/cubing/scramble/index.js';
import {puzzles} from '/vendor/cubing/puzzles/index.js';
import {setSearchDebug} from '/vendor/cubing/search/index.js';
setSearchDebug({logPerf:false,scramblePrefetchLevel:'none'});
const fingerprint=p=>JSON.stringify(['EDGES','CORNERS'].map(orbit=>[p.patternData[orbit].pieces,p.patternData[orbit].orientation]));
let filter;
async function distanceFilter(){
 if(!filter){const puzzle=await puzzles['3x3x3'].kpuzzle(),solved=puzzle.defaultPattern();
 const near=new Set([fingerprint(solved)]);
 for(const face of 'RLUDFB')for(const suffix of ['',"'",'2'])near.add(fingerprint(solved.applyAlg(face+suffix)));
 filter={solved,near};}
 return filter;
}
export async function generateScramble(){
 const {solved,near}=await distanceFilter();
 for(;;){const alg=await randomScrambleForEvent('333');
 const sequence=alg.toString();if(!/^[RLUDFB][2']?(?:\s+[RLUDFB][2']?)*$/.test(sequence))throw Error('随机状态打乱格式无效');
 if(!near.has(fingerprint(solved.applyAlg(alg))))return sequence;
 }
}
