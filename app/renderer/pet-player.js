/* Desk Phonograph player. One song = one record in one sleeve, whether it came from
   this computer or from a web link. The needle / scratch / seek / speed mechanics are
   carried over unchanged from the Vinyl Sim player (player.js); what is new is the
   loading: the song is decoded whole into memory (so a scratch can run anywhere in it),
   its record is sized from its length (vinyl-core parameters()); its groove look is a
   cheap fake drawn by the vinyl shader over that span. The library of sleeves lives on disk (main process). */
(() => {
'use strict';
const D=window.desk,Core=window.VinylCore,Tags=window.VinylTags;
let record=null, ctx=null, buffer=null, reverseBuffer=null, source=null, gain=null, panner=null, down=false;
let position=0, audioAnchor=0, rpm=45, busy=false, vol=.8, muted=false;
let lastGrabAngle=0, lastGrabTime=0, scratchUsingReverse=false, scratchStart=0, scratchAbsRate=0;
const SCRATCH_SETTLE_MS=350; let lastScratchMotion=-1e9;
const state={angle:Math.PI*.2,rotation:0,dragging:false,grabbed:false};
function say(text,kind){window.petShell?.say(text,kind);}
function renderStatus(){window.petShell?.playState?.();}
function duration(){return record?.metadata.duration_sec||0;}
function clampTime(t){return Math.max(0,Math.min(duration()-.005,t));}
function time(){
 if(!record)return 0;
 if(state.grabbed)return position;
 return Math.min(duration(),position+(down&&ctx?(ctx.currentTime-audioAnchor)*rpm/record.metadata.rpm_cut:0));
}
function silence(){if(source){source.onended=null;try{source.stop();}catch{}source=null;}scratchAbsRate=0;}
function lift(){position=time();silence();down=false;state.grabbed=false;state.dragging=false;renderStatus();}
async function ensureAudio(resume=true){if(!ctx){
 ctx=new (window.AudioContext||window.webkitAudioContext)();gain=ctx.createGain();gain.gain.value=muted?0:vol;
 panner=ctx.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.rolloffFactor=.5;
 panner.coneInnerAngle=360;panner.coneOuterAngle=360;
 gain.connect(panner);panner.connect(ctx.destination);
 }if(resume)await ctx.resume();}
// Scene vectors are Z-up millimetres; Web Audio is Y-up metres. No tone/EQ stage.
function setListener(position,forward,up,mouth,refDistance){
 if(!ctx)return;
 const scale=.001,listener=ctx.listener;
 const setPosition=(node,v)=>{const x=v.x*scale,y=v.z*scale,z=-v.y*scale;
  if(node.positionX){node.positionX.value=x;node.positionY.value=y;node.positionZ.value=z;}else node.setPosition(x,y,z);};
 setPosition(listener,position);setPosition(panner,mouth);panner.refDistance=refDistance*scale;
 if(listener.forwardX){
  listener.forwardX.value=forward.x;listener.forwardY.value=forward.z;listener.forwardZ.value=-forward.y;
  listener.upX.value=up.x;listener.upY.value=up.z;listener.upZ.value=-up.y;
 }else listener.setOrientation(forward.x,forward.z,-forward.y,up.x,up.z,-up.y);
}
function reversed(){
 if(!reverseBuffer&&buffer){
  reverseBuffer=ctx.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  for(let c=0;c<buffer.numberOfChannels;c++){
   const src=buffer.getChannelData(c),dst=reverseBuffer.getChannelData(c);
   for(let i=0,j=src.length-1;i<src.length;i++,j--)dst[i]=src[j];
  }
 }
 return reverseBuffer;
}
async function drop(t=position){
 if(!record||!buffer||state.grabbed)return; await ensureAudio();silence();
 position=clampTime(t);
 source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rpm/record.metadata.rpm_cut;source.connect(gain);
 audioAnchor=ctx.currentTime;down=true;source.start(0,position);
 source.onended=()=>{if(state.grabbed)return;position=duration();down=false;source=null;renderStatus();if(record)finished(true);};renderStatus();
}
function scratchVoice(rate){
 if(!record||!buffer||!ctx)return;
 if(Math.abs(rate)<0.04){silence();return;}
 const wantRev=rate<0, abs=Math.min(8,Math.abs(rate));
 const predicted=source?scratchStart+(scratchUsingReverse?-1:1)*scratchAbsRate*(ctx.currentTime-audioAnchor):position;
 if(source&&scratchUsingReverse===wantRev&&Math.abs(predicted-position)<0.045){
  scratchAbsRate=abs;source.playbackRate.value=abs;return;
 }
 silence();
 scratchUsingReverse=wantRev;scratchAbsRate=abs;scratchStart=position;
 source=ctx.createBufferSource();
 source.buffer=wantRev?reversed():buffer;
 source.playbackRate.value=abs;source.connect(gain);
 const off=wantRev?Math.max(0,duration()-position):position;
 audioAnchor=ctx.currentTime;
 try{source.start(0,Math.min(off,Math.max(0,source.buffer.duration-.01)));}catch{source=null;return;}
 source.onended=()=>{source=null;};
}
function seekToXY(x,y){
 const m=record.metadata,r=Math.hypot(x,y);
 if(r>m.r_start_mm+1||r<m.label_radius_mm)return false;
 const angle=Math.atan2(y,x)-state.rotation,phi=((-angle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 const k=Math.round((m.r_start_mm-r)/m.pitch_mm-phi/(2*Math.PI));
 const t=(k+phi/(2*Math.PI)-m.lead_in_turns)*60/m.rpm_cut;
 position=clampTime(t);state.angle=Math.atan2(y,x);return true;
}
function wrapAngle(d){while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;}
function grabStart(x,y){
 if(!record)return;
 const r=Math.hypot(x,y),m=record.metadata;
 if(r>m.disc_radius_mm+1)return;
 const wasPlaying=down;position=time();silence();ensureAudio();

 if(!down)seekToXY(x,y);
 down=true;state.grabbed=true;state.dragging=true;
 lastGrabAngle=Math.atan2(y,x);lastGrabTime=performance.now();scratchAbsRate=0;lastScratchMotion=wasPlaying?lastGrabTime:-1e9; // catching a spinning record reads as a scratch
 renderStatus();
}
function grabMove(x,y){
 if(!record||!state.grabbed)return;
 const now=performance.now(),ang=Math.atan2(y,x);
 const dth=wrapAngle(ang-lastGrabAngle);
 const realDt=Math.max((now-lastGrabTime)/1000,1e-4);
 lastGrabAngle=ang;lastGrabTime=now;
 const dt=dth/(Math.PI*2)*60/record.metadata.rpm_cut;
 position=clampTime(position+dt);
 state.rotation+=dth;
 scratchVoice(dt/realDt);
 if(Math.abs(dth)>1e-3)lastScratchMotion=now; // any real hand movement, even too slow to sound
 renderStatus();
}
function grabTick(){
 if(!state.grabbed)return;
 if(performance.now()-lastGrabTime>50){scratchAbsRate=0;silence();}
}
function grabEnd(){
 if(!record||!state.grabbed)return;
 state.grabbed=false;state.dragging=false;scratchAbsRate=0;
 drop(position).catch(e=>say(e.message,'error'));
}


/* ---------- library ---------- */
const library=new Map();       // id -> entry
let currentId=null,useCounter=0,stackOffset=0,autoNext=true,saveT=0;
/* Next / Previous / Shuffle / Repeat (the order itself is play-order.js). upNext: records asked
   for with "Play next", ahead of everything else. planned: the record Next would bring, picked
   once per record so a shuffled pick is the same one that gets fetched ahead of time. */
const Order=window.PlayOrder;
let shuffle=false,repeat='off',played=[],history=[],upNext=[],planned=null;
const STACK=6,TEMP_CAP=10,MAX_MIN=90,MAX_SEC=MAX_MIN*60;
/* Long ones (over 20 minutes, unknown length, or a big file) are decoded by ffmpeg as mono at a lower
   rate, so even an hour and a half stays well under a gigabyte; anything longer is turned away from its
   length alone, before it is fetched or read. */
const LONG_SEC=20*60,LONG_RATE=32000,BIG_BYTES=250e6;
const TOO_LONG='That one is longer than an hour and a half: too long for a record, sorry.';
const tooLongErr=()=>Object.assign(Error(TOO_LONG),{tooLong:true});
let loadTok=0;
const newId=()=>'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function clock(t){t=Math.max(0,t);const m=Math.floor(t/60),s=Math.floor(t-m*60);return m+':'+(s<10?'0':'')+s;}
function titleOf(e){return e.artist&&e.title?`${e.artist} — ${e.title}`:(e.title||'Record');}
function labelOf(e){
 if(e.state==='fetching')return e.pct>0?`Getting it ready… ${Math.round(e.pct/20)*20}%`:'Getting it ready…';
 if(e.state==='waiting')return `Up next: ${titleOf(e)}`;
 if(e.state==='error')return 'Couldn’t play this one';
 if(e.missing)return `${titleOf(e)} (missing)`;
 return titleOf(e);
}
function factsOf(e){return e.duration?clock(e.duration):'';}
function ordered(){ // what comes next in a list stands at the front, then the most recently played
 const cur=library.get(currentId),q=cur?.queue,nextOf=e=>q&&e.queue===q&&e.qIndex>cur.qIndex;
 return [...library.values()].sort((a,b)=>{const na=nextOf(a),nb=nextOf(b);if(na!==nb)return na?-1:1;if(na)return a.qIndex-b.qIndex;return b.used-a.used||b.added-a.added;});
}
function sleeveOf(e){return {id:e.id,label:labelOf(e),title:e.state==='fetching'||e.state==='waiting'||e.state==='error'?labelOf(e):(e.title||'Record'),artist:e.artist||'',cover:e.cover||null,art:!!e.cover,facts:factsOf(e)};}
function sleeveList(){
 const all=ordered().filter(e=>e.id!==currentId);
 stackOffset=Math.max(0,Math.min(stackOffset,Math.max(0,all.length-STACK)));
 return all.slice(stackOffset,stackOffset+STACK).map(sleeveOf);
}
let emitT=0;
function emitSleeves(){clearTimeout(emitT);emitT=setTimeout(()=>{const cur=currentId&&library.get(currentId);
 window.dispatchEvent(new CustomEvent('vinyl-sleeves',{detail:{current:currentId,count:library.size,sleeves:sleeveList(),currentSleeve:cur?sleeveOf(cur):null}}));},30);}
function persist(){clearTimeout(saveT);saveT=setTimeout(()=>{
 const list=[...library.values()].filter(e=>e.state!=='error'&&!e.tooLong&&(e.kind==='file'||e.file||e.url)).map(e=>({id:e.id,bad:e.bad||undefined,title:e.title,artist:e.artist,kind:e.kind,path:e.kind==='file'?e.path:(e.file||null),url:e.url||null,kept:!!e.kept,duration:e.duration||0,added:e.added,used:e.used,queue:e.queue||null,qIndex:e.qIndex??null,thumbs:e.thumbs||undefined}));
 D.saveLibrary(list);},400);}
function flipStack(dir){const before=stackOffset;stackOffset+=dir>0?1:-1;emitSleeves();const all=library.size-(currentId?1:0);
 if(stackOffset!==before&&all>STACK)say(`Records ${Math.max(1,Math.min(stackOffset,all-STACK)+1)}–${Math.min(all,Math.max(0,Math.min(stackOffset,all-STACK))+STACK)} of ${all}`,'hint');}
let lastAdded=0; // songs added together keep the order they came in (not a random id tie-break)
function add(e){e.id??=newId();e.added??=(lastAdded=Math.max(Date.now(),lastAdded+1));e.used??=++useCounter;library.set(e.id,e);stackOffset=0;emitSleeves();return e;}
// Temporary records (fetched, not kept): only the newest TEMP_CAP stay; the oldest go, files and all.
function trimTemp(){
 const cur=library.get(currentId),protect=new Set([currentId,...queueAfter(cur,2).map(x=>x.id),...upNext,planned].filter(Boolean));
 const have=[...library.values()].filter(e=>e.kind==='link'&&!e.kept&&e.file);
 const victims=have.filter(e=>!protect.has(e.id)&&!fetching.has(e.id)).sort((a,b)=>a.used-b.used);
 for(let i=0;i<have.length-TEMP_CAP&&i<victims.length;i++)forget(victims[i].id,true);
}
async function forget(id,quiet=false){
 const e=library.get(id);if(!e)return;if(id===currentId){say('That one is on the turntable. Play something else first.');return;}
 library.delete(id);e.buffer=null;D.forget(id,e.kind==='link'?e.file:null);emitSleeves();persist();
 if(!quiet)say(`Put “${titleOf(e)}” away.`);
}

/* ---------- decoding ---------- */
async function decodeEntry(e){
 if(e.buffer)return e.buffer;
 if(e.duration>MAX_SEC)throw tooLongErr();
 await ensureAudio(false);
 const file=e.kind==='file'?e.path:e.file;
 const p=await D.duration(file);if(p.error)throw Error(p.error);
 if(p.duration>MAX_SEC)throw tooLongErr();
 if(p.duration)e.duration=p.duration;
 const long=e.bad||!p.duration||p.duration>LONG_SEC||p.size>BIG_BYTES;
 let buf=null,bytes=null;
 if(!long){const r=await D.read(file);if(r.error)throw Error(r.error);bytes=r.bytes;try{buf=await ctx.decodeAudioData(r.bytes.slice(0));}catch{buf=null;}}
 if(!buf){const t=await D.transcode(file,long?{mono:true,rate:LONG_RATE}:{});if(t.error)throw Error(t.error);
  try{buf=await (long?new OfflineAudioContext(1,1,LONG_RATE):ctx).decodeAudioData(t.bytes);}catch{throw Error('That file doesn’t seem to have any sound I can play.');}}
 if(buf.duration<.5)throw Error('That one is too short to make a record of.');
 if(buf.duration>MAX_SEC+.5)throw tooLongErr(); // (the decode stops just past the limit, so this is as far as it gets)
 // long ones are kept in mono so a long mix doesn't fill the computer's memory
 if(buf.duration>LONG_SEC&&buf.numberOfChannels>1){const m=ctx.createBuffer(1,buf.length,buf.sampleRate),o=m.getChannelData(0);
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)o[i]+=d[i]/buf.numberOfChannels;}buf=m;}
 e.duration=buf.duration;e.buffer=buf;
 if(!e.cover&&!e.tagsTried)await tagsFor(e,bytes);
 return buf;
}
// Too long for a record: it goes from the stack (and its fetched sound with it), never saved.
function refuseLong(e){
 e.tooLong=true;e.buffer=null;if(library.get(e.id)===e&&e.id!==currentId){library.delete(e.id);D.forget(e.id,e.kind==='link'?e.file:null);}
 emitSleeves();persist();say(TOO_LONG,'error');
}
async function tagsFor(e,bytes){
 e.tagsTried=true;
 let t={};try{if(bytes)t=Tags.readTags(bytes)||{};}catch{}
 let cover=t.picture?await Tags.normaliseCover(t.picture.bytes,t.picture.mime):null;
 if((!t.title||!cover)&&e.kind==='file'){const p=await D.probe(e.path).catch(()=>({}));t={title:t.title||p.title,artist:t.artist||p.artist,...t};if(!cover&&p.picture)cover=await Tags.normaliseCover(await (await fetch(p.picture)).blob());}
 if(t.title&&e.kind==='file'){e.title=t.title;e.artist=t.artist||'';}
 if(cover){e.cover=cover;D.saveCover(e.id,cover);}
 emitSleeves();persist();
}
// Cover from a picture URL (a link's thumbnail): centre-cropped square, JPEG, 600 px.
// A plain grey 120x90 picture is a site's "no picture here" stand-in, not a cover.
function plainGrey(bmp){
 if(bmp.width!==120||bmp.height!==90)return false;
 const c=document.createElement('canvas');c.width=120;c.height=90;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bmp,0,0);
 const d=g.getImageData(0,0,120,90).data;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-d[i+1])>6||Math.abs(d[i+1]-d[i+2])>6)return false;return true;
}
async function squareCover(dataUrl){
 if(!dataUrl)return null;
 try{const bmp=await createImageBitmap(await (await fetch(dataUrl)).blob());if(!bmp.width||!bmp.height||plainGrey(bmp)){bmp.close?.();return null;}
  const s=Math.min(bmp.width,bmp.height),n=Math.min(600,s);
  const c=document.createElement('canvas');c.width=c.height=n;c.getContext('2d').drawImage(bmp,(bmp.width-s)/2,(bmp.height-s)/2,s,s,0,0,n,n);bmp.close?.();return c.toDataURL('image/jpeg',.86);}catch{return null;}
}
// Try a link's pictures in turn (biggest first) until one makes a cover. deep: if none do, ask the
// site for its list of pictures (records saved before their pictures were remembered).
const coverTried=new Map(),coverBusy=new Map(); // id -> 'quick' | 'deep' tried; id -> a try under way
async function tryCovers(e,cands){
 for(let i=0;i<cands.length;){
  const r=await D.coverFrom(cands.slice(i));if(!r)return false;
  const c=await squareCover(r.dataUrl);
  if(c){if(library.get(e.id)!==e)return true;e.cover=c;D.saveCover(e.id,c);emitSleeves();if(e.id===currentId)window.dispatchEvent(new CustomEvent('vinyl-cover',{detail:{id:e.id,cover:c}}));return true;}
  i+=r.index+1;
 }
 return false;
}
async function coverFor(e,deep=false){
 if(!e||e.kind!=='link'||e.cover)return;
 const busyP=coverBusy.get(e.id);if(busyP){await busyP;return coverFor(e,deep);}
 const had=coverTried.get(e.id);if(had==='deep'||(had==='quick'&&!deep))return;
 let done;coverBusy.set(e.id,new Promise(r=>done=r));
 try{
  let cands=[...(e.thumbs||[]),...(e.thumb?[e.thumb]:[])];
  if(e.url)cands=[...new Set([...cands,...await D.linkThumbs(e.url,false)])];
  if(cands.length&&await tryCovers(e,cands))return;
  if(deep&&e.url){const more=(await D.linkThumbs(e.url,true)).filter(u=>!cands.includes(u));if(more.length){e.thumbs=[...(e.thumbs||[]),...more].slice(0,16);persist();await tryCovers(e,more);}}
 }catch(err){D.log('cover',err?.message);}
 finally{coverTried.set(e.id,deep?'deep':'quick');coverBusy.delete(e.id);done();}
}

/* ---------- putting a record on ---------- */
function recordFor(e,buf){
 const m=Core.parameters(buf.duration);
 return {id:e.id,label:titleOf(e),cover:e.cover||null,tags:{title:e.title,artist:e.artist},metadata:m,playback_source:'playback',base:''};
}
function playable(e){return e&&e.state!=='error'&&!(e.missing&&e.kind==='file');}
function seq(){return Order.baseOrder([...library.values()].filter(e=>playable(e)||e.id===currentId));}
function orderState(){return {shuffle,repeat,played,history,rng:Math.random};}
function pickNext(why){
 upNext=upNext.filter(id=>library.has(id)&&id!==currentId);if(upNext.length)return upNext[0];
 if(why==='ended'&&repeat==='one')return currentId;
 if(planned&&library.has(planned)&&planned!==currentId&&playable(library.get(planned)))return planned;
 planned=Order.next(seq(),currentId,orderState(),why);return planned;
}
function noteMounted(id){
 if(history.at(-1)!==id){history.push(id);if(history.length>60)history.shift();}
 played=Order.notePlayed({played},id,seq().length);upNext=upNext.filter(x=>x!==id);planned=null;
}
function mount(e,buf){
 silence();down=false;state.grabbed=false;state.dragging=false;scratchAbsRate=0;
 const prev=currentId?library.get(currentId):null;if(prev){prev.used=++useCounter;if(prev.id!==e.id)prev.buffer=null;} // only the record on the turntable keeps its sound in memory
 record=recordFor(e,buf);buffer=buf;reverseBuffer=null;currentId=e.id;e.used=++useCounter;
 position=0;state.rotation=0;rpm=record.metadata.rpm_cut;
 window.dispatchEvent(new CustomEvent('vinyl-record',{detail:record}));
 noteMounted(e.id);
 emitSleeves();persist();renderStatus();prefetchAfter(e);
}
async function play(e,{drop:dropAfter=false}={}){
 if(busy)return false;busy=true;window.petShell?.busyState?.(true);
 let tok=0,mounted=false;
 try{
  if(e.missing&&e.kind==='file')throw Error('That song isn’t where it used to be. It may have been moved or deleted.');
  if(e.kind==='link'&&!e.cover)coverFor(e,true);
  if(e.kind==='link'&&!e.file){await fetchEntry(e);if(!e.file)return false;}
  if(e.duration>MAX_SEC)throw tooLongErr();
  say(`Putting on “${titleOf(e)}”…`,'busy');
  // the main process is told which record is being put on, so a crash here doesn't repeat itself
  tok=++loadTok;D.loading(e.id);
  const buf=await decodeEntry(e);
  lift();mount(e,buf);say(`“${titleOf(e)}”: lower the arm to play.`,'hint');mounted=true;
  if(e.bad){e.bad=false;persist();}
  if(playWhenOn!=null){dropAfter=playWhenOn;playWhenOn=null;}
  if(dropAfter)setTimeout(()=>{if(record&&currentId===e.id&&!down)drop(0).catch(()=>{});},1900);
  return true;
 }catch(err){D.log('play',err?.message);e.buffer=null;if(err?.tooLong){refuseLong(e);return false;}say(err?.message||'Sorry, that one wouldn’t play.','error');return false;}
 finally{busy=false;window.petShell?.busyState?.(false);
  // (still "being put on" while it flies onto the platter)
  if(tok)setTimeout(()=>{if(loadTok===tok)D.loading(null);},mounted?3000:0);}
}
function swapTo(id){const e=library.get(id);if(!e||id===currentId)return false;
 if(e.state==='fetching'){say('Still getting that one ready…','hint');return false;}
 if(e.state==='error'){say(e.error||'That one couldn’t be played.','error');return false;}
 if(busy)return false;
 play(e);return true;}

/* ---------- songs from this computer ---------- */
const AUDIO=/\.(mp3|wav|wave|flac|ogg|oga|opus|m4a|aac|mp4|webm|wma|aif|aiff)$/i;
async function openPaths(paths){
 const list=paths.filter(Boolean);if(!list.length)return;
 const bad=list.filter(p=>!AUDIO.test(p));const good=list.filter(p=>AUDIO.test(p));
 if(!good.length){say('That doesn’t look like a song. Try an MP3, WAV, FLAC, OGG or M4A file.','error');return;}
 let first=null;
 for(const p of good){
  const known=[...library.values()].find(e=>e.kind==='file'&&e.path===p);
  const name=p.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
  const e=known||add({kind:'file',path:p,title:name,artist:'',kept:true});e.used=++useCounter;e.missing=false;first??=e;
  if(!known&&e!==first)decodeLater(e);
 }
 emitSleeves();persist();
 if(bad.length)say(`Skipped ${bad.length===1?'one file that isn’t':bad.length+' files that aren’t'} a song.`,'hint');
 await play(first);
}
// Tags and covers for files added but not played yet (without keeping their sound in memory).
async function decodeLater(e){try{const r=await D.read(e.path);if(!r.error)await tagsFor(e,r.bytes);}catch{}}

/* ---------- web links ---------- */
const URLISH=/^(https?:\/\/|www\.)\S+$/i;
function cleanLink(text){
 const t=String(text||'').trim();const m=t.match(/https?:\/\/[^\s<>"']+/i)||(/^www\.\S+$/i.test(t)?['https://'+t]:null);
 return m?m[0].replace(/[),.;]+$/,''):null;
}
let jobN=0;const progressFor=new Map();
D.onProgress(p=>{const e=progressFor.get(p.job);if(!e)return;const step=Math.round((p.pct||0)/20);if(step!==e._step){e._step=step;e.pct=p.pct;emitSleeves();}window.petShell?.progress?.(p.pct,titleOf(e));});
async function playLink(text){
 const url=cleanLink(text);
 if(!url){say('Copy a web link first (to any song or video), then choose “Play a web link”.','hint');return;}
 const existing=[...library.values()].find(e=>e.url===url&&e.state!=='error');if(existing){await play(existing);return;}
 const holder=add({kind:'link',url,title:'',artist:'',state:'fetching',pct:0});say('Looking at the link…','busy');
 const info=await D.linkInfo(url);
 if(info.error){library.delete(holder.id);emitSleeves();say(info.error,'error');return;}
 if(info.kind==='list'){
  library.delete(holder.id);
  const qid=newId(),ents=info.entries,sk=info.skipped||0;
  say(`A list of ${ents.length}: they’ll arrive one by one${autoNext?' and play in turn':''}.${sk?` (I left out ${sk===1?'one that is':sk+' that are'} longer than an hour and a half.)`:''}`,'hint');
  const base=++useCounter;let first=null;
  ents.forEach((x,i)=>{const known=[...library.values()].find(e=>e.url===x.url);if(known)return;
   if(x.duration>MAX_SEC)return;
   const e=add({kind:'link',url:x.url,title:x.title,artist:x.artist,duration:x.duration,thumbs:x.thumbs||[],state:'waiting',queue:qid,qIndex:i,used:base-i*1e-3});first??=e;});
  useCounter+=1;emitSleeves();
  if(first){await fetchEntry(first);if(first.file)await play(first,{drop:true});}
  return;
 }
 Object.assign(holder,{title:info.title||'',artist:info.artist||'',duration:info.duration||0,thumbs:info.thumbs||[],direct:info.kind==='direct'});
 await fetchEntry(holder);
 if(holder.file)await play(holder,{drop:true});
 if(info.note&&holder.file)setTimeout(()=>say(info.note,'hint'),2500);
}
const fetching=new Set();
async function fetchEntry(e){
 if(e.file||fetching.has(e.id))return waitFor(e);
 if(e.duration>MAX_SEC){refuseLong(e);return;}
 fetching.add(e.id);e.state='fetching';e.pct=0;emitSleeves();
 const job=++jobN;progressFor.set(job,e);
 try{
  if(!e.cover)coverFor(e,true);
  const r=await D.linkFetch(job,e.url,!!e.direct);
  if(r.tooLong){refuseLong(e);return;}
  if(r.error){e.state='error';e.error=r.error;emitSleeves();say(r.error,'error');setTimeout(()=>{if(library.get(e.id)===e&&e.state==='error'&&e.id!==currentId){library.delete(e.id);emitSleeves();}},8000);return;}
  e.file=r.file;e.state='ready';if(e.kept){const f=await D.keep(e.file,true);if(f)e.file=f;}
  emitSleeves();persist();trimTemp();
 }finally{fetching.delete(e.id);progressFor.delete(job);window.petShell?.progress?.(null);}
}
function waitFor(e){return new Promise(res=>{const t=setInterval(()=>{if(!fetching.has(e.id)){clearInterval(t);res();}},300);});}
// Playlists: fetch only the next one or two, lazily, while this one plays.
function queueAfter(e,n=2){
 if(!e?.queue)return [];
 return [...library.values()].filter(x=>x.queue===e.queue&&x.qIndex>e.qIndex).sort((a,b)=>a.qIndex-b.qIndex).slice(0,n);
}
function aheadOf(e){const out=[],seen=new Set([e?.id]);const n=e?.id===currentId?pickNext('skip'):null;
 for(const id of [...upNext,n].filter(Boolean)){const x=library.get(id);if(x&&!seen.has(id)){seen.add(id);out.push(x);}}
 for(const x of queueAfter(e,2))if(!seen.has(x.id)){seen.add(x.id);out.push(x);}return out.slice(0,2);}
async function prefetchAfter(e){for(const x of aheadOf(e)){if(x.kind==='link'&&!x.file&&x.state!=='error')await fetchEntry(x);}}
async function keepCurrent(){
 const e=library.get(currentId);if(!e||e.kind!=='link')return;
 e.kept=!e.kept;if(e.file){const f=await D.keep(e.file,e.kept);if(f)e.file=f;}
 persist();say(e.kept?'Kept. This record will stay in the stack.':'It’s a temporary record again.','hint');
}
/* when a record finishes: lift, and (playlist, or Auto-play) swap to the next sleeve and drop */
let ending=false;
function finished(ranOut=false){
 if(ending)return;ending=true;setTimeout(()=>ending=false,3000);
 if(!ranOut)lift();const e=library.get(currentId);if(!e)return;
 if(repeat==='one'){setTimeout(()=>{if(currentId===e.id&&!down)drop(0).catch(()=>{});},700);return;}
 if(!autoNext)return;
 const id=pickNext('ended'),next=id&&library.get(id);if(!next)return;
 say(`Next: “${titleOf(next)}”`,'hint');goTo(next,{drop:true,delay:900});
}
/* ---------- the transport: Play/Pause, Next, Previous (menu, tray, the keys on the cabinet) ---------- */
// Swap to a record the way a click on its sleeve does: out of its sleeve, onto the platter.
async function goTo(e,{drop:dropAfter=true,delay=0}={}){
 if(!e)return false;if(e.state==='error'){say(e.error||'That one couldn’t be played.','error');return false;}
 if(e.kind==='link'&&!e.file){say(`Getting “${titleOf(e)}” ready…`,'busy');await fetchEntry(e);if(!e.file||!library.has(e.id))return false;}
 if(delay)await new Promise(r=>setTimeout(r,delay));
 try{window.vinylView?.armSwapFromSleeve?.(e.id);}catch{}
 return play(e,{drop:dropAfter});
}
let playWhenOn=null; // Play/Pause pressed while a record is still being put on: honoured once it is on
function playPause(){
 if(busy){playWhenOn=playWhenOn==null?!(down&&!state.grabbed):!playWhenOn;say(playWhenOn?'It will play as soon as it’s on':'It will wait when it’s on','hint');return;}
 if(!record){const id=seq()[0];if(id)return goTo(library.get(id));say('Drop a song on me, or right-click → Play a web link.','hint');return;}
 if(down&&!state.grabbed){lift();say('Paused','hint');}else drop().catch(()=>{});
}
function next(){
 if(busy)return;const wasPlaying=down&&!state.grabbed||!record;const id=pickNext('skip');
 if(!id){say(repeat==='off'?'That’s the last record. Turn on Repeat to go round again.':'Nothing else to play yet.','hint');return;}
 return goTo(library.get(id),{drop:wasPlaying});
}
function previous(){
 if(busy||!record)return;const wasPlaying=down&&!state.grabbed;
 const a=Order.previousAction(seq(),currentId,time(),orderState());
 if(a.restart||a.id===currentId){position=0;state.rotation=0;if(wasPlaying)drop(0).catch(()=>{});renderStatus();say('From the start','hint');return;}
 history=history.slice(0,Math.max(0,history.lastIndexOf(currentId)));planned=null; // going back un-plays this one
 return goTo(library.get(a.id),{drop:wasPlaying});
}
function transport(what){if(what==='toggle')return playPause();if(what==='next')return next();if(what==='prev')return previous();}
function setShuffle(on){shuffle=!!on;played=currentId?[currentId]:[];planned=null;D.set({shuffle});const e=library.get(currentId);if(e)prefetchAfter(e);}
function setRepeat(m){repeat=['off','all','one'].includes(m)?m:'off';planned=null;D.set({repeat});}
function playNext(id){const e=library.get(id);if(!e||id===currentId)return;upNext=[id,...upNext.filter(x=>x!==id)];planned=null;say(`“${titleOf(e)}” plays next`,'hint');if(e.kind==='link'&&!e.file)fetchEntry(e);}
function speed(value){const wasDown=down&&!state.grabbed;position=time();if(!state.grabbed){silence();down=false;}rpm=Math.max(10,Math.min(100,Number(value)));if(wasDown)drop(position);renderStatus();}
function setVolume(v){vol=Math.max(0,Math.min(1,Number(v)||0));muted=false;if(gain)gain.gain.value=vol;D.set({volume:vol,muted:false});}
function setMuted(m){muted=!!m;if(gain)gain.gain.value=muted?0:vol;D.set({muted});}

window.vinyl={get record(){return record;},get state(){return state;},get down(){return down;},get buffer(){return buffer;},time,lift,drop,grabStart,grabMove,grabEnd,grabTick,setListener,
 place(x,y,release=false){if(!record)return;if(release){grabEnd();return;}grabStart(x,y);},

 get volume(){return vol;},setVolume,get muted(){return muted;},setMuted,get rpm(){return rpm;},setSpeed(v){if(!record)return;speed(v);},
 get sources(){return {vector:false,png:false,both:false};},get source(){return record?'playback':null;},setSource(){},
 swapTo,sleeves:sleeveList,currentSleeve:()=>{const e=currentId&&library.get(currentId);return e?sleeveOf(e):null;},get currentId(){return currentId;},
 flipStack,forget,say,get busy(){return busy;},get libraryCount(){return library.size;},localApi:async()=>false,isShelved:async()=>true,
 // Desk Phonograph
 openPaths,playLink,keepCurrent,get autoNext(){return autoNext;},set autoNext(v){autoNext=!!v;},
 get entry(){return currentId?library.get(currentId):null;},entries:()=>ordered(),
 get playing(){return down&&!state.grabbed;},
 transport,playPause,next,previous,goTo:id=>goTo(library.get(id)),playNext,setShuffle,setRepeat,
 get shuffle(){return shuffle;},get repeat(){return repeat;},get upNext(){return upNext.slice();},get order(){return seq();},get history(){return history.slice();},
 nextPreview:()=>pickNext('skip'),allSleeves:()=>seq().filter(id=>id!==currentId).map(id=>sleeveOf(library.get(id))),
 get nowPlaying(){const e=currentId&&library.get(currentId);return e?{title:e.title||titleOf(e),artist:e.artist||''}:null;}
};
setInterval(()=>{if(record){if(down&&!state.grabbed&&time()>=duration()-.01)finished();}},150);

(async()=>{
 const st=await D.settings();vol=Number.isFinite(st.volume)?st.volume:.8;muted=!!st.muted;autoNext=st.autoNext!==false;shuffle=!!st.shuffle;repeat=['off','all','one'].includes(st.repeat)?st.repeat:'off';
 const boot=await D.boot().catch(()=>({}))||{};let dropped=false;
 const list=await D.library();
 for(const x of list.sort((a,b)=>a.used-b.used)){
  if(x.duration>MAX_SEC){D.forget(x.id,x.kind==='link'?x.path:null);dropped=true;continue;} // saved by an older version: too long to ever play
  const e={...x,used:++useCounter,cover:x.cover||null};
  if(e.kind==='link'){e.file=x.path||null;e.state=e.file&&!x.missing?'ready':(x.queue&&!x.kept?'waiting':'ready');if(x.missing||!e.file){e.file=null;}}
  library.set(e.id,e);
 }
 // link records saved without a cover (a picture that failed before 1.0.8): try their pictures again, one at a time
 (async()=>{for(const e of ordered())if(e.kind==='link'&&!e.cover&&library.get(e.id)===e)await coverFor(e,false);})();
 // temp records whose files were cleaned away are fetched again when played; playlists past the cap are trimmed
 trimTemp();emitSleeves();
 D.tempSweep([...library.values()].map(e=>e.file).filter(Boolean));
 if(!library.size)say('Drop a song on me, or right-click → Play a web link.','hint');
 else if(boot.quiet)say('Something went wrong with the last record, so I’ve started with nothing playing.','hint');
 else{const last=ordered().find(e=>!e.missing&&!e.bad&&(e.kind==='file'||e.file));
  const bad=boot.bad&&library.get(boot.bad);
  if(last)play(last).then(()=>say(bad?`“${titleOf(bad)}” gave me trouble, so I’ve left it in its sleeve.`:'','hint'));
  else if(bad)say(`“${titleOf(bad)}” gave me trouble, so I’ve left it in its sleeve.`,'hint');}
 if(dropped)persist();
})();
})();
