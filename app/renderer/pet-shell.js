/* Desk Phonograph: the window around the machine.
   Click-through: the page reads the alpha of the pixels under the cursor (a small padded
   square, the way the Beacons' HitPad grows the silhouette) and tells the main process
   whether that spot is solid; empty pixels let the click fall through to the desktop.
   Gestures: left-drag on the body/base moves the window (arm, record, sleeves, toy keep
   their own clicks first), scroll resizes, right-click opens the menu. The machine stays in
   one fixed three-quarter pose; only Inspect (double-click the record) turns and zooms. */
(() => {
'use strict';
const D=window.desk,V=()=>window.vinylView,P=()=>window.vinyl;
const $=id=>document.getElementById(id);
const bubble=$('bubble'),btext=$('bubbleText'),bar=$('bubbleBar');

/* ---------- speech bubble: short, plain-English messages ---------- */
let bubbleT=0,progressOn=false;
function say(text,kind='info'){
 clearTimeout(bubbleT);
 if(!text){if(!progressOn)bubble.hidden=true;return;}
 btext.textContent=text;bubble.dataset.kind=kind;bubble.hidden=false;bar.hidden=!progressOn;
 if(kind!=='busy')bubbleT=setTimeout(()=>{if(!progressOn)bubble.hidden=true;},kind==='error'?9000:kind==='hint'?5000:4000);
 hitDirty=true;
}
function progress(pct,title){
 if(pct==null){progressOn=false;bar.hidden=true;if(bubble.dataset.kind==='busy')bubble.hidden=true;return;}
 progressOn=true;bar.hidden=false;bar.style.setProperty('--p',Math.max(2,Math.min(100,pct))+'%');
 btext.textContent=title&&title!=='Record'?`Getting “${title}” ready… ${Math.round(pct)}%`:`Getting it ready… ${Math.round(pct)}%`;
 bubble.dataset.kind='busy';bubble.hidden=false;
}
bubble.addEventListener('click',()=>{bubble.hidden=true;});

/* ---------- per-pixel hit test ---------- */
let solid=false,lastX=-1,lastY=-1,hitT=0,hitDirty=false,holding=false;
const PAD=4,ALPHA=20;
const px=new Uint8Array((2*PAD+1)*(2*PAD+1)*4);
function solidAt(x,y){
 const el=document.elementFromPoint(x,y);
 if(el&&el!==document.body&&el.tagName!=='CANVAS'&&!el.closest('#view'))return true; // the bubble and other page bits
 const r=V()?.renderer;if(!r)return false;
 const gl=r.getContext(),dpr=r.getPixelRatio(),c=r.domElement;
 const cx=Math.round(x*dpr),cy=Math.round(c.height-y*dpr),n=2*PAD+1;
 const x0=Math.max(0,cx-PAD),y0=Math.max(0,cy-PAD),w=Math.min(c.width,cx+PAD+1)-x0,h=Math.min(c.height,cy+PAD+1)-y0;
 if(w<=0||h<=0)return false;
 try{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(x0,y0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);}catch{return true;}
 for(let i=3;i<w*h*4;i+=4)if(px[i]>ALPHA)return true;
 return false;
}
function setSolid(s){if(s!==solid){solid=s;D.solid(s);}}
function test(){hitT=0;if(holding||lastX<0){return;}setSolid(solidAt(lastX,lastY));}
document.addEventListener('mousemove',e=>{lastX=e.clientX;lastY=e.clientY;if(!hitT)hitT=setTimeout(test,30);},{passive:true});
document.addEventListener('mouseleave',()=>{lastX=-1;if(!holding)setSolid(false);});
// After the picture changes under a still cursor (it turned, a record arrived) re-test now and then.
function drew(){if(lastX>=0&&!holding&&!hitT){hitT=setTimeout(test,120);}}

/* ---------- moving the window (Beacons-style: slop, then the window follows the cursor) ---------- */
const SLOP=4;let mv=null;
function beginMove(e){
 const c=V().renderer.domElement;try{c.setPointerCapture(e.pointerId);}catch{}
 mv={id:e.pointerId,sx:e.screenX,sy:e.screenY,live:false};holding=true;setSolid(true);
}
window.addEventListener('pointermove',e=>{
 if(!mv||e.pointerId!==mv.id)return;
 if(!mv.live){if(Math.hypot(e.screenX-mv.sx,e.screenY-mv.sy)<SLOP)return;mv.live=true;D.moveStart(mv.sx,mv.sy);document.body.classList.add('moving');}
 D.move(e.screenX,e.screenY);
});
function endMove(){if(!mv)return;const live=mv.live;mv=null;holding=false;document.body.classList.remove('moving');if(live)D.moveEnd();hitDirty=true;setTimeout(test,60);}
window.addEventListener('pointerup',e=>{if(mv&&e.pointerId===mv.id)endMove();rightUp(e);});
window.addEventListener('pointercancel',()=>{endMove();right=null;});
window.addEventListener('blur',()=>{endMove();});

/* ---------- right-click = the menu (a press that wanders off is not a click) ---------- */
let right=null;
const view=$('view');
view.addEventListener('pointerdown',e=>{
 holding=true;setSolid(true);
 if(e.button===2)right={x:e.clientX,y:e.clientY,moved:false,e};
},{capture:true});
window.addEventListener('pointerup',()=>{if(!mv)holding=false;},{capture:false});
window.addEventListener('pointermove',e=>{if(right&&Math.hypot(e.clientX-right.x,e.clientY-right.y)>6)right.moved=true;});
function rightUp(e){if(e.button!==2||!right)return;const r=right;right=null;if(!r.moved)openMenu(r.e);}
window.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- scroll = size ---------- */
let wheelAcc=0,wheelT=0;
function wheel(e){
 wheelAcc+=e.deltaY*(e.deltaMode===1?33:1);
 if(Math.abs(wheelAcc)<60)return;const dir=Math.sign(wheelAcc);wheelAcc=0;
 const now=performance.now();if(now-wheelT<45)return;wheelT=now;
 D.resize(dir,e.clientX/innerWidth,e.clientY/innerHeight);
}

/* ---------- the right-click menu ---------- */
async function openMenu(e){
 const p=P(),v=V(),pick=e?v?.pickAt(e):null,ent=p?.entry;
 await D.menu({playing:!!p?.playing,record:!!p?.record,rpm:p?.rpm,volume:p?.volume,
  canKeep:ent?.kind==='link',kept:!!ent?.kept,sleeve:pick?.kind==='sleeve'&&!pick.obj.userData.empty?pick.obj.userData.sleeveId:null});
}
D.onCommand(async c=>{
 const p=P(),v=V();
 try{switch(c.cmd){
  case 'files':p.openPaths(c.paths);break;
  case 'link':p.playLink(c.text);break;
  case 'lift':p.lift();break;
  case 'drop':p.drop()?.catch?.(()=>{});break;
  case 'speed':if(c.normal)p.setSpeed(p.record.metadata.rpm_cut);else if(c.nudge)p.setSpeed(p.rpm+c.nudge*1.5);else p.setSpeed(c.rpm);say(`${p.rpm.toFixed(1).replace(/\.0$/,'')} rpm`,'hint');break;
  case 'volume':p.setVolume(c.value);say(c.value?`Volume ${Math.round(c.value*100)}%`:'Silent','hint');break;
  case 'inspect':if(!v.inspect.active)v.beginInspection();break;
  case 'keep':p.keepCurrent();break;
  case 'forget':p.forget(c.id);break;
  case 'autoNext':p.autoNext=c.on;say(c.on?'The next one will play by itself':'It will stop after each record','hint');break;
  case 'pip':setPip(c.on);break;
  case 'toy':v.swapToy();break;
  case 'say':say(String(c.text||''),c.kind||'info');break;
 }}catch(e){D.log('command',c&&c.cmd,e&&e.stack||String(e));say('That didn’t work just then. Give it another go.','error');}
});

/* ---------- needle close-up (corner overlay) ---------- */
function setPip(on){const b=$('needleView');if(b&&window.vinylNeedle&&window.vinylNeedle.on!==!!on)b.click();}

/* ---------- songs and links dropped or pasted on it ---------- */
document.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';document.body.classList.add('dropping');});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dropping');});
document.addEventListener('drop',e=>{
 e.preventDefault();document.body.classList.remove('dropping');
 const files=[...(e.dataTransfer.files||[])].map(f=>D.pathOf(f)).filter(Boolean);
 if(files.length){P().openPaths(files);return;}
 const t=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');
 if(t)P().playLink(t.split(/\r?\n/).find(l=>l&&!l.startsWith('#'))||t);
});
document.addEventListener('paste',e=>{const t=e.clipboardData?.getData('text/plain');if(t){e.preventDefault();P().playLink(t);}});
document.addEventListener('keydown',e=>{
 const p=P();if(!p)return;
 if(e.key===' '&&p.record){e.preventDefault();if(p.down)p.lift();else p.drop()?.catch?.(()=>{});}
 else if(e.key==='ArrowUp'||e.key==='ArrowDown'){p.setVolume(p.volume+(e.key==='ArrowUp'?.05:-.05));say(`Volume ${Math.round(p.volume*100)}%`,'hint');}
 else if((e.key==='['||e.key===']')&&p.record){p.setSpeed(p.rpm+(e.key===']'?1:-1));say(`${p.rpm.toFixed(1)} rpm`,'hint');}
});

/* ---------- start-up ---------- */
D.settings().then(st=>{
 try{localStorage.setItem('vinyl-needle-view',st.pip?'on':'off');}catch{}
 const s=document.createElement('script');s.src='static/needle-pip.js';document.body.appendChild(s);
});
const busyState=b=>document.body.classList.toggle('busy',!!b);
window.petShell={say,progress,wheel,beginMove,drew,busyState,playState(){},hit:solidAt,get solid(){return solid;},
 get busy(){return !!mv;}};
window.addEventListener('error',e=>D.log('error',e.message,e.filename,e.lineno));
window.addEventListener('unhandledrejection',e=>D.log('rejection',String(e.reason?.message||e.reason)));
})();
