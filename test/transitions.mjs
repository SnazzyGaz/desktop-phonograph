// Every mode change keeps the pet still and never flashes: the crate fan (open/close), record
// Inspect (in/out), sleeve pop (click) and tuck (Esc), the sleeve hover title, playing a popped
// sleeve, and the dancer swap. Linux + xvfb + ffmpeg: records the X screen at 60 fps and
// checks every frame: the machine (around the volume knob, or the crate's front-left while a
// held record covers the knob) is where it was within 1 px, the pet is
// always drawn (no blank frame, no sudden dip in drawn pixels), and the window never changes.
// Then repeated fan/tuck cycles use exactly the records that exist and leave nothing behind.
// Usage: xvfb-run -a -s "-screen 0 1600x1000x24" node test/transitions.mjs song1.mp3 song2.mp3 ...
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const songs=process.argv.slice(2).map(p=>path.resolve(p));
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-tr-'));const out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-tr-out-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:560,y:330,width:440,height:393}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
const winB=()=>M(()=>global.__deskPhono.win.getBounds());
await R(p=>window.vinyl.openPaths(p),songs);
await page.waitForFunction(()=>window.vinyl.buffer&&window.vinyl.nowPlaying,null,{timeout:90000});
await page.waitForFunction(n=>window.vinyl.entries().filter(e=>e.artist).length>=n,songs.length-1,{timeout:90000}).catch(()=>{});
await R(()=>window.vinyl.setMuted?.(true));await wait(3000);
const W0=await winB();
const world=(f,a)=>R(f,a);
const knob=await R(()=>window.vinylView.knobPoint());
const crate=await R(()=>{const v=window.vinylView,T=v.THREE,o=v.sleevesGroup.getObjectByName('crate-front');o.updateMatrixWorld();return v.toClient(...o.getWorldPosition(new T.Vector3()).toArray());});
const disc=await R(()=>{const v=window.vinylView,T=v.THREE,d=v.scene.getObjectByName('record')||null;return v.toClient(0,0,0);});
const sw=await R(()=>{const v=window.vinylView,T=v.THREE,o=v.phonograph.getObjectByName('toy-switch');if(!o)return null;o.updateMatrixWorld();return v.toClient(...o.getWorldPosition(new T.Vector3()).toArray());});
const sleeveAt=()=>R(()=>{const v=window.vinylView,T=v.THREE;const ids=window.vinyl.allSleeves().map(s=>s.id);for(const id of ids){const p=v.jacketWorld(id);if(!p)continue;const c=v.toClient(p.x,p.y,p.z);const k=v.pickAt({clientX:c.x,clientY:c.y});if(k?.kind==='sleeve'&&!k.obj.userData.empty)return {id,x:c.x,y:c.y};}return null;});
const cab={x:Math.round(W0.x+knob.x-30),y:Math.round(W0.y+knob.y-24),w:60,h:48},cab2={x:Math.round(W0.x+crate.x-70),y:Math.round(W0.y+crate.y-10),w:44,h:36},cab3=sw?{x:Math.round(W0.x+sw.x-70),y:Math.round(W0.y+sw.y-40),w:50,h:36}:cab; // the knob; the crate's front-left (a held record covers the knob, a popped sleeve not the crate wall)
console.log('window',JSON.stringify(W0),'crops',JSON.stringify([cab,cab2,cab3]));
await M(()=>{const w=global.__deskPhono.win;const o=w.__sb0||(w.__sb0=w.setBounds.bind(w));global.__sb=[];w.setBounds=(b,...a)=>{global.__sb.push({t:Date.now(),b:{...b}});return o(b,...a);};});
const disp=process.env.DISPLAY,[SW,SH]=execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().trim().split('x').map(Number);
const raw=path.join(out,'frames.gray');
const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate','60','-video_size',`${SW}x${SH}`,'-i',disp,'-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
const t0=Date.now(),marks=[];const mark=m=>marks.push({m,t:(Date.now()-t0)/1000});
await page.mouse.move(2,2);await wait(1500);
mark('fan open');await page.mouse.dblclick(Math.round(crate.x),Math.round(crate.y));await page.mouse.move(2,2);
await page.waitForFunction(()=>window.vinylView.fan.on&&window.vinylView.fan.cards.length&&!window.vinylView.fan.cards.some(c=>c.moving),null,{timeout:30000}).catch(()=>{});await wait(700);
mark('fan close');await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.vinylView.fan.on,null,{timeout:20000}).catch(()=>{});await wait(900);
mark('inspect in');await page.mouse.dblclick(Math.round(disc.x),Math.round(disc.y));
await page.waitForFunction(()=>window.vinylView.inspect?.phase==='held',null,{timeout:30000}).catch(()=>{});await wait(900);
mark('inspect out');await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.vinylView.inspect?.active,null,{timeout:30000}).catch(()=>{});await page.mouse.move(2,2);await wait(1200);
const sl=await sleeveAt();ok(!!sl,'a sleeve to pop');
mark('sleeve hover');await page.mouse.move(sl.x,sl.y);await wait(900);
mark('sleeve pop');await page.mouse.click(sl.x,sl.y);await wait(1400);
mark('sleeve tuck');await page.keyboard.press('Escape');await wait(1200);
mark('sleeve pop 2');await page.mouse.click(sl.x,sl.y);await wait(1400);
mark('sleeve play');await page.mouse.click(sl.x,sl.y);await page.mouse.move(2,2);await wait(4000);
if(sw){mark('dancer swap');await page.mouse.click(Math.round(sw.x),Math.round(sw.y));await page.mouse.move(2,2);await wait(2500);}
mark('end');await wait(300);
ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
const sb=await M(()=>global.__sb.slice()),W1=await winB(),stats=await M(()=>global.__deskPhono.stageStats);
const py=`
import numpy as np,json
W,H=${SW},${SH};C=[${JSON.stringify(cab)},${JSON.stringify(cab2)},${JSON.stringify(cab3)}];f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W)
g=${JSON.stringify(W0)};x0,y0=max(0,g['x']),max(0,g['y']);x1,y1=min(W,g['x']+g['width']),min(H,g['y']+g['height'])
refs=[f[0,c['y']:c['y']+c['h'],c['x']:c['x']+c['w']].astype(np.int16) for c in C]
lit=np.array([float((f[i,y0:y1:2,x0:x1:2]>14).mean()) for i in range(n)])
res=[]
for i in range(n):
  near=1e9;far=1e9
  for c,ref in zip(C,refs):
    for dy in range(-6,7):
      for dx in range(-6,7):
        a=f[i,c['y']+dy:c['y']+dy+c['h'],c['x']+dx:c['x']+dx+c['w']].astype(np.int16);d=float(np.abs(a-ref).mean())
        if abs(dx)<=1 and abs(dy)<=1: near=min(near,d)
        else: far=min(far,d)
  if lit[i]<.002: res.append('blank');continue
  lo=lit[max(0,i-6):i].max() if i else lit[i];hi=lit[i+1:i+7].max() if i+1<n else lit[i]
  if i and lit[i]<.7*min(lo,hi): res.append('dip');continue
  res.append('same' if near<6 else ('off' if far<6 else 'covered')) # off: the machine is there, shifted; covered: something is in front of every crop
runs=[];prev=None
for i,s in enumerate(res):
  if s!=prev: runs.append([s,i,i]);prev=s
  else: runs[-1][2]=i
print(json.dumps({'frames':n,'same':res.count('same'),'covered':res.count('covered'),'blank':res.count('blank'),'dip':res.count('dip'),'off':res.count('off'),'runs':[r for r in runs if r[0]!='same'][:40]}))
`;
const a=JSON.parse(execFileSync('python3',['-c',py]).toString());
console.log('marks',JSON.stringify(marks));console.log('frames',JSON.stringify(a));console.log('stage',JSON.stringify(stats));
const at=fr=>{const t=fr/60;let m='start';for(const k of marks)if(k.t<=t+.05)m=k.m;return m;};
for(const r of a.runs)console.log(`INFO ${r[0]} frames ${r[1]}-${r[2]} (${at(r[1])})`);
ok(a.frames>60*8,`recorded ${a.frames} frames`);
ok(sb.length===0&&W1.x===W0.x&&W1.y===W0.y&&W1.width===W0.width&&W1.height===W0.height,`the window never changes (${sb.length} setBounds)`);
ok(a.blank===0&&a.dip===0,`no blank or flashing frames (blank ${a.blank}, dips ${a.dip})`);
ok(a.off===0,`the cabinet stays within 1 px through every transition (${a.same} in place, ${a.covered} behind a record or sleeve, ${a.off} shifted)`);
// ---- fan/tuck cycles: exactly the real records, nothing accumulates
const count=()=>R(()=>{const v=window.vinylView,s=v.sleevesGroup;let meshes=0;v.scene.traverse(o=>{if(o.isMesh)meshes++;});
 const ids=new Set(window.vinyl.allSleeves().map(x=>x.id)),racked=s.children.filter(o=>o.userData.racked&&ids.has(o.userData.sleeveId));return {fanGroups:v.scene.children.filter(o=>o.name==='fan').length,meshes,racked:racked.length,rackedVisible:racked.filter(o=>o.visible).length,records:window.vinyl.allSleeves().length};});
const before=await count();let maxCards=0,maxIn=0,allIn=[];
for(let k=0;k<5;k++){
 await R(()=>window.vinylView.fanOpen());await page.waitForFunction(()=>window.vinylView.fan.cards.length&&!window.vinylView.fan.cards.some(c=>c.moving),null,{timeout:30000}).catch(()=>{});await wait(200);
 const st=await R(()=>({cards:window.vinylView.fan.cards.length,groups:window.vinylView.scene.children.filter(o=>o.name==='fan').length}));
 maxCards=Math.max(maxCards,st.cards);if(st.groups!==1)ok(false,`cycle ${k+1}: ${st.groups} fan groups`);
 await R(()=>window.vinylView.fanClose());
 let peak=0;for(let i=0;i<30;i++){const s=await R(()=>window.vinylView.fanStats());peak=Math.max(peak,s.tucking);if(!s.open)break;await wait(25);}
 maxIn=Math.max(maxIn,peak);allIn.push(peak);
 await page.waitForFunction(()=>!window.vinylView.fan.on,null,{timeout:20000}).catch(()=>{});await wait(300);
}
const after=await count();
console.log('cycles',JSON.stringify({before,after,maxCards,tuckPeaks:allIn}));
ok(maxCards===before.records,`every cycle fans exactly the real records (${maxCards} cards for ${before.records} records)`);
ok(maxIn<=before.racked,`no ghost sleeves: at most ${maxIn} fly back into a crate holding ${before.racked}`);
ok(after.fanGroups===0&&after.meshes===before.meshes,`nothing accumulates after 5 cycles (meshes ${before.meshes} → ${after.meshes})`);
ok(after.rackedVisible===after.racked&&after.racked===before.racked,`the crate's sleeves are all back (${after.rackedVisible}/${after.racked})`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
