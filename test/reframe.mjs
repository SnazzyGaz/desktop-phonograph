// The pet must not jump when its window grows for the fan or Inspect, or shrinks back.
// Box only (Linux + xvfb + ffmpeg): records the X screen at 60 fps across fan open/close and
// inspect in/out, then checks every frame: the cabinet is where it was (within 1 px), or the
// pet is briefly not drawn at all; never drawn anywhere else. Also checks repeated fan/tuck
// cycles use exactly the records that exist and leave nothing behind.
// Usage: xvfb-run -a -s "-screen 0 1280x900x24" node test/reframe.mjs song1.mp3 song2.mp3 ...
//   (PLAYWRIGHT=path to playwright-core, DESK_EXE=a built app instead of the source)
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const songs=process.argv.slice(2).map(p=>path.resolve(p));
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-reframe-'));const out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-reframe-out-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:560,y:430,width:440,height:393}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
const bounds=()=>M(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
await R(p=>window.vinyl.openPaths(p),songs);
await page.waitForFunction(()=>window.vinyl.buffer&&window.vinyl.nowPlaying,null,{timeout:90000});
await page.waitForFunction(n=>window.vinyl.entries().filter(e=>e.artist).length>=n,songs.length-1,{timeout:90000}).catch(()=>{});
await R(h=>{window.vinyl.setMuted?.(true);if(h)window.__reframeHold=h;},+process.env.REFRAME_HOLD||0);await wait(3000);
const pt=name=>R(n=>{const v=window.vinylView,T=v.THREE;const o=(v.sleevesGroup.getObjectByName(n)||v.phonograph.getObjectByName(n));o.updateMatrixWorld();const p=o.getWorldPosition(new T.Vector3());return v.toClient(p.x,p.y,p.z);},name);
const b0=await bounds(),crate=await pt('crate-front'),drawer=await pt('now-playing'),disc=await R(()=>{const v=window.vinylView;return v.toClient(0,0,0);});
// the cabinet's front (the Now Playing drawer and the keys) in screen pixels
const cab={x:Math.round(b0.x+drawer.x-70),y:Math.round(b0.y+drawer.y-26),w:140,h:52};
console.log('window',JSON.stringify(b0),'cabinet crop',JSON.stringify(cab));
// ---- record the screen
const disp=process.env.DISPLAY,raw=path.join(out,'frames.gray');
const W=+execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().split('x')[0]||1280,H=+execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().split('x')[1]||900;
const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-framerate','60','-video_size',`${W}x${H}`,'-i',disp,'-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
const t0=Date.now(),marks=[];const mark=m=>marks.push({m,t:(Date.now()-t0)/1000});
await wait(1200);mark('fan open');
await page.mouse.dblclick(Math.round(crate.x),Math.round(crate.y));await page.mouse.move(2,2);
await page.waitForFunction(()=>window.vinylView.fan.on&&window.vinylView.fan.cards.length&&!window.vinylView.fan.cards.some(c=>c.moving),null,{timeout:30000}).catch(()=>{});
await wait(700);const grown=await bounds();mark('fan close');await page.keyboard.press('Escape');
await page.waitForFunction(()=>!window.vinylView.fan.on,null,{timeout:20000}).catch(()=>{});await wait(900);
// the window growing for Inspect, without Inspect's camera flight (which moves the picture on purpose)
mark('room grow');await R(()=>window.vinylView.petRoom(true,'test'));await wait(900);
mark('room shrink');await R(()=>window.vinylView.petRoom(false,'test'));await wait(1200);
ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
ok(grown.width>b0.width&&grown.height>b0.height,`the fan grew the window (${b0.width}x${b0.height} → ${grown.width}x${grown.height})`);
const back=await bounds();ok(back.x===b0.x&&back.y===b0.y&&back.width===b0.width&&back.height===b0.height,'the window is back where it was');
// ---- every frame: cabinet in place (±1 px), or the pet not drawn; never elsewhere
const py=`
import numpy as np,json,sys
W,H=${W},${H};c=${JSON.stringify(cab)};f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W).astype(np.int16)
win=${JSON.stringify(b0)};g=${JSON.stringify(grown)}
ref=f[0,c['y']:c['y']+c['h'],c['x']:c['x']+c['w']]
bg=np.median(f[0,0:20,0:20])
res=[]
for i in range(n):
  best=1e9
  for dy in (-1,0,1):
    for dx in (-1,0,1):
      a=f[i,c['y']+dy:c['y']+dy+c['h'],c['x']+dx:c['x']+dx+c['w']];best=min(best,float(np.abs(a-ref).mean()))
  if best<6: res.append('same');continue
  # not in place: is the pet drawn anywhere in the grown window's area?
  r=f[i,g['y']:g['y']+g['height'],g['x']:g['x']+g['width']]
  drawn=float(((r>20)&(r<235)).mean()) # the pet has mid-tones; an empty window is flat black, or white where X paints it
  res.append('blank' if drawn<.002 else 'moved')
runs=[];prev=None
for i,s in enumerate(res):
  if s!=prev: runs.append([s,i,i]);prev=s
  else: runs[-1][2]=i
print(json.dumps({'frames':n,'same':res.count('same'),'blank':res.count('blank'),'moved':res.count('moved'),'runs':[r for r in runs if r[0]!='same'][:20]}))
`;
const a=JSON.parse(execFileSync('python3',['-c',py]).toString());
console.log('marks',JSON.stringify(marks));console.log('reframes',JSON.stringify(await R(()=>window.vinylView.reframeLog)));console.log('frames',JSON.stringify(a));
ok(a.frames>60*4,`recorded ${a.frames} frames`);
ok(a.moved===0,`the pet never jumps (frames: ${a.same} in place ±1 px, ${a.blank} not drawn, ${a.moved} elsewhere)`);
{const gaps=a.runs.filter(r=>r[0]==='blank').map(r=>r[2]-r[1]+1);console.log(`INFO blank gaps (frames at 60 fps; software GL on the box, a real GPU is far quicker): ${gaps.join(', ')||'none'}`);}
// ---- fan/tuck cycles: exactly the real records, nothing accumulates
const count=()=>R(()=>{const v=window.vinylView,s=v.sleevesGroup;let meshes=0;v.scene.traverse(o=>{if(o.isMesh)meshes++;});
 const ids=new Set(window.vinyl.allSleeves().map(x=>x.id)),racked=s.children.filter(o=>o.userData.racked&&ids.has(o.userData.sleeveId));return {fanGroups:v.scene.children.filter(o=>o.name==='fan').length,meshes,racked:racked.length,rackedVisible:racked.filter(o=>o.visible).length,records:window.vinyl.allSleeves().length};});
const before=await count();let maxCards=0,maxIn=0,allIn=[];
for(let k=0;k<5;k++){
 await R(()=>window.vinylView.fanOpen());await page.waitForFunction(()=>window.vinylView.fan.cards.length&&!window.vinylView.fan.cards.some(c=>c.moving),null,{timeout:30000}).catch(()=>{});await wait(200);
 const st=await R(()=>({cards:window.vinylView.fan.cards.length,groups:window.vinylView.scene.children.filter(o=>o.name==='fan').length,flown:window.vinylView.fanStats()}));
 maxCards=Math.max(maxCards,st.cards);if(st.groups!==1)ok(false,`cycle ${k+1}: ${st.groups} fan groups`);
 await R(()=>window.vinylView.fanClose());
 // during the tuck: how many cards are visible and flying back into the crate
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
{const e=await R(()=>{const s=window.vinylView.sleevesGroup;return s.children.filter(o=>o.userData.racked).every(o=>o.visible);});ok(e,'every sleeve in the crate (the playing record\'s empty one too) is showing');}
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
