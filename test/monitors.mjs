// Two screens: walking the pet across the join. The screens are faked in the main process on one wide
// Xvfb screen (3200x1000): A 0-1599 and B 1600-3199. Since 1.0.9 each screen has its own stage: same
// scaling or not, crossing is one hand-off and the pet is never drawn in the wrong place (0 ghost
// frames; blank frames are counted). The shared stage (opt-in, settings.sharedStage): the window never
// moves (0 setBounds), no blank frames, no jumps.
// Linux + xvfb: xvfb-run -a -s "-screen 0 3200x1000x24" node test/monitors.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {spawn,execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-mon-')),out=fs.mkdtempSync(path.join(os.tmpdir(),'dp-mon-out-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:900,y:400,width:440,height:393}}));
const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args:[root,'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
await R(p=>window.vinyl.openPaths([p]),song);await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:90000});await R(()=>window.vinyl.setMuted?.(true));await wait(2500);
// fake screens: B's scaling is set per scenario
await M(({screen})=>{
 const mk=(id,x,sf)=>({id,scaleFactor:sf,bounds:{x,y:0,width:1600,height:1000},workArea:{x,y:0,width:1600,height:960},size:{width:1600,height:1000},workAreaSize:{width:1600,height:960},rotation:0,internal:false,monochrome:false,accelerometerSupport:'unknown',touchSupport:'unknown',colorDepth:24,colorSpace:'',depthPerComponent:8,displayFrequency:60,label:'fake'+id});
 global.__fake={sfB:1,all(){return [mk(1,0,1),mk(2,1600,this.sfB)];}};
 screen.getAllDisplays=()=>global.__fake.all();screen.getPrimaryDisplay=()=>global.__fake.all()[0];
 screen.getDisplayNearestPoint=p=>{const a=global.__fake.all();return p.x>=1600?a[1]:a[0];};
 screen.getDisplayMatching=r=>screen.getDisplayNearestPoint({x:r.x+r.width/2,y:r.y+r.height/2});
 const w=global.__deskPhono.win,o=w.setBounds.bind(w);global.__sb=[];w.setBounds=(b,...a)=>{global.__sb.push({...b,t:Date.now()});return o(b,...a);};
});
const disp=process.env.DISPLAY,[SW,SH]=execFileSync('sh',['-c',`xdpyinfo -display ${disp} | awk '/dimensions/{print $2}'`]).toString().trim().split('x').map(Number);
async function walk(name,sfB,shared=false){
 await M((x,[sf,sh])=>{global.__fake.sfB=sf;global.__deskPhono.setShared(sh);const d=global.__deskPhono;d.place({x:900,y:400,width:d.pet.width,height:d.pet.height});},[sfB,shared]);
 await wait(1200);await M(()=>{global.__sb.length=0;Object.assign(global.__deskPhono.stageStats,{handoffs:0,lateHandoffs:0});});const st0=await M(()=>({...global.__deskPhono.stage}));const sb0=0;
 const raw=path.join(out,name+'.gray');
 const ff=spawn('ffmpeg',['-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate','60','-video_size',`${SW}x${SH}`,'-i',disp,'-pix_fmt','gray','-f','rawvideo',raw],{stdio:['pipe','inherit','inherit']});
 await R(()=>{window.__sl=[];if(!window.__slOn){window.__slOn=1;window.desk.onStage(s=>window.__sl.push([performance.now()|0,s.ox,s.reveal??null,window.screenX,document.documentElement.classList.contains('handoff')]));}});
 await wait(700);
 const N=40,DX=1000;
 await M(({ipcMain})=>ipcMain.emit('pet:move-start',{},1000,500));
 for(let i=1;i<=N;i++){await M(({ipcMain},x)=>ipcMain.emit('pet:move',{},x,500),1000+DX*i/N);await wait(35);}
 await wait(150);await M(({ipcMain})=>ipcMain.emit('pet:move-end',{}));await wait(1500);
 ff.stdin.write('q');await new Promise(r=>ff.on('exit',r));
 const sb=await M(()=>global.__sb.length),st=await M(()=>({...global.__deskPhono.stageStats})),p1=await M(()=>({...global.__deskPhono.pet})),st1=await M(()=>({...global.__deskPhono.stage}));
 if(process.env.SL)console.log('SL',name,JSON.stringify(await R(()=>window.__sl)));
 const hv=await R(()=>({...window.vinylView.handoffs,last:undefined}));
 const py=`
import numpy as np,json
W,H=${SW},${SH};f=np.fromfile(${JSON.stringify(raw)},dtype=np.uint8);n=f.size//(W*H);f=f[:n*W*H].reshape(n,H,W)
xs=[];ws=[]
for i in range(n):
  m=f[i]>14;c=np.where(m.any(0))[0]
  xs.append(int(c[0]) if len(c)>=10 else None);ws.append(int(c[-1]-c[0]) if len(c)>=10 else 0)
first=next(i for i,x in enumerate(xs) if x is not None)
s=[i for i in range(1,n) if xs[i] is not None and xs[i-1] is not None and xs[i]!=xs[i-1]]
a=s[0]-1 if s else first;b=s[-1] if s else n-1
blank=sum(1 for i in range(a,b+1) if xs[i] is None)
v=[(i,xs[i]) for i in range(a,b+1) if xs[i] is not None]
jumps=sum(1 for k in range(1,len(v)) if abs(v[k][1]-v[k-1][1])>400)
print(json.dumps({'frames':n,'span':[a,b],'blank':blank,'ghost':jumps,'x0':v[0][1],'x1':v[-1][1],'maxStep':max([abs(v[k][1]-v[k-1][1]) for k in range(1,len(v))] or [0]),'minW':min(ws[i] for i,_ in v),'maxW':max(ws[i] for i,_ in v)}))
`;
 const a=JSON.parse(execFileSync('python3',['-c',py]).toString());fs.rmSync(raw,{force:true});
 console.log('RESULT',name,JSON.stringify({stageBefore:st0,stageAfter:st1,setBoundsBefore:sb0,setBounds:sb,handoffs:st.handoffs,late:st.lateHandoffs,page:hv,pet:p1,screen:a}));
 return {sb,st,a,p1,st0,st1,hv};
}
const per=await walk('same',1);
ok(per.st0.width===1600&&per.st1.x===1600,`same scaling: a stage per screen (${per.st0.x}->${per.st1.x})`);
ok(per.sb===1&&per.st.handoffs===1&&!per.st.lateHandoffs,`same scaling: one hand-off, answered by the page (${per.sb} setBounds, ${per.st.lateHandoffs||0} late)`);
ok(per.a.ghost===0,`same scaling: ${per.a.ghost} misplaced frames (blank frames at the hand-off: ${per.a.blank})`);
ok(per.a.x1-per.a.x0>900&&per.p1.x>=1800,`same scaling: the pet arrived on the other screen (moved ${per.a.x1-per.a.x0} px on screen)`);
const same=await walk('shared',1,true);
ok(same.st0.x===0&&same.st0.width===3200,`shared stage: one stage over both screens (${JSON.stringify(same.st0)})`);
ok(same.sb===0&&same.st.handoffs===0,`shared stage: the window never moved while crossing (${same.sb} setBounds)`);
ok(same.a.blank===0&&same.a.ghost===0,`shared stage: ${same.a.blank} blank and ${same.a.ghost} misplaced frames (largest step ${same.a.maxStep} px)`);
ok(same.a.x1-same.a.x0>900&&same.p1.x>=1800,`shared stage: the pet arrived on the other screen (moved ${same.a.x1-same.a.x0} px on screen)`);
ok(same.a.minW>=280,`shared stage: the pet stayed whole across the join (width ${same.a.minW}-${same.a.maxW} px)`);
const mixed=await walk('mixed',2);
ok(mixed.st0.width===1600&&mixed.st1.x===1600,`different scaling: a stage per screen (${mixed.st0.x}->${mixed.st1.x})`);
ok(mixed.sb===1&&mixed.st.handoffs===1&&!mixed.st.lateHandoffs,`different scaling: one hand-off, answered by the page (${mixed.sb} setBounds, ${mixed.st.lateHandoffs||0} late)`);
ok(mixed.a.ghost===0,`different scaling: ${mixed.a.ghost} misplaced frames (blank frames at the hand-off: ${mixed.a.blank})`);
ok(mixed.hv.held===mixed.hv.revealed,'the page is shown again after the hand-off');
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
