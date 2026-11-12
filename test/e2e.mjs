// End-to-end check of the pet (box or PC): launches the app with a throwaway data folder,
// plays a local song, scratches, checks the hit test and idle frame rate, and saves stills.
// Needs playwright-core (any copy: PLAYWRIGHT=/path/to/playwright-core). Usage: node test/e2e.mjs song.mp3 [outdir] [link]
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);
const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const song=path.resolve(process.argv[2]||'test.mp3'),out=path.resolve(process.argv[3]||'e2e-out'),link=process.argv[4]||null;
fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-e2e-'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let electronPath;try{electronPath=require(path.join(root,'node_modules','electron'));}catch{}
const exe=process.env.DESK_EXE; // test a built app instead of the source
const app=await _electron.launch({executablePath:exe||electronPath,args:[...(exe?[]:[root]),...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data}});
const errors=[];
async function still(o){await page.evaluate(()=>{window.__keep=setInterval(()=>window.vinylView.invalidate(3),100);});try{await page.screenshot({timeout:120000,...o});}finally{await page.evaluate(()=>clearInterval(window.__keep));}}
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const page=await app.firstWindow();
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
try{await page.waitForSelector('canvas[data-ready]',{timeout:60000,state:'attached'});}catch(e){console.log('never drew; errors:',errors.join('\n'));const l=path.join(data,'log.txt');if(fs.existsSync(l))console.log(fs.readFileSync(l,'utf8'));await app.close();process.exit(1);}
const info=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {top:w.isAlwaysOnTop(),bounds:w.getBounds(),bg:w.getBackgroundColor()};});
ok(info.top,'window is always on top');console.log('  bounds',JSON.stringify(info.bounds),'bg',info.bg);
await page.evaluate(p=>window.vinyl.openPaths([p]),song);
await page.waitForFunction(()=>window.vinyl.record&&window.vinyl.buffer,null,{timeout:60000});
await page.waitForTimeout(2500);
const rec=await page.evaluate(()=>({label:window.vinyl.record.label,dur:window.vinyl.buffer.duration,R:window.vinyl.record.metadata.disc_radius_mm,cover:!!window.vinyl.record.cover}));
ok(rec.dur>1,`song decoded (${rec.dur.toFixed(1)} s, ${rec.R*2} mm record, "${rec.label}", cover ${rec.cover})`);
// transparency + hit test: corners are empty, the middle of the machine is solid
const hits=await page.evaluate(()=>{const c=window.vinylView.renderer.domElement.getBoundingClientRect(),h=window.petShell.hit;return {corner:h(c.left+3,c.top+3),corner2:h(c.right-3,c.bottom-3),mid:h(c.left+c.width*.5,c.top+c.height*.62),outside:h(Math.max(2,c.left-40),Math.max(2,c.top-40))};});
ok(!hits.corner&&!hits.corner2&&!hits.outside,'corners and the empty screen around the pet click through');ok(hits.mid,'the machine is solid under the cursor');
// the pose is locked: no orbiting, sharpness capped, a small shadow map
const lock=await page.evaluate(()=>{const v=window.vinylView;return {rotate:v.controls.enableRotate,dpr:v.renderer.getPixelRatio(),dev:devicePixelRatio,shadow:v.shadowSize};});
ok(lock.rotate===false,'the machine cannot be turned (right-drag / Alt+drag do nothing)');
ok(lock.dpr<=Math.min(lock.dev,1.25)+1e-6,`pixel ratio capped in the normal view (${lock.dpr} of ${lock.dev})`);ok(lock.shadow===1024,`shadow map ${lock.shadow}²`);
{const c=await page.evaluate(()=>{const v=window.vinylView,p0=v.camera.position.clone(),el=v.renderer.domElement,r=el.getBoundingClientRect();
 const ev=(t,x,y,b)=>el.dispatchEvent(new PointerEvent(t,{clientX:r.left+x,clientY:r.top+y,button:b,buttons:b===2?2:0,pointerId:1,pointerType:'mouse',bubbles:true}));
 ev('pointerdown',200,200,2);for(let i=1;i<=10;i++)ev('pointermove',200+i*15,200,2);ev('pointerup',350,200,2);return new Promise(res=>setTimeout(()=>res(v.camera.position.distanceTo(p0)),600));});
 ok(c<1e-3,`a right-drag leaves the camera where it was (moved ${c.toFixed(4)} mm)`);}
await page.evaluate(()=>window.vinyl.drop(0));await page.waitForTimeout(1500);
const t1=await page.evaluate(()=>window.vinyl.time());ok(t1>.8,`playing (t=${t1.toFixed(2)})`);
await still({path:path.join(out,'pet-playing.png'),omitBackground:true});
// scratch: grab the record and turn it back by a quarter turn, then forward
const sc=await page.evaluate(async()=>{const v=window.vinyl,r=v.record.metadata.disc_radius_mm*.7;const a0=Math.atan2(1,1);v.grabStart(r*Math.cos(a0),r*Math.sin(a0));const t0=v.time();
 for(let i=1;i<=20;i++){const a=a0-i*.08;v.grabMove(r*Math.cos(a),r*Math.sin(a));await new Promise(r=>setTimeout(r,16));}const back=v.time();
 for(let i=1;i<=30;i++){const a=a0-1.6+i*.08;v.grabMove(r*Math.cos(a),r*Math.sin(a));await new Promise(r=>setTimeout(r,16));}const fwd=v.time();v.grabEnd();return {t0,back,fwd};});
ok(sc.back<sc.t0-.3&&sc.fwd>sc.back+.3,`scratch runs back and forward (${sc.t0.toFixed(2)} → ${sc.back.toFixed(2)} → ${sc.fwd.toFixed(2)})`);
// frame rate while playing and while idle
const fps=async()=>page.evaluate(()=>new Promise(res=>{let n=0;const c=window.vinylView.renderer.info.render;const f0=c.frame;setTimeout(()=>res(c.frame-f0),2000);}));
await page.waitForTimeout(3000);const playFrames=await fps();
await page.evaluate(()=>window.vinyl.lift());await page.waitForTimeout(12000);await page.evaluate(()=>new Promise(res=>{const r=window.vinylView.renderer.info.render,t0=performance.now();let f=r.frame,at=t0; // the toy sways to rest first; slow software GL takes a while
 const t=setInterval(()=>{const n=performance.now();if(r.frame!==f){f=r.frame;at=n;}if(n-at>1500||n-t0>90000){clearInterval(t);if(n-t0>90000)console.log('  (scene still settling after 90 s)');res();}},100);}));
const idleFrames=await fps();
console.log('  idle draw reasons:',await page.evaluate(()=>new Promise(res=>{const seen={};const t=setInterval(()=>{const k=window.vinylView.lastDraw||'-';seen[k]=(seen[k]||0)+1;},50);setTimeout(()=>{clearInterval(t);res(JSON.stringify(seen));},1500);})));
ok(playFrames<=70,`playing draws ≤ ~30 fps (${playFrames/2} fps)`);ok(idleFrames<=4,`idle draws almost nothing (${idleFrames/2} fps)`);
// no Inspect any more: the record is never lifted off for a close-up, and nothing builds groove maps
ok(await page.evaluate(()=>window.vinylView.inspect===undefined&&window.vinylView.beginInspection===undefined&&window.vinylView.grooveSurface===undefined),'no inspect mode and no groove-surface builder');
ok(await page.evaluate(()=>window.vinylView.controls.enableRotate===false&&window.vinylView.renderer.getPixelRatio()<=Math.min(devicePixelRatio,1.25)+1e-6),'back to the locked pose and capped sharpness');
// library persists
await page.waitForTimeout(800);
const lib=JSON.parse(fs.readFileSync(path.join(data,'library.json'),'utf8'));ok(lib.length===1&&lib[0].path===song,'library saved to disk');
if(link){
 const t0=Date.now();await page.evaluate(l=>window.vinyl.playLink(l),link);
 await page.waitForFunction(l=>window.vinyl.entry?.url===l&&window.vinyl.buffer,link,{timeout:240000}).catch(()=>{});
 const e=await page.evaluate(()=>({url:window.vinyl.entry?.url,title:window.vinyl.entry?.title,dur:window.vinyl.buffer?.duration,file:window.vinyl.entry?.file}));
 ok(e.url===link&&e.dur>1,`web link plays (${e.title}, ${e.dur?.toFixed(1)} s, ${((Date.now()-t0)/1000).toFixed(0)} s to fetch)`);
 await page.waitForTimeout(2500);await still({path:path.join(out,'pet-link.png'),omitBackground:true});
}
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,5).join(' | '):''));
const log=path.join(data,'log.txt');if(fs.existsSync(log))console.log('--- app log\n'+fs.readFileSync(log,'utf8').slice(-2000));
await app.close();
