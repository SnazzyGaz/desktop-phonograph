// Scroll-to-size: a 20-notch wheel burst over the cabinet (12 up, 8 down, 45 ms apart; WHEEL_UP=n for n up).
// Measures setBounds calls, page frame pacing, canvas reallocations, blank frames, and from a
// 60 fps X screen recording the pet's on-screen size per frame and how far the point under the
// cursor drifts. Box only: xvfb-run -a -s "-screen 0 1600x1000x24" node test/wheel.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-wheel-'));const out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-wheel-out-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:420,y:300,width:400,height:357}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
const winB=()=>M(()=>global.__deskPhono.win.getBounds());
const petB=()=>M(()=>global.__deskPhono.pet?{...global.__deskPhono.pet}:global.__deskPhono.win.getBounds());
await R(p=>window.vinyl.openPaths([p]),song);await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:90000});
await R(()=>window.vinyl.setMuted?.(true));await wait(3000);
const w0=await winB(),p0=await petB();
// a point on the cabinet's body (not the knob, keys or a sleeve), in page coordinates
const pt=await R(()=>{const v=window.vinylView;for(const [fx,fy] of [[.66,.62],[.7,.6],[.6,.6],[.72,.55]]){const c=v.renderer.domElement.getBoundingClientRect(),x=c.left+c.width*fx,y=c.top+c.height*fy;
 const k=v.pickAt({clientX:x,clientY:y});if((!k||k.kind==='arm')&&window.petShell.hit(x,y))return {x,y,kind:k?.kind||'body'};}return null;});
ok(!!pt,`a spot on the body to scroll over (${JSON.stringify(pt)})`);
// instrument: setBounds in main; frames, draws, canvas sizes and blanking in the page
await M(()=>{const w=global.__deskPhono.win;const o=w.__sb0||(w.__sb0=w.setBounds.bind(w));global.__sb=[];w.setBounds=(b,...a)=>{global.__sb.push({t:Date.now(),b:{...b}});return o(b,...a);};});
await R(()=>{const v=window.vinylView,c=v.renderer.domElement;const s=window.__wh={t:[],draws0:v.renderer.info.render.frame,sizes:new Set(),reallocs:0,last:c.width+'x'+c.height,blank:0,on:true};
 const f=t=>{if(!s.on)return;s.t.push(t);const k=c.width+'x'+c.height;if(k!==s.last){s.reallocs++;s.last=k;}if(document.documentElement.classList.contains('reframing'))s.blank++;requestAnimationFrame(f);};requestAnimationFrame(f);});
const disp=process.env.DISPLAY,dims=execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().trim().split('x').map(Number);const [SW,SH]=dims;
const raw=path.join(out,'frames.gray');
const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate','60','-video_size',`${SW}x${SH}`,'-i',disp,'-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
await wait(800);
const sx=w0.x+pt.x,sy=w0.y+pt.y; // the screen point under the cursor (stays put: we never move the mouse)
await page.mouse.move(pt.x,pt.y);await wait(300);
const T0=Date.now();
const UP=+process.env.WHEEL_UP||12; // notches up first (the rest down); WHEEL_UP=20 grows it to the largest size
for(let i=0;i<20;i++){await page.mouse.wheel(0,i<UP?-100:100);await wait(45);}
const T1=Date.now();await wait(1500);
const stat=await R(()=>{const s=window.__wh;s.on=false;const g=[];for(let i=1;i<s.t.length;i++)g.push(s.t[i]-s.t[i-1]);g.sort((a,b)=>a-b);const q=p=>g.length?+g[Math.min(g.length-1,Math.floor(p*g.length))].toFixed(1):null;
 return {frames:s.t.length,gapP50:q(.5),gapP95:q(.95),gapMax:g.length?+g[g.length-1].toFixed(1):null,over50:g.filter(x=>x>50).length,draws:window.vinylView.renderer.info.render.frame-s.draws0,reallocs:s.reallocs,blankFrames:s.blank};});
const sb=await M(()=>global.__sb.slice());ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
const w1=await winB(),p1=await petB();
const rs=await R(()=>{const v=window.vinylView,c=v.renderer.domElement,b=c.getBoundingClientRect();return {stage:v.stage,canvas:[b.left,b.top,b.width,b.height],buf:[c.width,c.height],tr:document.getElementById('view').style.transform,log:v.stageLog.slice(-3),inner:[innerWidth,innerHeight]};});console.log('RENDERER',JSON.stringify(rs));
const py=`
import numpy as np,json
W,H=${SW},${SH};f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W)
sx,sy=${Math.round(sx)},${Math.round(sy)}
rows=[]
for i in range(n):
  m=f[i]>14;ys=np.where(m.any(1))[0];xs=np.where(m.any(0))[0]
  if len(xs)<10: rows.append(None);continue
  rows.append((int(xs[0]),int(xs[-1]),int(ys[0]),int(ys[-1])))
first=next(r for r in rows if r);fx=(sx-first[0])/(first[1]-first[0]);fy=(sy-first[2])/(first[3]-first[2])
ws=[(r[1]-r[0]) if r else None for r in rows]
drift=[];steps=[];blank=sum(1 for r in rows if r is None)
for i,r in enumerate(rows):
  if not r: continue
  drift.append(max(abs(r[0]+fx*(r[1]-r[0])-sx),abs(r[2]+fy*(r[3]-r[2])-sy)))
for i in range(1,n):
  if ws[i] is not None and ws[i-1] is not None: steps.append(abs(ws[i]-ws[i-1]))
active=[i for i in range(1,n) if steps and ws[i] is not None and ws[i-1] is not None and ws[i]!=ws[i-1]]
a0,a1=(active[0],active[-1]) if active else (0,0)
seg=[abs(ws[i]-ws[i-1]) for i in range(a0,a1+1) if ws[i] is not None and ws[i-1] is not None]
print(json.dumps({'frames':n,'blank':blank,'widthFirst':ws[0],'widthMax':max(w for w in ws if w),'widthLast':ws[-1],'zoomFrames':a1-a0+1 if active else 0,
 'changedFrames':sum(1 for s in seg if s>0),'heldFrames':sum(1 for s in seg if s==0),'maxStep':max(seg) if seg else 0,'driftMax':round(max(drift),1),'driftP95':round(sorted(drift)[int(.95*len(drift))],1)}))
`;
const v=JSON.parse(execFileSync('python3',['-c',py]).toString());
const during=sb.filter(x=>x.t>=T0&&x.t<=T1+40).length;
console.log('RESULT',JSON.stringify({setBounds:sb.length,setBoundsDuringBurst:during,setBoundsSizes:[...new Set(sb.map(x=>x.b.width+'x'+x.b.height))].length,page:stat,screen:v,win:[w0,w1],pet:[p0,p1],burstMs:T1-T0}));
ok(p1.width!==p0.width,`the pet changed size (${p0.width} → ${p1.width})`);
ok(stat.blankFrames===0&&v.blank===0,`no blank frames (page ${stat.blankFrames}, screen ${v.blank})`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
