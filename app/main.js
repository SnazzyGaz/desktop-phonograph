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
const {readClipboardLink}=require('./clip-link');
const Cover=require('./cover');
const Limits=require('./limits');

app.setAppUserModelId?.('app.deskphonograph.pet');
if(process.env.DESK_PHONO_DATA)app.setPath('userData',process.env.DESK_PHONO_DATA); // tests: a throwaway data folder
if(!app.requestSingleInstanceLock()){app.quit();return;}

const DATA=app.getPath('userData');
const P={settings:path.join(DATA,'settings.json'),library:path.join(DATA,'library.json'),covers:path.join(DATA,'covers'),
 records:path.join(DATA,'records'),temp:path.join(app.getPath('temp'),'DeskPhonograph'),bin:path.join(DATA,'bin'),log:path.join(DATA,'log.txt')};
for(const d of [P.covers,P.records,P.temp,P.bin])fs.mkdirSync(d,{recursive:true});
function log(...a){try{fs.appendFileSync(P.log,new Date().toISOString()+' '+a.join(' ')+'\n');}catch{}}
try{const st=fs.statSync(P.log);if(st.size>2e6)fs.writeFileSync(P.log,'');}catch{}
let oopsAt=0;
function oops(what,e){
 log('error',what,e&&e.stack||String(e));
 if(Date.now()-oopsAt<3000)return;oopsAt=Date.now();
 try{send('pet:command',{cmd:'say',kind:'error',text:'Something went wrong there. It’s been noted in the log; give it another go.'});}catch{}
}
process.on('uncaughtException',e=>oops('uncaught',e)); // replaces Electron's modal error box
process.on('unhandledRejection',e=>oops('unhandled',e));
// Every menu and tray item goes through here: a click is logged, and one that throws (now or later) says so in the pet instead of crashing.
function guard(items){
 return items.map(it=>{
  const o={...it};if(o.submenu)o.submenu=guard(o.submenu);
  if(typeof it.click==='function'){const f=it.click,label=it.label||'item';o.click=(...a)=>{log('menu',label);try{const r=f(...a);if(r&&typeof r.catch==='function')r.catch(e=>oops('menu '+label,e));}catch(e){oops('menu '+label,e);}};}
  return o;});
}
let clip=clipboard,popupMenu=null,trayMenu=null,popups=0; // menus kept referenced while they are up

/* ---------- settings ---------- */
const DEFAULTS={bounds:null,onTop:true,autoNext:true,volume:.8,muted:false,shuffle:false,repeat:'off',toy:'hula',ytdlpChecked:0};
let settings={...DEFAULTS};
try{settings={...DEFAULTS,...JSON.parse(fs.readFileSync(P.settings,'utf8'))};delete settings.pose;delete settings.pip;}catch{} // old settings: a turned pose (1.0.0), the needle close-up (to 1.0.2)
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
let bounds=null; // the pet's own rect on screen (DIP); what is saved, sized and kept on screen
/* The stage: the window covers the work area of the screen the pet is on (transparent; empty pixels
   click through) and the page draws the pet where it is. So scroll-to-size, the fan, the
   sleeves and dragging within a screen never resize or move the window (nothing can jump or blank);
   only crossing to another screen moves it. A stage exactly the size of the whole monitor (taskbar
   hidden) is kept 1 px smaller so Windows never takes it for a full-screen app. */
let stage=null,off={x:0,y:0},stageFixAt=0,awayStrikes=0;const stageStats={setBounds:0,moved:0,resized:0};
/* Several screens. Since 1.0.9 each screen has its own stage again and crossing to another screen is
   a hand-off (see setStage); the shared stage below is off unless settings.sharedStage is true: a
   window over two screens (3840 px wide on a pair of HD screens) started blank on a two-screen PC in 1.0.8.
   Shared stage: neighbouring screens at the same display scaling share one stage (the box round
   their work areas), so walking the pet from one to the other never moves the window at all: no
   hand-off, nothing to flash, and the pet is whole while it straddles the join. Screens at different
   scaling can't share a window (Windows gives a window one scale), so crossing to one of those moves
   the window, with a hand-off that never shows the pet in the wrong place (see setStage). The shared
   stage is kept within a size the graphics card handles comfortably. */
const STAGE_MAX_PX=8192,STAGE_MAX_AREA=2.2; // physical px per side; times the pet's own screen's area
const touch=(a,b)=>a.x<=b.x+b.width+2&&b.x<=a.x+a.width+2&&a.y<=b.y+b.height+2&&b.y<=a.y+a.height+2;
function boxOf(rs){const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return {x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};}
function stageGroup(b){
 const c={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)},d=screen.getDisplayNearestPoint(c);
 if(!settings.sharedStage)return [d];
 let all=[];try{all=screen.getAllDisplays();}catch{}
 const sf=d.scaleFactor||1,same=all.filter(o=>o.id!==d.id&&(o.scaleFactor||1)===sf);
 const fits=g=>{const bx=boxOf(g.map(o=>o.workArea));return bx.width*sf<=STAGE_MAX_PX&&bx.height*sf<=STAGE_MAX_PX&&bx.width*bx.height<=STAGE_MAX_AREA*d.workArea.width*d.workArea.height;};
 const g=[d];for(let grew=true;grew;){grew=false;for(const o of same)if(!g.includes(o)&&g.some(x=>touch(x.bounds,o.bounds))&&fits([...g,o])){g.push(o);grew=true;}}
 return g;
}
function stageFor(b){
 const g=stageGroup(b),wa=boxOf(g.map(o=>o.workArea));
 // never exactly cover a whole screen (Windows would take it for a full-screen app)
 if(g.some(o=>{const w=o.workArea,db=o.bounds;return w.x===db.x&&w.y===db.y&&w.width===db.width&&w.height===db.height;})){wa.x++;wa.y++;wa.width-=2;wa.height-=2;}
 return wa;
}
function layout(){return {ox:off.x,oy:off.y,w:bounds.width,h:bounds.height,min:MIN,max:MAX,aspect:ASPECT};}
function setStage(s,quiet){
 // Only touch the OS window when the stage we want changed, or something else really moved it (by
 // more than a few px). The bounds read back are not always what was set (rounded at 125%/150%
 // display scaling, or the window manager's say): comparing them exactly with the stage moved and
 // resized the whole-screen window on every mouse move of a drag (a whole-PC stall).
 const live=win&&!win.isDestroyed(),cur=live?win.getBounds():null,eq=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
 const off8=!!(cur&&stage&&(Math.abs(cur.x-stage.x)>8||Math.abs(cur.y-stage.y)>8||Math.abs(cur.width-stage.width)>8||Math.abs(cur.height-stage.height)>8));if(!off8)awayStrikes=0;
 // (at most once a second if it keeps reading back elsewhere, and not at all once three tries haven't stuck:
 // the system may simply not give us that size)
 const away=off8&&awayStrikes<3&&Date.now()-stageFixAt>1000;
 if(!stage||!eq(s,stage)||away){if(away){stageFixAt=Date.now();awayStrikes++;stageStats.awayFixes=(stageStats.awayFixes||0)+1;log('stage','window read back at',JSON.stringify(cur),'not',JSON.stringify(stage));}
  // Moving the window to another screen: the page first shows nothing and says so, then the window
  // moves and the page draws the pet at its new place. (Moving it straight away would show the old
  // picture at the new place for a frame or two: a ghost of the pet on the other screen.)
  if(live&&stage&&!away&&!eq(s,stage)&&handoffOK&&win.isVisible()){handoff(s);return;}
  if(stage&&(s.width!==stage.width||s.height!==stage.height))stageStats.resized++;else if(stage)stageStats.moved++;
  stage={...s};stageStats.setBounds++;if(live)win.setBounds(stage);}
 if(handing)return; // the page is blank until the hand-off ends; it gets the new place then
 const o={x:bounds.x-stage.x,y:bounds.y-stage.y},sized=bounds.width!==off.w||bounds.height!==off.h;
 if(o.x!==off.x||o.y!==off.y||sized){off={...o,w:bounds.width,h:bounds.height};if(!quiet)send('pet:stage',layout());}
}
let handing=null,handoffOK=false,handN=0;
function handoff(s){
 if(handing){handing.want=s;return;}
 const n=++handN;handing={n,want:s};stageStats.handoffs=(stageStats.handoffs||0)+1;
 send('pet:stage-hold',n);
 handing.timer=setTimeout(()=>finishHandoff(n,true),150); // a page that doesn't answer still gets moved
}
function finishHandoff(n,late){
 if(!handing||handing.n!==n)return;clearTimeout(handing.timer);handing=null;
 if(late)stageStats.lateHandoffs=(stageStats.lateHandoffs||0)+1;
 const s=stageFor(bounds);if(!stage||s.x!==stage.x||s.y!==stage.y||s.width!==stage.width||s.height!==stage.height){
  if(stage&&(s.width!==stage.width||s.height!==stage.height))stageStats.resized++;else stageStats.moved++;
  stage={...s};stageStats.setBounds++;stageFixAt=Date.now();if(win&&!win.isDestroyed())win.setBounds(stage);}
 off={x:bounds.x-stage.x,y:bounds.y-stage.y,w:bounds.width,h:bounds.height};send('pet:stage',{...layout(),reveal:n,at:{x:stage.x,y:stage.y}});
}
ipcMain.on('pet:stage-held',(e,n)=>finishHandoff(n,false));
ipcMain.on('pet:stage-handoff-ok',()=>{handoffOK=true;}); // the page can hold and reveal (sent once it has drawn)
function place(b,save=true,opt={}){
 bounds={x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)};
 setStage(stageFor(bounds),opt.quiet);
 if(save){settings.bounds={...bounds};saveSettings();}
}
/* Windows: the stage is a tool window (WS_EX_TOOLWINDOW). Other Chromium-based apps (Chrome, Edge,
   Discord, VS Code...) stop drawing when they think another window covers them, and they count any
   visible window as covering them unless it is click-through, translucent or a tool window. While the
   pointer is on the pet the stage is not click-through, so a whole-screen stage counted as covering
   every app below it; clicking the pet (a foreground change) made them re-check then, and they stayed
   "hidden" after the pointer left (going click-through again is not an event they watch): scrolling
   one did scroll it, but nothing was drawn until a click on it made them re-check. A tool window never
   counts, and it also keeps the pet out of Alt+Tab. */
const STAGE_TYPE=process.platform==='win32'?{type:'toolbar'}:{};
function createWindow(){
 const b=firstBounds();bounds=b;stage=stageFor(b);off={x:b.x-stage.x,y:b.y-stage.y,w:b.width,h:b.height};
 win=new BrowserWindow({...stage,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
  hasShadow:false,skipTaskbar:true,alwaysOnTop:settings.onTop,show:false,title:'Desk Phonograph',icon:iconPath(),...STAGE_TYPE,
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true,spellcheck:false,
   additionalArguments:['--dp-stage='+JSON.stringify(layout())]}}); // the page knows where the pet goes before its first frame
 if(settings.onTop)win.setAlwaysOnTop(true,'floating');
 win.setIgnoreMouseEvents(true,{forward:true}); // until the page has drawn and can hit-test
 win.loadFile(path.join(__dirname,'renderer','index.html'));
 // Shown only once the page says the pet is drawn at its place (nothing big, nothing blank, nothing
 // opaque); a page that never says so is shown anyway after a while (it can still talk in its bubble).
 shown=false;win.once('ready-to-show',()=>{readyAt=Date.now();clearTimeout(showT);showT=setTimeout(()=>showFirst('late'),SHOW_LATE_MS);});
 setTimeout(()=>showFirst('very late'),20000); // not even a first paint
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('render-process-gone',(e,d)=>{log('renderer gone',d.reason,loadingId?'while putting on '+loadingId:'');crashGuard();if(!quitting)setTimeout(()=>win?.reload(),800);});
 screen.on('display-removed',()=>place(clampHome({...bounds})));
 screen.on('display-metrics-changed',()=>place(keepOnScreen({...bounds})));
}
let shown=false,showT=null,readyAt=0,showWhy='';const SHOW_LATE_MS=6000,startedAt=Date.now();
function showFirst(why){
 if(shown||!win||win.isDestroyed())return;shown=true;showWhy=why;clearTimeout(showT);
 if(win.isVisible())return; // already shown from the tray meanwhile
 win.showInactive();if(settings.onTop)win.setAlwaysOnTop(true,'floating');
 setTimeout(()=>{if(!win||win.isDestroyed())return;const cur=win.getBounds();let n=0;try{n=screen.getAllDisplays().length;}catch{}
  log('start',why,(Date.now()-startedAt)+'ms','screens',n,'stage',JSON.stringify(stage),'window',JSON.stringify(cur),'pet',JSON.stringify(bounds));
  place({...bounds},false);},400); // the window read back elsewhere? setStage puts it right (and logs it)
}
ipcMain.on('pet:placed',()=>showFirst('drawn'));
if(process.env.DESK_PHONO_TEST)app.on('browser-window-created',(e,w)=>w.on('show',()=>{global.__shownAt=Date.now();}));
function iconPath(){return path.join(__dirname,'build',process.platform==='win32'?'icon.ico':'icon.png');}
function send(ch,...a){if(win&&!win.isDestroyed())win.webContents.send(ch,...a);}

/* click-through toggled by the page's hit test */
let ignoring=true;
ipcMain.on('pet:solid',(e,solid)=>{if(!win)return;const ig=!solid;if(ig!==ignoring){ignoring=ig;win.setIgnoreMouseEvents(ig,{forward:true});}});

/* ---------- moving: Beacons-style drag + fling ---------- */
let mv=null,fling=null;
// The fan open: no window drags (the page draws in the headroom round the pet).
let room=null;
ipcMain.handle('pet:room',(e,step)=>{ // the page uses its headroom; here it only stops drags meanwhile
 if(step==='grow'){room=true;stopFling();mv=null;}else if(step==='shrink')room=null;
 return true;
});
ipcMain.handle('pet:stage',()=>bounds?layout():null);
ipcMain.on('pet:move-start',(e,sx,sy)=>{if(room)return;stopFling();mv={sx,sy,x0:bounds.x,y0:bounds.y,trail:[{x:sx,y:sy,t:Date.now()}]};});
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

/* ---------- resizing: the page scales the pet while the wheel turns, then sends its new rect once ---------- */
ipcMain.handle('pet:zoom-to',(e,r)=>{
 if(!stage||!r)return bounds?layout():null;
 const w=Math.max(MIN,Math.min(MAX,Math.round(r.w))),h=Math.round(w/ASPECT);
 stopFling();place(keepOnScreen({x:stage.x+Math.round(r.ox),y:stage.y+Math.round(r.oy),width:w,height:h}),true,{quiet:true});
 return layout();
});

/* ---------- tray + menus ---------- */
function toggleShown(){if(!win)return;shown=true;clearTimeout(showT);if(win.isVisible())win.hide();else{win.showInactive();if(settings.onTop)win.setAlwaysOnTop(true,'floating');}buildTray();}
function buildTray(){
 if(!tray){tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'build',process.platform==='win32'?'tray.ico':'tray.png')));tray.setToolTip('Desk Phonograph');tray.on('click',toggleShown);}
trayMenu=Menu.buildFromTemplate(guard([
  {label:win?.isVisible()?'Hide the phonograph':'Show the phonograph',click:toggleShown},
  {label:'Play a song from this computer…',click:()=>{if(!win.isVisible())toggleShown();openFiles();}},
  {label:'Play a web link from the clipboard',click:()=>{if(!win.isVisible())toggleShown();pasteLink();}},
  {type:'separator'},
  {label:'Play / Pause',click:()=>send('pet:command',{cmd:'transport',what:'toggle'})},
  {label:'Next record',click:()=>send('pet:command',{cmd:'transport',what:'next'})},
  {label:'Previous record',click:()=>send('pet:command',{cmd:'transport',what:'prev'})},
  {label:'Shuffle',type:'checkbox',checked:!!settings.shuffle,click:m=>setShuffle(m.checked)},
  {label:'Repeat',submenu:repeatItems()},
  {type:'separator'},
  {label:'Put it back on screen',click:()=>{const wa=screen.getPrimaryDisplay().workArea;place(keepOnScreen({x:wa.x+wa.width-bounds.width-60,y:wa.y+wa.height-bounds.height-30,width:bounds.width,height:bounds.height}));if(!win.isVisible())toggleShown();}},
  {label:'Quit Desk Phonograph',click:quit}]));
 tray.setContextMenu(trayMenu);
}
function quit(){quitting=true;app.quit();}
// Shuffle / Repeat live here (saved) and in the page (what plays next); the tray shows the same ticks.
function setShuffle(on){settings.shuffle=!!on;saveSettings();send('pet:command',{cmd:'shuffle',on:!!on});buildTray();}
function setRepeat(mode){settings.repeat=mode;saveSettings();send('pet:command',{cmd:'repeat',mode});buildTray();}
const REPEATS=[['off','Off'],['all','All records'],['one','This record']];
function repeatItems(){return REPEATS.map(([k,l])=>({label:l,type:'radio',checked:(settings.repeat||'off')===k,click:()=>setRepeat(k)}));}
async function openFiles(){
 const r=await dialog.showOpenDialog(win,{title:'Choose songs to play',properties:['openFile','multiSelections'],
  filters:[{name:'Songs',extensions:['mp3','wav','flac','ogg','oga','opus','m4a','aac','wma','webm','mp4']},{name:'Any file',extensions:['*']}]});
 if(!r.canceled&&r.filePaths.length)send('pet:command',{cmd:'files',paths:r.filePaths});
}
async function pasteLink(){
 let text='';try{text=String(await readClipboardLink(clip)||'').trim();}catch(e){log('clipboard',e&&e.message);}
 send('pet:command',{cmd:'link',text}); // the page says what to do when there is no link
}
ipcMain.handle('pet:menu',(e,st)=>{
 st=st||{};
 const tmpl=[
  {label:'Play this record now',visible:!!st.sleeve,click:()=>send('pet:command',{cmd:'playNow',id:st.sleeve})},
  {label:'Play next',visible:!!st.sleeve,click:()=>send('pet:command',{cmd:'playNext',id:st.sleeve})},
  {type:'separator',visible:!!st.sleeve},
  {label:st.playing?'Pause':'Play',enabled:!!st.record||!!st.count,click:()=>send('pet:command',{cmd:'transport',what:'toggle'})},
  {label:'Next record',enabled:!!st.count&&st.hasNext!==false,click:()=>send('pet:command',{cmd:'transport',what:'next'})},
  {label:'Previous record',enabled:!!st.record,click:()=>send('pet:command',{cmd:'transport',what:'prev'})},
  {label:'Shuffle',type:'checkbox',checked:!!settings.shuffle,click:m=>setShuffle(m.checked)},
  {label:'Repeat',submenu:repeatItems()},
  {label:'Volume',submenu:[
   {label:'Mute',type:'checkbox',checked:!!st.muted,click:m=>send('pet:command',{cmd:'mute',on:m.checked})},
   {type:'separator'},
   ...[25,50,75,100].map(v=>({label:v+'%',type:'radio',checked:!st.muted&&Math.abs(Math.round((st.volume??.8)*100)-v)<=12,click:()=>send('pet:command',{cmd:'volume',value:v/100})}))]},
  {label:'Spread out the records',enabled:(st.count||0)>1,click:()=>send('pet:command',{cmd:'fan'})},
  {type:'separator'},
  {label:'Play a song from this computer…',click:openFiles},
  {label:'Play a web link (from the clipboard)',click:()=>pasteLink()},
  {type:'separator'},
  {label:'Speed',enabled:!!st.record,submenu:[
   {label:'33⅓ rpm',type:'radio',checked:Math.abs((st.rpm||0)-33.333)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:100/3})},
   {label:'45 rpm',type:'radio',checked:Math.abs((st.rpm||0)-45)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:45})},
   {label:'78 rpm',type:'radio',checked:Math.abs((st.rpm||0)-78)<.2,click:()=>send('pet:command',{cmd:'speed',rpm:78})},
   {type:'separator'},
   {label:'A little faster',click:()=>send('pet:command',{cmd:'speed',nudge:1})},
   {label:'A little slower',click:()=>send('pet:command',{cmd:'speed',nudge:-1})},
   {label:'Back to normal speed',click:()=>send('pet:command',{cmd:'speed',normal:true})}]},
  {type:'separator'},
  {label:'Keep this record',type:'checkbox',visible:!!st.canKeep,checked:!!st.kept,click:()=>send('pet:command',{cmd:'keep'})},
  {label:'Put this record away',visible:!!st.sleeve,click:()=>send('pet:command',{cmd:'forget',id:st.sleeve})},
  {label:'Play the next one automatically',type:'checkbox',checked:settings.autoNext,click:m=>{settings.autoNext=m.checked;saveSettings();send('pet:command',{cmd:'autoNext',on:m.checked});}},
  {label:'Swap toy (hula girl / shiba)',click:()=>send('pet:command',{cmd:'toy'})},
  {label:'Always on top',type:'checkbox',checked:settings.onTop,click:m=>{settings.onTop=m.checked;saveSettings();win.setAlwaysOnTop(m.checked,'floating');send('pet:command',{cmd:'say',kind:'hint',text:m.checked?'Stays on top of other windows':'Other windows can cover it now'});}},
  {type:'separator'},
  {label:'Hide (click the tray icon to bring it back)',click:toggleShown},
  {label:'Quit',click:quit}];
 const m=Menu.buildFromTemplate(guard(tmpl));popupMenu=m;popups++;
 m.popup({window:win,callback:()=>{setTimeout(()=>{if(popupMenu===m)popupMenu=null;},1500);}});
 return true;
});
ipcMain.handle('pet:settings',()=>({...settings}));
// The shiba's baked mesh. The page is a file:// page and fetch() can't read file:// URLs, so it asks here.
ipcMain.handle('pet:toy-data',async()=>{try{return await fsp.readFile(path.join(__dirname,'renderer','static','shiba.bin'));}catch(e){log('shiba.bin',e&&e.message);return null;}});
ipcMain.on('pet:set',(e,patch)=>{if(patch&&typeof patch==='object'){for(const k of ['volume','muted','toy','autoNext','shuffle','repeat'])if(k in patch)settings[k]=patch[k];saveSettings();}});
ipcMain.handle('pet:clipboard',async()=>{try{return String(await readClipboardLink(clip)||'').trim();}catch(e){log('clipboard',e&&e.message);return '';}});

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
  path:x.path?String(x.path):null,url:x.url?String(x.url).slice(0,2000):null,kept:!!x.kept,duration:Number(x.duration)||0,added:Number(x.added)||Date.now(),used:Number(x.used)||0,queue:x.queue||null,qIndex:Number.isFinite(x.qIndex)?x.qIndex:null,bad:x.bad?true:undefined,
  thumbs:Array.isArray(x.thumbs)?x.thumbs.filter(u=>typeof u==='string'&&/^https?:\/\//i.test(u)).slice(0,16).map(u=>u.slice(0,2000)):undefined}));
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
 const args=['-hide_banner','-loglevel','error','-y','-i',file,'-vn','-map','0:a:0'];if(mono)args.push('-ac','1');else args.push('-ac','2');if(rate)args.push('-ar',String(rate));args.push('-t',String(Limits.MAX_SEC+1),'-c:a','pcm_s16le','-f','wav',out);
 const r=await run(ffmpegPath(),args,{timeout:10*60e3});
 if(r.code!==0||!fs.existsSync(out)){log('transcode',file,r.err.slice(-500));return {error:'That file doesn\u2019t seem to have any sound I can play.'};}
 try{const b=await fsp.readFile(out);return {bytes:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}finally{fsp.rm(out,{force:true}).catch(()=>{});}
});
// How long a file is and how big, from its header only (nothing decoded): checked before it is read.
ipcMain.handle('pet:duration',async(e,file)=>{
 let size=0;try{const st=await fsp.stat(file);if(!st.isFile())throw Error('not a file');size=st.size;}
 catch(err){return {error:err.code==='ENOENT'?'That song isn\u2019t where it used to be. It may have been moved or deleted.':'That file couldn\u2019t be opened.'};}
 if(size>AUDIO_MAX)return {error:'That file is too big to play as a record.',size};
 const r=await run(ffmpegPath(),['-hide_banner','-nostdin','-i',file],{timeout:30e3});
 return {duration:Limits.parseDuration(r.err),size};
});
/* Crash-loop guard. The page says which record it is putting on (reading, decoding, first drawing).
   If the page crashes then, that record is marked bad in the library so it is not put on again by
   itself; two crashes within a minute and the page starts with nothing playing. */
let loadingId=null,crashes=[],quietStart=false,lastBad=null;
ipcMain.on('pet:loading',(e,id)=>{loadingId=safeId(id)?String(id):null;});
ipcMain.handle('pet:boot',()=>{const r={quiet:quietStart,bad:lastBad};lastBad=null;return r;});
function crashGuard(){
 const now=Date.now();crashes=crashes.filter(t=>now-t<60e3);crashes.push(now);
 if(crashes.length>=2)quietStart=true;
 const id=loadingId;loadingId=null;if(id){lastBad=id;markBad(id);}
}
function markBad(id){
 try{const list=JSON.parse(fs.readFileSync(P.library,'utf8'));let hit=false;
  for(const x of Array.isArray(list)?list:[])if(x&&x.id===id){x.bad=true;hit=true;}
  if(hit){fs.writeFileSync(P.library+'.tmp',JSON.stringify(list,null,1));fs.renameSync(P.library+'.tmp',P.library);log('marked bad',id);}
 }catch(err){log('mark bad',err.message);}
}
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
ipcMain.handle('pet:image',(e,url)=>Cover.fetchImage(url,u=>net.fetch(u)));
// A link's cover: the first of its candidate pictures that really is one ({index, dataUrl} or null).
ipcMain.handle('pet:cover-from',(e,cands)=>Cover.firstImage((Array.isArray(cands)?cands:[]).slice(0,20),u=>net.fetch(u)));
// Candidate pictures for a link we only have the address of (records saved before 1.0.8). deep: ask the site.
ipcMain.handle('pet:link-thumbs',async(e,url,deep)=>{
 const quick=Cover.thumbCandidates({},url);if(!deep||!/^https?:\/\//i.test(String(url)))return quick;
 const r=await run(ytdlpPath(),['--no-playlist','-J','--skip-download','--no-warnings','--ignore-config',url],{timeout:60e3});
 if(r.code!==0){log('link-thumbs',url,r.err.slice(-300));return quick;}
 try{const j=JSON.parse(r.out);return [...new Set([...Cover.thumbCandidates(j,url),...quick])].slice(0,16);}catch{return quick;}
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
function ytdlpPath(){if(process.env.DESK_PHONO_TEST&&process.env.DESK_PHONO_YTDLP)return process.env.DESK_PHONO_YTDLP;return ytGood||bundled('yt-dlp');}
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
 if(/HTTP Error 404|not found|has been removed|deleted|terminated/i.test(e))return 'That link doesn\u2019t go anywhere any more.';
 if(/Sign in|\blog ?in\b|members-only|age-restricted|\bage\b.{0,20}(verif|restrict|confirm)|confirm your age|--cookies|private video/i.test(e))return 'That one needs someone to sign in, so it can\u2019t be played here.'; /* not plain "age": it is in "webpage" */
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
 const pick=x=>({url:x.webpage_url||x.url||x.original_url,id:x.id,title:x.track||x.title||'',artist:x.artist||x.uploader||x.channel||'',duration:x.duration||0,thumbs:Cover.thumbCandidates(x,x.webpage_url||x.url)});
 if(j._type==='playlist'&&Array.isArray(j.entries)){
  const all=j.entries.filter(x=>x&&(x.url||x.webpage_url)&&!/\[(Private|Deleted) video\]/i.test(x.title||'')).map(pick);
  if(!all.length)return {error:'That list is empty, or nothing in it can be played.'};
  const {keep:entries,skipped}=Limits.splitList(all);
  if(!entries.length)return {error:Limits.LIST_TOO_LONG,tooLong:true};
  return {kind:'list',title:j.title||'',entries,skipped};
 }
 if(j.is_live)return {error:friendly('is live')};
 if(Limits.tooLong(j.duration))return {error:Limits.TOO_LONG,tooLong:true};
 return {kind:'one',...pick(j),thumbs:Cover.thumbCandidates(j,j.webpage_url||url),url:j.webpage_url||url};
});
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
  '--ffmpeg-location',path.dirname(ffmpegPath()),'--max-filesize','1500m','--match-filter','duration <=? '+Limits.MAX_SEC,'-o',base+'.%(ext)s',
  '--print','after_move:@@FILE %(filepath)s','--progress','--newline','--progress-template','download:@@PCT %(progress._percent_str)s',url];
 const job={cancel:false};jobs.set(jobId,job);
 const r=await run(ytdlpPath(),args,{timeout:30*60e3,onLine:l=>{const m=/@@PCT\s*([\d.]+)%/.exec(l);if(m)progress(Number(m[1]),'fetching');}});
 jobs.delete(jobId);
 const m=/@@FILE (.+)/.exec(r.out);
 if(!m&&/does not pass filter/i.test(r.out+r.err)){log('fetch too long',url);return {error:Limits.TOO_LONG,tooLong:true};}
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
// Tests only (never set in normal use): reach the menus as built, and stand in a fake clipboard.
if(process.env.DESK_PHONO_TEST)global.__deskPhono={get popup(){return popupMenu;},get popups(){return popups;},get tray(){return trayMenu;},setClipboard(c){clip=c||clipboard;},readLink:()=>readClipboardLink(clip),get win(){return win;},get ignoring(){return ignoring;},stageType:STAGE_TYPE,get pet(){return bounds;},get stage(){return stage;},get shownAt(){return global.__shownAt||0;},get placedShow(){return shown;},get showWhy(){return showWhy;},stageStats,stageFor:b=>stageFor(b||bounds),setShared(v){settings.sharedStage=!!v;},place:b=>place(b,false)};
// Tests only: stand in a given set of screens (as screen.getAllDisplays gives them) from the start.
function fakeScreens(list){
 const all=()=>list.map(d=>({scaleFactor:1,rotation:0,internal:false,touchSupport:'unknown',...d,size:{width:d.bounds.width,height:d.bounds.height},workAreaSize:{width:d.workArea.width,height:d.workArea.height}}));
 const near=p=>{const a=all();return a.find(d=>p.x>=d.bounds.x&&p.x<d.bounds.x+d.bounds.width&&p.y>=d.bounds.y&&p.y<d.bounds.y+d.bounds.height)||a.reduce((b,d)=>{const dx=Math.max(d.bounds.x-p.x,0,p.x-d.bounds.x-d.bounds.width),dy=Math.max(d.bounds.y-p.y,0,p.y-d.bounds.y-d.bounds.height),k=dx*dx+dy*dy;return !b||k<b.k?{d,k}:b;},null).d;};
 screen.getAllDisplays=all;screen.getPrimaryDisplay=()=>all().find(d=>d.primary)||all()[0];screen.getDisplayNearestPoint=near;
 screen.getDisplayMatching=r=>near({x:r.x+r.width/2,y:r.y+r.height/2});
}
app.on('second-instance',()=>{if(win){if(!win.isVisible())toggleShown();}});
app.whenReady().then(()=>{
 Menu.setApplicationMenu(null);
 if(process.env.DESK_PHONO_TEST&&process.env.DESK_PHONO_FAKE_SCREENS)fakeScreens(JSON.parse(process.env.DESK_PHONO_FAKE_SCREENS));
 createWindow();buildTray();
 setTimeout(()=>prepareYtdlp().catch(e=>log('prepare',e.message)),8000);
});
// Windows can quietly drop a window's topmost flag (another topmost window, a full-screen app, a
// display change); then the menu's tick and the window disagree and the first click seems to do nothing.
setInterval(()=>{try{if(win&&!win.isDestroyed()&&settings.onTop&&win.isVisible()&&!win.isAlwaysOnTop()){win.setAlwaysOnTop(true,'floating');log('always on top: put back');}}catch(e){oops('ontop',e);}},3000);
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
