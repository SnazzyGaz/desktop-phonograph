// Start-up on Gaz's two screens: DISPLAY1 0,0 1920x1080 (work 1920x1040) and DISPLAY3 1920,0 1920x1080,
// both 100%, with the pet saved on the right one at {x:3143,y:434,width:594,height:530}. The screen is
// filmed from before launch: the window must not show anything big (the pet drawn at the size of the
// whole window, or an opaque frame), the pet must show up at its saved place and stay, and the app
// must still be running 10 s later.
// Box only: xvfb-run -a -s "-screen 0 3840x1080x24" node test/startup.mjs
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-start-')),out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-start-out-'));
// CASE=saved (his settings), none (no settings file: first start), offscreen (saved on a screen that is gone)
const CASE=process.env.CASE||'saved';
const SAVED={saved:{x:3143,y:434,width:594,height:530},none:{x:1420,y:617,width:440,height:393},offscreen:{x:1246,y:450,width:594,height:530}}[CASE];
if(CASE==='saved')fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:SAVED}));
if(CASE==='offscreen')fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:5200,y:300,width:594,height:530}}));
console.log('CASE',CASE,'pet expected at',JSON.stringify(SAVED));
const SCREENS=[{id:1,label:'DISPLAY1',primary:true,bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040}},
 {id:3,label:'DISPLAY3',bounds:{x:1920,y:0,width:1920,height:1080},workArea:{x:1920,y:0,width:1920,height:1040}}];
const disp=process.env.DISPLAY,[SW,SH]=execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().trim().split('x').map(Number);
// a compositor, as on Windows: a see-through window shows what is behind it (bare Xvfb paints it white before its first frame)
let comp=null;if(!process.env.NO_COMPOSITOR){try{comp=spawn('picom',['--backend','xrender','--config','/dev/null'],{stdio:'ignore'});}catch{}await new Promise(r=>setTimeout(r,1200));}
process.on('exit',()=>{try{comp?.kill();}catch{}});
const raw=path.join(out,'start.gray'),FPS=30;
const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate',String(FPS),'-video_size',`${SW}x${SH}`,'-i',disp,'-vf','scale=iw/2:ih/2','-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
await new Promise(r=>setTimeout(r,800));
const t0=Date.now();
const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args:[root,'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],
 env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1',DESK_PHONO_FAKE_SCREENS:JSON.stringify(SCREENS)}});
let exited=false;app.process().on('exit',()=>{exited=true;});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await new Promise(r=>setTimeout(r,Number(process.env.WAIT_MS)||18000)); // (software GL on the box: the first frames take a while to reach the screen)
const alive=!exited&&await app.evaluate(()=>true).catch(()=>false);
const st=alive?await app.evaluate(()=>{const d=global.__deskPhono,w=d.win;return {pet:d.pet,stage:d.stage,win:w.getBounds(),visible:w.isVisible(),shownAt:d.shownAt,showWhy:d.showWhy,stats:{...d.stageStats}};}):null;
const pg=alive?await page.evaluate(()=>({px:getComputedStyle(document.documentElement).getPropertyValue('--px'),view:document.getElementById('view').getBoundingClientRect().toJSON(),hidden:document.documentElement.classList.contains('handoff')})):null;
ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
const py=`
import numpy as np,json
W,H=${SW>>1},${SH>>1};f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W)
res=[]
for i in range(n):
  m=f[i]>14;c=np.where(m.any(0))[0];r=np.where(m.any(1))[0]
  if len(c)<5: res.append(None);continue
  res.append([int(c[0])*2,int(r[0])*2,int(c[-1]-c[0])*2,int(r[-1]-r[0])*2,int(m.sum())*4])
print(json.dumps(res))
`;
const fr=JSON.parse(execFileSync('python3',['-c',py],{maxBuffer:1e8}).toString());if(process.env.KEEP)console.log("RAW",raw);else fs.rmSync(raw,{force:true});
const seen=fr.filter(Boolean),first=fr.findIndex(Boolean);
const big=seen.filter(b=>b[2]>SAVED.width*1.25||b[3]>SAVED.height*1.25||b[4]>SAVED.width*SAVED.height*1.1);
const tail=fr.slice(-FPS*2).filter(Boolean),last=tail[tail.length-1];
const misplaced=fr.slice(first).filter(b=>b&&(Math.abs(b[0]-SAVED.x)>SAVED.width*.4||Math.abs(b[1]-SAVED.y)>SAVED.height*.4));
const gaps=fr.slice(first).filter(b=>!b).length;
console.log('RESULT',JSON.stringify({frames:fr.length,firstSeen:first,big:big.slice(0,4),last,misplaced:misplaced.length,gaps,state:st,page:pg}));
ok(alive,`the app is still running ${(Number(process.env.WAIT_MS)||18000)/1000} s after start (it did not quit on its own)`);
ok(seen.length>0&&first>=0,`the pet showed up (first seen ${((first/FPS)).toFixed(1)} s into filming)`);
ok(!big.length,`nothing bigger than the pet was ever on screen (${big.length} big frames${big.length?': '+JSON.stringify(big[0]):''})`);
ok(!misplaced.length,`the pet was only ever seen at its saved place (${misplaced.length} frames elsewhere)`);
ok(!gaps,`once shown it never vanished (${gaps} empty frames after it appeared)`);
ok(tail.length>=FPS*1.5&&last&&Math.abs(last[0]-SAVED.x)<SAVED.width*.3&&Math.abs(last[1]-SAVED.y)<SAVED.height*.3,`the pet is on screen at the end, at its saved place (${JSON.stringify(last)})`);
ok(st&&st.pet&&st.pet.x===SAVED.x&&st.pet.y===SAVED.y&&st.pet.width===SAVED.width,`the pet's rect is the saved one (${JSON.stringify(st&&st.pet)})`);
ok(st&&st.visible&&st.win.x<=SAVED.x&&st.win.x+st.win.width>=SAVED.x+SAVED.width,`the window is shown and holds the pet (${JSON.stringify(st&&st.win)})`);
ok(st&&st.showWhy==='drawn',`the window was first shown because the page said the pet is drawn in place, not by a fallback (${st&&st.showWhy})`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
const log=fs.existsSync(path.join(data,'log.txt'))?fs.readFileSync(path.join(data,'log.txt'),'utf8'):'';
ok(!/menu Quit/.test(log),'nothing asked to quit');if(process.env.LOG)console.log(log);
if(alive)await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
