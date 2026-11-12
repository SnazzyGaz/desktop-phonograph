// Scratching: grab the spinning record and swing it back and forth, at the pet's default size and
// after scrolling it smaller and bigger. Measures that the record (and so the audio position) follows
// the hand angle at once, what the drag costs the main process (IPC messages, window calls) and the
// page (canvas reallocations, pixel-ratio changes, draws per second), the frame gaps, and page errors.
// SCALE=1.5 runs it on a high-DPI screen (where the pixel ratio could adapt mid-drag).
// Linux + xvfb: xvfb-run -a -s "-screen 0 1600x1000x24" node test/scratch.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-scratch-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:420,y:300,width:440,height:393}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader',...(process.env.SCALE?['--force-device-scale-factor='+process.env.SCALE]:[])],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
await R(p=>window.vinyl.openPaths([p]),song);await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:90000});await wait(1500);if(!await R(()=>window.vinyl.down))await R(()=>window.vinyl.drop()?.catch?.(()=>{}));await page.waitForFunction(()=>window.vinyl.down,null,{timeout:20000});
await R(()=>window.vinyl.setMuted?.(true));await wait(2500);
// Like Windows at 125%/150% scaling: the window's bounds read back 1 px off what was set. (1.0.6
// compared them exactly and re-set the whole-screen window on every mouse move of a drag.)
if(!process.env.EXACT_BOUNDS)await M(()=>{const w=global.__deskPhono.win,gb=w.getBounds.bind(w);w.getBounds=()=>{const b=gb();return {...b,x:b.x+1,width:b.width-1};};});
// main-process meters: every IPC message from the page, every window call that touches the OS window
await M(({ipcMain})=>{const g=global.__sm={ipc:{},win:{},on:false};const w=global.__deskPhono.win;
 w.webContents.on('ipc-message',(e,ch)=>{if(g.on)g.ipc[ch]=(g.ipc[ch]||0)+1;});w.webContents.on('ipc-message-sync',(e,ch)=>{if(g.on)g.ipc['sync:'+ch]=(g.ipc['sync:'+ch]||0)+1;});
 for(const [ch,fn] of ipcMain._invokeHandlers||[])ipcMain._invokeHandlers.set(ch,(...a)=>{if(g.on)g.ipc['invoke:'+ch]=(g.ipc['invoke:'+ch]||0)+1;return fn(...a);});
 for(const k of ['setIgnoreMouseEvents','setBounds','setShape','setPosition','setSize','setContentBounds','setAlwaysOnTop','setOpacity','focus','blur','moveTop']){if(typeof w[k]!=='function')continue;const o=w[k].bind(w);w[k]=(...a)=>{if(g.on)g.win[k]=(g.win[k]||0)+1;return o(...a);};}});
async function zoomTo(notches){ // scroll over the cabinet body, wait for the settle
 if(!notches)return;const pt=await R(()=>{const v=window.vinylView;for(const [fx,fy] of [[.66,.62],[.7,.6],[.6,.6],[.72,.55]]){const c=v.renderer.domElement.getBoundingClientRect(),x=c.left+c.width*fx,y=c.top+c.height*fy;const k=v.pickAt({clientX:x,clientY:y});if(!k&&window.petShell.hit(x,y))return {x,y};}return null;});
 await page.mouse.move(pt.x,pt.y);for(let i=0;i<Math.abs(notches);i++){await page.mouse.wheel(0,notches<0?-100:100);await wait(45);}await page.waitForFunction(()=>!window.vinylView.zoomState.on,null,{timeout:30000});await wait(300);}
async function scratch(label){
 // a short test song may have played out: put the needle back near the start so the record turns
 await R(async()=>{const v=window.vinyl;if(!v.down||v.time()>v.buffer.duration-10){if(v.down)v.lift();await v.drop(1)?.catch?.(()=>{});}});
 await page.waitForFunction(()=>window.vinyl.down,null,{timeout:20000});await wait(400);
 // points on the record, in page pixels, for a hand angle (world: the disc's plane at its top face)
 const geo=await R(()=>{const v=window.vinylView,T=v.THREE,m=window.vinyl.record.metadata,r=(m.label_radius_mm+m.r_start_mm)/2,z=m.thickness_mm||2.5;
  v.scene.updateMatrixWorld(true);const c=v.renderer.domElement.getBoundingClientRect();
  // a stretch of groove clear of the tone arm (which would take the press), the speech bubble, and in sight
  for(let s=0;s<40;s++){const a0=-Math.PI+s*Math.PI/20,pts=[];let clear=true;
   for(let i=0;i<=72&&clear;i++){const a=a0+i/72*Math.PI*.6,p=new T.Vector3(r*Math.cos(a),r*Math.sin(a),z).project(v.camera),x=c.left+(p.x+1)/2*c.width,y=c.top+(1-p.y)/2*c.height;
    if(x<c.left+4||y<c.top+4||x>c.right-4||y>c.bottom-4||v.pickAt({clientX:x,clientY:y})||document.elementFromPoint(x,y)!==v.renderer.domElement)clear=false;pts.push({a,x,y});}
   if(clear)return {pts,a0,canvas:[c.width,c.height],dpr:v.renderer.getPixelRatio()};}
  return null;});
 if(!geo){ok(false,label+': a stretch of the record clear of the arm');return;}
 const P=geo.pts;
 await page.mouse.move(P[0].x,P[0].y);await wait(400);
 await R(()=>{const v=window.vinylView,c=v.renderer.domElement,s=window.__sc={t:[],realloc:0,last:c.width+'x'+c.height,dpr0:v.renderer.getPixelRatio(),dprCh:0,draws0:v.renderer.info.render.frame,on:true,rects:0,moves:0,handler:[]};
  const gb=Element.prototype.getBoundingClientRect;if(!window.__gbw){window.__gbw=1;Element.prototype.getBoundingClientRect=function(){if(window.__sc?.on)window.__sc.rects++;return gb.call(this);};}
  if(!window.__pmw){window.__pmw=1;window.addEventListener('pointermove',()=>{const s=window.__sc;if(s?.on){s.moves++;s.pm0=performance.now();}},{capture:true});
   window.addEventListener('pointermove',()=>{const s=window.__sc;if(s?.on&&s.pm0)s.handler.push(performance.now()-s.pm0);},{capture:false});}
  const f=t=>{if(!s.on)return;s.t.push(t);const k=c.width+'x'+c.height;if(k!==s.last){s.realloc++;s.last=k;}if(Math.abs(v.renderer.getPixelRatio()-s.dpr0)>.01)s.dprCh++;requestAnimationFrame(f);};requestAnimationFrame(f);});
 await page.mouse.down();await wait(80); // (the press itself may make the window take clicks: one call, before the meters start)
 await M(()=>{global.__sm.ipc={};global.__sm.win={};global.__sm.on=true;});
 await R(()=>{window.__sc.p0=window.vinylView.perf.log.length?window.vinylView.perf.log[window.vinylView.perf.log.length-1][0]:0;});
 const rot0=await R(()=>window.vinyl.state.rotation);const lag=[];const pos=[];const grabbed=[];
 // forward 0..72, back to 10, forward to 50: about 4 s of hand motion at ~16 ms a step
 const path=[];for(let i=2;i<=72;i+=2)path.push(i);for(let i=70;i>=10;i-=2)path.push(i);for(let i=12;i<=50;i+=2)path.push(i);
 const pos0=await R(()=>window.vinyl.time());
 for(const i of path){await page.mouse.move(P[i].x,P[i].y);const st=await R(()=>({r:window.vinyl.state.rotation,t:window.vinyl.time(),g:window.vinyl.state.grabbed}));
  lag.push(Math.abs((st.r-rot0)-(P[i].a-P[0].a)));grabbed.push(st.g?1:0);pos.push(st.t);await wait(16);}
 const m=await R(()=>window.vinyl.record.metadata.rpm_cut);
 await page.mouse.up();
 const st=await R(()=>{const s=window.__sc;s.on=false;const g=[];for(let i=1;i<s.t.length;i++)g.push(s.t[i]-s.t[i-1]);g.sort((a,b)=>a-b);const q=p=>g.length?+g[Math.min(g.length-1,Math.floor(p*g.length))].toFixed(1):null;
  const h=s.handler.slice().sort((a,b)=>a-b),dl=window.vinylView.perf.log.filter(x=>x[0]>s.p0).map(x=>x[0]-x[1]);let minGap=Infinity;for(let i=1;i<dl.length;i++)minGap=Math.min(minGap,dl[i]-dl[i-1]);
  return {frames:s.t.length,draws:window.vinylView.renderer.info.render.frame-s.draws0,gapP50:q(.5),gapMax:g.length?+g[g.length-1].toFixed(1):null,realloc:s.realloc,dprChanges:s.dprCh,moves:s.moves,rectsPerMove:+(s.rects/Math.max(1,s.moves)).toFixed(1),handlerP95:h.length?+h[Math.floor(h.length*.95)].toFixed(2):null,drawMinGap:+minGap.toFixed(1),held:window.vinylView.perf.post.held};});
 const sm=await M(()=>{global.__sm.on=false;return {ipc:global.__sm.ipc,win:global.__sm.win};});
 await wait(600);
 const expectT=(P[50].a-P[0].a)/(2*Math.PI)*60/m,gotT=pos[pos.length-1]-pos0;
 const ipcN=Object.values(sm.ipc).reduce((a,b)=>a+b,0),winN=Object.values(sm.win).reduce((a,b)=>a+b,0);
 const maxLag=Math.max(...lag);if(process.env.DEBUG)console.log('LAG',label,JSON.stringify({a0:geo.a0,lag:lag.map(x=>+x.toFixed(3)),g:grabbed}));
 console.log('RESULT',label,JSON.stringify({canvas:geo.canvas,dpr:geo.dpr,maxLagRad:+maxLag.toFixed(4),posMoved:+gotT.toFixed(3),posExpected:+expectT.toFixed(3),...st,ipc:sm.ipc,win:sm.win}));
 ok(maxLag<.02,`${label}: the record follows the hand at once (worst ${maxLag.toFixed(4)} rad behind)`);
 ok(Math.abs(gotT-expectT)<Math.max(.03,Math.abs(expectT)*.05),`${label}: the playback position moved ${gotT.toFixed(3)} s for ${expectT.toFixed(3)} s of groove swept`);
 ok(st.realloc===0&&st.dprChanges===0,`${label}: no canvas reallocations or pixel-ratio changes (${st.realloc}, ${st.dprChanges})`);
 ok(st.drawMinGap>=20,`${label}: draws at most ~40 fps under the hand (closest two draws ${st.drawMinGap} ms apart)`);
 ok(winN===0,`${label}: no window calls during the scratch (${JSON.stringify(sm.win)})`);
 ok(ipcN<=4,`${label}: at most a few IPC messages to the main process (${ipcN}: ${JSON.stringify(sm.ipc)})`);
 return st;
}
await scratch('default size');
if(process.env.ONLY){await app.close();process.exit(fails?1:0);}
await zoomTo(-5);await scratch('scrolled bigger');
await zoomTo(10);await scratch('scrolled smaller');
// After all that grabbing there is still one draw loop: while it only spins, about 30 draws a second.
{await page.mouse.move(5,5);await wait(800);const d=await R(async()=>{const l=window.vinylView.perf.log,t0=performance.now(),n0=l.length?l[l.length-1][0]:0;await new Promise(r=>setTimeout(r,2000));
 const ts=window.vinylView.perf.log.map(x=>x[0]).filter(t=>t>n0&&t>t0);let close=0;for(let i=1;i<ts.length;i++)if(ts[i]-ts[i-1]<8)close++;return {perSec:ts.length/2,close};});
 console.log('RESULT idle spin',JSON.stringify(d));ok(d.close===0&&d.perSec<=34,`one draw loop after the scratches (${d.perSec} draws/s while spinning, ${d.close} back-to-back)`);}
// A press on a stopped record moves the pet instead: the window itself must not be moved or resized per mouse move.
{await R(()=>window.vinyl.lift());await wait(1200);
 const p=await R(()=>{const v=window.vinylView,T=v.THREE,m=window.vinyl.record.metadata,z=m.thickness_mm||2.5,c=v.renderer.domElement.getBoundingClientRect();v.scene.updateMatrixWorld(true);
  for(let s=0;s<24;s++){const a=s/24*Math.PI*2,r=(m.label_radius_mm+m.r_start_mm)/2,q=new T.Vector3(r*Math.cos(a),r*Math.sin(a),z).project(v.camera),x=c.left+(q.x+1)/2*c.width,y=c.top+(1-q.y)/2*c.height;if(!v.pickAt({clientX:x,clientY:y}))return {x,y};}return null;});
 if(p){await page.mouse.move(p.x,p.y);await wait(300);await page.mouse.down();await wait(80);
  await M(()=>{global.__sm.ipc={};global.__sm.win={};global.__sm.on=true;});const sb0=await M(()=>global.__deskPhono.stageStats.setBounds);
  for(let i=1;i<=30;i++){await page.mouse.move(p.x+i*4,p.y+i*2);await wait(16);}await page.mouse.up();await wait(300);
  const sm=await M(()=>{global.__sm.on=false;return {ipc:global.__sm.ipc,win:global.__sm.win,sb:global.__deskPhono.stageStats.setBounds};});
  console.log('RESULT pet drag',JSON.stringify({...sm,sb0}));ok(!sm.win.setBounds&&sm.sb===sb0,`dragging the pet by a stopped record never moves the window (${sm.win.setBounds||0} setBounds over ${sm.ipc['pet:move']||0} moves)`);}
 else ok(false,'a spot on the stopped record');}
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
