// Dragging the pet: the window covers the screen's work area and never moves (a drag only moves the
// canvas inside it), the pet follows the cursor, no frame is blank, and the grabbed spot stays under
// the cursor. Box only: xvfb-run -a -s "-screen 0 1600x1000x24" node test/drag.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-drag-'));const out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-drag-out-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:400,y:260,width:440,height:393}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
const winB=()=>M(()=>global.__deskPhono.win.getBounds()),petB=()=>M(()=>({...global.__deskPhono.pet}));
await R(p=>window.vinyl.openPaths([p]),song);await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:90000});await R(()=>window.vinyl.setMuted?.(true));await wait(3000);
const w0=await winB(),p0=await petB();
const pt=await R(()=>{const v=window.vinylView;for(const [fx,fy] of [[.66,.62],[.7,.6],[.6,.6],[.72,.55]]){const c=v.renderer.domElement.getBoundingClientRect(),x=c.left+c.width*fx,y=c.top+c.height*fy;
 const k=v.pickAt({clientX:x,clientY:y});if(!k&&window.petShell.hit(x,y))return {x,y};}return null;});
ok(!!pt,'a spot on the body to grab');
await M(()=>{const w=global.__deskPhono.win;const o=w.__sb0||(w.__sb0=w.setBounds.bind(w));global.__sb=[];w.setBounds=(b,...a)=>{global.__sb.push(b);return o(b,...a);};});
const disp=process.env.DISPLAY,[SW,SH]=execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().trim().split('x').map(Number);
const raw=path.join(out,'frames.gray');
const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate','60','-video_size',`${SW}x${SH}`,'-i',disp,'-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
await wait(600);
const DX=180,DY=90,N=18;
await page.mouse.move(pt.x,pt.y);await page.mouse.down();for(let i=1;i<=N;i++){await page.mouse.move(pt.x+DX*i/N,pt.y+DY*i/N);await wait(30);}await wait(300);await page.mouse.up();await wait(800);
ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
const w1=await winB(),p1=await petB(),sb=await M(()=>global.__sb.length);
const py=`
import numpy as np,json
W,H=${SW},${SH};f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W)
xs=[];blank=0
for i in range(n):
  m=f[i]>14;c=np.where(m.any(0))[0]
  if len(c)<10: blank+=1;xs.append(None);continue
  xs.append(int(c[0]))
v=[x for x in xs if x is not None];steps=[abs(v[i]-v[i-1]) for i in range(1,len(v))]
print(json.dumps({'frames':n,'blank':blank,'left0':v[0],'left1':v[-1],'maxStep':max(steps) if steps else 0}))
`;
const a=JSON.parse(execFileSync('python3',['-c',py]).toString());
console.log('RESULT',JSON.stringify({w0,w1,p0,p1,setBounds:sb,screen:a}));
ok(Math.abs(p1.x-p0.x-DX)<=2&&Math.abs(p1.y-p0.y-DY)<=2,`the pet followed the cursor (${p1.x-p0.x}, ${p1.y-p0.y} for ${DX}, ${DY})`);
ok(sb===0&&w1.x===w0.x&&w1.y===w0.y&&w1.width===w0.width&&w1.height===w0.height,`the window never moved or resized (${sb} setBounds)`);
ok(a.blank===0,`no blank frames (${a.blank})`);
ok(Math.abs(a.left1-a.left0-DX)<=3,`on screen it moved ${a.left1-a.left0} px (largest step ${a.maxStep} px)`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
