/* Desk Phonograph: main process.
   The window is a transparent, frameless, always-on-top "pet" the way the Bot Beacons
   avatars are: the page tells us which pixels are solid (per-pixel hit test, padded like
   HitPad), everything else clicks through (setIgnoreMouseEvents + forward). Moving is a
   screen-space drag the page drives (left-drag on the body), with the Beacons fling, edge
   bounce (not where another monitor continues), KeepOnScreen against the monitor's work
   area and ClampHome back onto the primary screen if a monitor went away. Position and
   size are remembered. Links play through a bundled yt-dlp (+ffmpeg), all spawned hidden. */
'use strict';
const {app,BrowserWindow,ipcMain,Menu,Tray,screen,clipboard,dialog,nativeImage,shell,net}=require('electron');
const path=require('path'),fs=require('fs'),fsp=fs.promises,os=require('os'),crypto=require('crypto');
const {spawn}=require('child_process');

app.setAppUserModelId?.('app.deskphonograph.pet');
if(!app.requestSingleInstanceLock()){app.quit();return;}

if(process.env.DESK_PHONO_DATA)app.setPath('userData',process.env.DESK_PHONO_DATA); // tests: a throwaway data folder
const DATA=app.getPath('userData');
const P={settings:path.join(DATA,'settings.json'),library:path.join(DATA,'library.json'),covers:path.join(DATA,'covers'),
 records:path.join(DATA,'records'),temp:path.join(app.getPath('temp'),'DeskPhonograph'),bin:path.join(DATA,'bin'),log:path.join(DATA,'log.txt')};
for(const d of [P.covers,P.records,P.temp,P.bin])fs.mkdirSync(d,{recursive:true});
function log(...a){try{fs.appendFileSync(P.log,new Date().toISOString()+' '+a.join(' ')+'\n');}catch{}}
try{const st=fs.statSync(P.log);if(st.size>2e6)fs.writeFileSync(P.log,'');}catch{}

/* ---------- settings ---------- */
const DEFAULTS={bounds:null,onTop:true,pip:false,autoNext:true,volume:.8,toy:'hula',pose:null,ytdlpChecked:0};
let settings={...DEFAULTS};
try{settings={...DEFAULTS,...JSON.parse(fs.readFileSync(P.settings,'utf8'))};}catch{}
let saveT=null;
function saveSettings(){clearTimeout(saveT);saveT=setTimeout(()=>{try{fs.writeFileSync(P.settings,JSON.stringify(settings,null,1));}catch(e){log('settings',e.message);}},300);}

/* ---------- window ---------- */
const MIN=220,MAX=1100,ASPECT=1.12; // width/height
let win=null,tray=null,quitting=false;
function workAreaAt(x,y){return screen.getDisplayNearestPoint({x:Math.round(x),y:Math.round(y)}).workArea;}
function screenAt(x,y){return screen.getAllDisplays().some(d=>{const b=d.bounds;return x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height;});}
// The machine only fills the middle of the window; this much of each side may hang off an edge.
const SLACK=.18;
function keepOnScreen(b){
 const wa=workAreaAt(b.x+b.width/2,b.y+b.height/2),sx=b.width*SLACK,sy=b.height*SLACK;
 b.x=Math.max(wa.x-sx,Math.min(b.x,wa.x+wa.width-b.width+sx));
 b.y=Math.max(wa.y-sy,Math.min(b.y,wa.y+wa.height-b.height+sy));
 b.x=Math.round(b.x);b.y=Math.round(b.y);return b;
}
function clampHome(b){
 if(!screenAt(b.x+b.width/2,b.y+b.height/2)){const wa=screen.getPrimaryDisplay().workArea;b.x=wa.x+wa.width-b.width-80;b.y=wa.y+wa.height-b.height-60;}
 return keepOnScreen(b);
}
function firstBounds(){
 const s=settings.bounds;
 if(s&&Number.isFinite(s.x)&&Number.isFinite(s.width)){const w=Math.max(MIN,Math.min(MAX,s.width));return clampHome({x:s.x,y:s.y,width:w,height:Math.round(w/ASPECT)});}
 const wa=screen.getPrimaryDisplay().workArea,w=440,h=Math.round(w/ASPECT);
 return {x:wa.x+wa.width-w-60,y:wa.y+wa.height-h-30,width:w,height:h};
}
let bounds=null; // our own idea of the bounds (DIP); setBounds with a fixed size so crossing a monitor never resizes it
function place(b,save=true){bounds={x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)};win?.setBounds(bounds);if(save){settings.bounds={...bounds};saveSettings();}}
function createWindow(){
 const b=firstBounds();bounds=b;
 win=new BrowserWindow({...b,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
  hasShadow:false,skipTaskbar:true,alwaysOnTop:settings.onTop,show:false,title:'Desk Phonograph',icon:iconPath(),
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true,spellcheck:false}});
 if(settings.onTop)win.setAlwaysOnTop(true,'floating');
 win.setIgnoreMouseEvents(true,{forward:true}); // until the page has drawn and can hit-test
 win.loadFile(path.join(__dirname,'renderer','index.html'));
 win.once('ready-to-show',()=>{win.showInactive();});
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('render-process-gone',(e,d)=>{log('renderer gone',d.reason);if(!quitting)setTimeout(()=>win?.reload(),800);});
 screen.on('display-removed',()=>place(clampHome({...bounds})));
 screen.on('display-metrics-changed',()=>place(keepOnScreen({...bounds})));
}
function iconPath(){return path.join(__dirname,'build',process.platform==='win32'?'icon.ico':'icon.png');}
function send(ch,...a){if(win&&!win.isDestroyed())win.webContents.send(ch,...a);}

/* click-through toggled by the page's hit test */
let ignoring=true;
ipcMain.on('pet:solid',(e,solid)=>{if(!win)return;const ig=!solid;if(ig!==ignoring){ignoring=ig;win.setIgnoreMouseEvents(ig,{forward:true});}});

/* ---------- moving: Beacons-style drag + fling ---------- */
let mv=null,fling=null;
ipcMain.on('pet:move-start',(e,sx,sy)=>{stopFling();mv={sx,sy,x0:bounds.x,y0:bounds.y,trail:[{x:sx,y:sy,t:Date.now()}]};});
ipcMain.on('pet:move',(e,sx,sy)=>{if(!mv)return;const now=Date.now();mv.trail.push({x:sx,y:sy,t:now});while(mv.trail.length>2&&now-mv.trail[0].t>90)mv.trail.shift();
 place({x:mv.x0+sx-mv.sx,y:mv.y0+sy-mv.sy,width:bounds.width,height:bounds.height},false);});
ipcMain.on('pet:move-end',()=>{if(!mv)return;const tr=mv.trail;mv=null;
 const a=tr[0],b=tr[tr.length-1],dt=(b.t-a.t)/1000;let vx=0,vy=0;if(dt>.012&&Date.now()-b.t<60){vx=(b.x-a.x)/dt;vy=(b.y-a.y)/dt;}
 if(Math.hypot(vx,vy)>500)startFling(vx,vy);else rest();});
function rest(){place(keepOnScreen({...bounds}));}
function stopFling(){if(fling){clearInterval(fling.timer);fling=null;}}
function startFling(vx,vy){
 stopFling();const f=fling={x:bounds.x,y:bounds.y,vx:Math.max(-6000,Math.min(6000,vx)),vy:Math.max(-6000,Math.min(6000,vy)),t:Date.now(),bounces:0};
 f.timer=setInterval(()=>{
  const now=Date.now(),dt=Math.min(.05,(now-f.t)/1000);f.t=now;
  f.x+=f.vx*dt;f.y+=f.vy*dt;const damp=Math.exp(-2.4*dt);f.vx*=damp;f.vy*=damp;
  const w=bounds.width,h=bounds.height,cx=f.x+w/2,cy=f.y+h/2,wa=workAreaAt(cx,cy),sx=w*SLACK,sy=h*SLACK;
  const L=f.x+sx,R=f.x+w-sx,T=f.y+sy,B=f.y+h-sy;
  // bounce off an edge unless another monitor continues there; lose 40% of the speed per bounce
  if(L<wa.x&&f.vx<0&&!screenAt(L-2,cy)){f.x+=wa.x-L;f.vx=-f.vx*.6;f.bounces++;}
  if(R>wa.x+wa.width&&f.vx>0&&!screenAt(R+2,cy)){f.x-=R-(wa.x+wa.width);f.vx=-f.vx*.6;f.bounces++;}
  if(T<wa.y&&f.vy<0&&!screenAt(cx,T-2)){f.y+=wa.y-T;f.vy=-f.vy*.6;f.bounces++;}
  if(B>wa.y+wa.height&&f.vy>0&&!screenAt(cx,B+2)){f.y-=B-(wa.y+wa.height);f.vy=-f.vy*.6;f.bounces++;}
  place({x:f.x,y:f.y,width:w,height:h},false);
  if(Math.hypot(f.vx,f.vy)*Math.max(dt,1/60)<.05){stopFling();rest();}
 },16);
}

/* ---------- resizing: scroll, anchored at the cursor's point in the window ---------- */
ipcMain.on('pet:resize',(e,dir,fx,fy)=>{
 const k=Math.pow(1.08,-Math.sign(dir)),w=Math.max(MIN,Math.min(MAX,Math.round(bounds.width*k))),h=Math.round(w/ASPECT);
 if(w===bounds.width)return;
 fx=Number.isFinite(fx)?Math.max(0,Math.min(1,fx)):.5;fy=Number.isFinite(fy)?Math.max(0,Math.min(1,fy)):.5;
 const ax=bounds.x+bounds.width*fx,ay=bounds.y+bounds.height*fy;
 place(keepOnScreen({x:ax-w*fx,y:ay-h*fy,width:w,height:h}));
});

/* ---------- tray + menus ---------- */
function toggleShown(){if(!win)return;if(win.isVisible())win.hide();else{win.showInactive();if(settings.onTop)win.setAlwaysOnTop(true,'floating');}buildTray();}
function buildTray(){
 if(!tray){tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'build',process.platform==='win32'?'tray.ico':'tray.png')));tray.setToolTip('Desk Phonograph');tray.on('click',toggleShown);}
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:win?.isVisible()?'Hide the phonograph':'Show the phonograph',click:toggleShown},
  {label:'Play a song from this computer…',click:()=>{if(!win.isVisible())toggleShown();openFiles();}},
  {label:'Play a web link from the clipboard',click:()=>{if(!win.isVisible())toggleShown();pasteLink();}},
  {type:'separator'},
  {label:'Put it back on screen',click:()=>{const wa=screen.getPrimaryDisplay().workArea;place(keepOnScreen({x:wa.x+wa.width-bounds.width-60,y:wa.y+wa.height-bounds.height-30,width:bounds.width,height:bounds.height}));if(!win.isVisible())toggleShown();}},
  {label:'Quit Desk Phonograph',click:quit}]));
}
function quit(){quitting=true;app.quit();}
async function openFiles(){
 const r=await dialog.showOpenDialog(win,{title:'Choose songs to play',properties:['openFile','multiSelections'],
  filters:[{name:'Songs',extensions:['mp3','wav','flac','ogg','oga','opus','m4a','aac','wma','webm','mp4']},{name:'Any file',extensions:['*']}]});
 if(!r.canceled&&r.filePaths.length)send('pet:command',{cmd:'files',paths:r.filePaths});
}
function pasteLink(){
 const text=(clipboard.readText()||'').trim();
 send('pet:command',{cmd:'link',text});
}
ipcMain.handle('pet:menu',(e,st)=>{
 st=st||{};
 const tmpl=[
  {label:'Play a song from this computer…',click:openFiles},
  {label:'Play a web link (from the clipboard)',click:pasteLink},
  {type:'separator'},
  {label:'Lift the needle',visible:!!st.playing,click:()=>send('pet:command',{cmd:'lift'})},
  {label:'Put the needle down',visible:!!st.record&&!st.playing,click:()=>send('pet:command',{cmd:'drop'})},
  {label:'Speed',enabled:!!st.record,submenu:[
   {label:'33⅓ rpm',type:'radio',checked:Math.abs((st.rpm||0)-33.333)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:100/3})},
   {label:'45 rpm',type:'radio',checked:Math.abs((st.rpm||0)-45)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:45})},
   {label:'78 rpm',type:'radio',checked:Math.abs((st.rpm||0)-78)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:78})},
   {type:'separator'},
   {label:'A little faster',click:()=>send('pet:command',{cmd:'speed',nudge:1})},
   {label:'A little slower',click:()=>send('pet:command',{cmd:'speed',nudge:-1})},
   {label:'Back to normal speed',click:()=>send('pet:command',{cmd:'speed',normal:true})}]},
  {label:'Volume',submenu:[100,80,60,40,20,0].map(v=>({label:v?v+'%':'Silent',type:'radio',checked:Math.round((st.volume??.8)*100)===v,click:()=>send('pet:command',{cmd:'volume',value:v/100})}))},
  {label:'Look closely at the record',enabled:!!st.record,click:()=>send('pet:command',{cmd:'inspect'})},
  {type:'separator'},
  {label:'Keep this record',type:'checkbox',visible:!!st.canKeep,checked:!!st.kept,click:()=>send('pet:command',{cmd:'keep'})},
  {label:'Put this record away',visible:!!st.sleeve,click:()=>send('pet:command',{cmd:'forget',id:st.sleeve})},
  {label:'Play the next one automatically',type:'checkbox',checked:settings.autoNext,click:m=>{settings.autoNext=m.checked;saveSettings();send('pet:command',{cmd:'autoNext',on:m.checked});}},
  {label:'Needle close-up',type:'checkbox',checked:settings.pip,click:m=>{settings.pip=m.checked;saveSettings();send('pet:command',{cmd:'pip',on:m.checked});}},
  {label:'Swap the dancer',click:()=>send('pet:command',{cmd:'toy'})},
  {label:'Turn it back to the front',click:()=>send('pet:command',{cmd:'resetPose'})},
  {label:'Always on top',type:'checkbox',checked:settings.onTop,click:m=>{settings.onTop=m.checked;saveSettings();win.setAlwaysOnTop(m.checked,'floating');}},
  {type:'separator'},
  {label:'Hide (click the tray icon to bring it back)',click:toggleShown},
  {label:'Quit',click:quit}];
 Menu.buildFromTemplate(tmpl).popup({window:win});
 return true;
});
ipcMain.handle('pet:settings',()=>({...settings}));
ipcMain.on('pet:set',(e,patch)=>{if(patch&&typeof patch==='object'){for(const k of ['volume','toy','pose','pip','autoNext'])if(k in patch)settings[k]=patch[k];saveSettings();}});
ipcMain.handle('pet:clipboard',()=>(clipboard.readText()||'').trim());

/* ---------- library on disk ---------- */
const safeId=id=>/^[A-Za-z0-9_-]{1,80}$/.test(String(id||''));
ipcMain.handle('pet:library',async()=>{
 try{const list=JSON.parse(await fsp.readFile(P.library,'utf8'));
  return (Array.isArray(list)?list:[]).filter(e=>e&&safeId(e.id)).map(e=>({...e,missing:!!(e.path&&!fs.existsSync(e.path)),coverFile:undefined,cover:coverUrl(e.id)}));
 }catch{return [];}
});
function coverUrl(id){const f=path.join(P.covers,id+'.jpg');return fs.existsSync(f)?'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64'):null;}
ipcMain.handle('pet:library-save',async(e,list)=>{
 if(!Array.isArray(list))return false;
 const clean=list.filter(x=>x&&safeId(x.id)).slice(0,500).map(x=>({id:x.id,title:String(x.title||'').slice(0,300),artist:String(x.artist||'').slice(0,200),kind:x.kind==='link'?'link':'file',
  path:x.path?String(x.path):null,url:x.url?String(x.url).slice(0,2000):null,kept:!!x.kept,duration:Number(x.duration)||0,added:Number(x.added)||Date.now(),used:Number(x.used)||0,queue:x.queue||null,qIndex:Number.isFinite(x.qIndex)?x.qIndex:null}));
 try{await fsp.writeFile(P.library+'.tmp',JSON.stringify(clean,null,1));await fsp.rename(P.library+'.tmp',P.library);return true;}catch(err){log('library',err.message);return false;}
});
ipcMain.handle('pet:cover-save',async(e,id,dataUrl)=>{
 if(!safeId(id)||typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/jpeg;base64,'))return false;
 try{await fsp.writeFile(path.join(P.covers,id+'.jpg'),Buffer.from(dataUrl.slice(23),'base64'));return true;}catch{return false;}
});
// A record is put away: its cover goes, and so does its audio if it lives in our own folders (never the user's own files).
ipcMain.handle('pet:forget',async(e,id,file)=>{
 if(!safeId(id))return false;
 try{await fsp.rm(path.join(P.covers,id+'.jpg'),{force:true});}catch{}
 if(file&&ours(file))try{await fsp.rm(file,{force:true});}catch{}
 return true;
});
function ours(f){const r=path.resolve(String(f));return [P.temp,P.records].some(d=>r.startsWith(path.resolve(d)+path.sep));}
ipcMain.handle('pet:keep',async(e,file,keep)=>{
 // "Keep this record": the fetched audio moves from temp into the app's records folder (and back).
 if(!file||!ours(file)||!fs.existsSync(file))return null;
 const dest=path.join(keep?P.records:P.temp,path.basename(file));if(path.resolve(dest)===path.resolve(file))return file;
 try{await fsp.rename(file,dest);}catch{await fsp.copyFile(file,dest);await fsp.rm(file,{force:true});}
 return dest;
});

/* ---------- reading audio ---------- */
const AUDIO_MAX=1.5e9;
ipcMain.handle('pet:read',async(e,file)=>{
 try{const st=await fsp.stat(file);if(!st.isFile())throw Error('not a file');if(st.size>AUDIO_MAX)return {error:'That file is too big to play as a record.'};
  const b=await fsp.readFile(file);return {bytes:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),name:path.basename(file)};}
 catch(err){log('read',file,err.message);return {error:err.code==='ENOENT'?'That song isn\u2019t where it used to be. It may have been moved or deleted.':'That file couldn\u2019t be opened.'};}
});
// Anything Chromium can't decode is turned into a plain WAV by the bundled ffmpeg.
ipcMain.handle('pet:transcode',async(e,file,{mono=false,rate=0}={})=>{
 const out=path.join(P.temp,'decode-'+crypto.randomBytes(6).toString('hex')+'.wav');
 const args=['-hide_banner','-loglevel','error','-y','-i',file,'-vn','-map','0:a:0'];if(mono)args.push('-ac','1');else args.push('-ac','2');if(rate)args.push('-ar',String(rate));args.push('-c:a','pcm_s16le','-f','wav',out);
 const r=await run(ffmpegPath(),args,{timeout:10*60e3});
 if(r.code!==0||!fs.existsSync(out)){log('transcode',file,r.err.slice(-500));return {error:'That file doesn\u2019t seem to have any sound I can play.'};}
 try{const b=await fsp.readFile(out);return {bytes:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}finally{fsp.rm(out,{force:true}).catch(()=>{});}
});
// Tags + picture for formats the page can't read itself (OGG, WAV, WMA...).
ipcMain.handle('pet:probe',async(e,file)=>{
 const meta=path.join(P.temp,'meta-'+crypto.randomBytes(6).toString('hex')+'.txt'),pic=meta.replace(/\.txt$/,'.jpg');
 await run(ffmpegPath(),['-hide_banner','-loglevel','error','-y','-i',file,'-f','ffmetadata',meta],{timeout:60e3});
 await run(ffmpegPath(),['-hide_banner','-loglevel','error','-y','-i',file,'-an','-frames:v','1','-vf','scale=600:600:force_original_aspect_ratio=decrease',pic],{timeout:60e3});
 const out={};
 try{for(const line of (await fsp.readFile(meta,'utf8')).split(/\r?\n/)){const m=/^(title|artist|album|date)=(.*)$/i.exec(line);if(m)out[m[1].toLowerCase()]=m[2].replace(/\\(.)/g,'$1').trim();}}catch{}
 try{out.picture='data:image/jpeg;base64,'+(await fsp.readFile(pic)).toString('base64');}catch{}
 fsp.rm(meta,{force:true}).catch(()=>{});fsp.rm(pic,{force:true}).catch(()=>{});
 return out;
});
ipcMain.handle('pet:image',async(e,url)=>{
 try{if(!/^https?:\/\//i.test(url))return null;const r=await net.fetch(url);if(!r.ok)return null;const t=r.headers.get('content-type')||'image/jpeg';
  if(!/^image\//.test(t))return null;const b=Buffer.from(await r.arrayBuffer());if(b.length>8e6)return null;return 'data:'+t+';base64,'+b.toString('base64');}catch{return null;}
});

/* ---------- bundled tools ---------- */
const EXE=process.platform==='win32'?'.exe':'';
function bundled(name){
 const dirs=app.isPackaged?[path.join(process.resourcesPath,'bin')]:[path.join(__dirname,'..','vendor-bin')];
 for(const d of dirs){const f=path.join(d,name+EXE);if(fs.existsSync(f))return f;}
 return name; // dev on another OS: whatever is on PATH
}
function ffmpegPath(){return bundled('ffmpeg');}
const ytCopy=path.join(P.bin,'yt-dlp'+EXE);
let ytGood=null; // the writable copy, once it has answered --version
function ytdlpPath(){return ytGood||bundled('yt-dlp');}
function run(cmd,args,{timeout=0,onLine}={}){
 return new Promise(res=>{
  let out='',err='',done=false,buf='';
  let ch;try{ch=spawn(cmd,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(e){res({code:-1,out:'',err:String(e.message)});return;}
  const t=timeout?setTimeout(()=>{try{ch.kill();}catch{}},timeout):null;
  const line=s=>{buf+=s;let i;while((i=buf.search(/[\r\n]/))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(l)onLine?.(l);}};
  ch.stdout.on('data',d=>{const s=d.toString('utf8');out+=s;if(out.length>4e6)out=out.slice(-2e6);if(onLine)line(s);});
  ch.stderr.on('data',d=>{const s=d.toString('utf8');err+=s;if(err.length>2e5)err=err.slice(-1e5);if(onLine)line(s);});
  ch.on('error',e=>{if(done)return;done=true;clearTimeout(t);res({code:-1,out,err:err+String(e.message),child:ch});});
  ch.on('close',code=>{if(done)return;done=true;clearTimeout(t);res({code,out,err});});
  run.last=ch;
 });
}
/* Silent self-update: a writable copy in our data folder, "-U" at most once a day in the
   background. If the copy is missing, broken or the update fails, the bundled one is used. */
async function prepareYtdlp(){
 const src=bundled('yt-dlp');if(!fs.existsSync(src))return;
 try{
  if(!fs.existsSync(ytCopy))await fsp.copyFile(src,ytCopy);
  const v=await run(ytCopy,['--version'],{timeout:60e3});
  if(v.code===0&&/\d{4}\.\d/.test(v.out)){ytGood=ytCopy;log('yt-dlp copy',v.out.trim());}
  else{log('yt-dlp copy broken, using bundled');await fsp.rm(ytCopy,{force:true});await fsp.copyFile(src,ytCopy);ytGood=null;return;}
 }catch(e){log('yt-dlp copy',e.message);ytGood=null;return;}
 if(Date.now()-(settings.ytdlpChecked||0)<20*3600e3)return;
 settings.ytdlpChecked=Date.now();saveSettings();
 const u=await run(ytCopy,['-U'],{timeout:5*60e3});log('yt-dlp -U',u.code,(u.out+u.err).trim().slice(-300));
 const v=await run(ytCopy,['--version'],{timeout:60e3});
 if(v.code!==0){log('yt-dlp after update broken, restoring bundled copy');ytGood=null;try{await fsp.rm(ytCopy,{force:true});await fsp.copyFile(src,ytCopy);}catch{}}
}

/* ---------- web links ---------- */
function friendly(err){
 const e=String(err||'');
 if(/getaddrinfo|Failed to resolve|Temporary failure|timed out|Connection reset|Network is unreachable|No route|Unable to connect|ConnectionError|EAI_AGAIN/i.test(e))return 'I couldn\u2019t reach the internet. Check the connection and try again.';
 if(/Unsupported URL|is not a valid URL|no video formats|No media|Requested format is not available|does not contain|no suitable/i.test(e))return 'That link doesn\u2019t seem to lead to anything I can play.';
 if(/Sign in|login|log in|members-only|age|confirm your age|cookies|private/i.test(e))return 'That one needs someone to sign in, so it can\u2019t be played here.';
 if(/HTTP Error 404|not found|has been removed|deleted|terminated/i.test(e))return 'That link doesn\u2019t go anywhere any more.';
 if(/not available|unavailable|blocked|country|region/i.test(e))return 'That one isn\u2019t available here, sorry.';
 if(/HTTP Error 429|Too Many/i.test(e))return 'The website is busy. Give it a minute and try again.';
 if(/live event|is live|premiere/i.test(e))return 'That\u2019s a live stream. Try again when it has finished.';
 return 'Sorry, that link wouldn\u2019t play.';
}
const jobs=new Map();
ipcMain.handle('pet:link-info',async(e,url)=>{
 // What is behind the link: one track, or a list (playlist, mix, album)? Fast, nothing fetched.
 const r=await run(ytdlpPath(),['--flat-playlist','-J','--no-warnings','--ignore-config','--playlist-end','200',url],{timeout:90e3});
 if(r.code!==0){
  log('link-info',url,r.err.slice(-600));
  if(/^https?:\/\/[^\s]+\.(mp3|wav|flac|ogg|oga|opus|m4a|aac)(\?|#|$)/i.test(url))return {kind:'direct',title:decodeURIComponent(url.split(/[?#]/)[0].split('/').pop())};
  return {error:friendly(r.err)};
 }
 let j;try{j=JSON.parse(r.out);}catch{return {error:'Sorry, that link wouldn\u2019t play.'};}
 const pick=x=>({url:x.webpage_url||x.url||x.original_url,id:x.id,title:x.track||x.title||'',artist:x.artist||x.uploader||x.channel||'',duration:x.duration||0,thumb:bestThumb(x)});
 if(j._type==='playlist'&&Array.isArray(j.entries)){
  const entries=j.entries.filter(x=>x&&(x.url||x.webpage_url)&&!/\[(Private|Deleted) video\]/i.test(x.title||'')).map(pick);
  if(!entries.length)return {error:'That list is empty, or nothing in it can be played.'};
  return {kind:'list',title:j.title||'',entries};
 }
 if(j.is_live)return {error:friendly('is live')};
 return {kind:'one',...pick(j),url:j.webpage_url||url};
});
function bestThumb(x){
 if(x.thumbnail)return x.thumbnail;
 const t=Array.isArray(x.thumbnails)?x.thumbnails.filter(t=>t&&t.url):[];if(!t.length)return null;
 t.sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0));return (t.find(z=>(z.width||0)<=1280)||t[0]).url;
}
ipcMain.handle('pet:link-fetch',async(e,jobId,url,direct)=>{
 const id=crypto.randomBytes(8).toString('hex'),base=path.join(P.temp,id);
 const progress=(pct,stage)=>send('pet:link-progress',{job:jobId,pct,stage});
 if(direct){
  try{progress(0,'fetching');const r=await net.fetch(url);if(!r.ok)return {error:friendly('HTTP Error '+r.status)};
   const total=Number(r.headers.get('content-length'))||0,ext=(url.split(/[?#]/)[0].match(/\.(\w{2,5})$/)||[,'audio'])[1];
   const f=base+'.'+ext,chunks=[];let got=0;const rd=r.body.getReader();
   for(;;){const {done,value}=await rd.read();if(done)break;chunks.push(Buffer.from(value));got+=value.length;if(got>AUDIO_MAX)return {error:'That file is too big to play as a record.'};if(total)progress(got/total*100,'fetching');}
   await fsp.writeFile(f,Buffer.concat(chunks));return {file:f};
  }catch(err){log('direct',url,err.message);return {error:friendly(err.message)};}
 }
 const args=['--no-playlist','--ignore-config','--no-warnings','--no-mtime','--no-part','-f','bestaudio[ext=m4a]/bestaudio[acodec=opus]/bestaudio/best[height<=480]/best',
  '--ffmpeg-location',path.dirname(ffmpegPath()),'--max-filesize','1500m','-o',base+'.%(ext)s',
  '--print','after_move:@@FILE %(filepath)s','--progress','--newline','--progress-template','download:@@PCT %(progress._percent_str)s',url];
 const job={cancel:false};jobs.set(jobId,job);
 const r=await run(ytdlpPath(),args,{timeout:30*60e3,onLine:l=>{const m=/@@PCT\s*([\d.]+)%/.exec(l);if(m)progress(Number(m[1]),'fetching');}});
 jobs.delete(jobId);
 const m=/@@FILE (.+)/.exec(r.out);
 if(r.code!==0||!m){log('fetch',url,r.code,r.err.slice(-800));return {error:friendly(r.err)};}
 const f=m[1].trim();if(!fs.existsSync(f))return {error:'Sorry, that link wouldn\u2019t play.'};
 return {file:f};
});

/* ---------- temp housekeeping: old decode leftovers ---------- */
async function sweepTemp(keep){
 try{for(const n of await fsp.readdir(P.temp)){const f=path.join(P.temp,n);if(/^(decode|meta)-/.test(n)||(keep&&!keep.has(path.resolve(f)))){const st=await fsp.stat(f);if(Date.now()-st.mtimeMs>6*3600e3)await fsp.rm(f,{force:true});}}}catch{}
}
ipcMain.handle('pet:temp-sweep',async(e,files)=>{await sweepTemp(new Set((files||[]).map(f=>path.resolve(f))));return true;});
ipcMain.on('pet:log',(e,...a)=>log('page',...a.map(String)));

/* ---------- life cycle ---------- */
app.on('second-instance',()=>{if(win){if(!win.isVisible())toggleShown();}});
app.whenReady().then(()=>{
 Menu.setApplicationMenu(null);
 createWindow();buildTray();
 setTimeout(()=>prepareYtdlp().catch(e=>log('prepare',e.message)),8000);
});
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
