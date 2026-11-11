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
const errors=[];const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
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
const hits=await page.evaluate(()=>{const W=innerWidth,H=innerHeight,h=window.petShell.hit;return {corner:h(3,3),corner2:h(W-3,H-3),mid:h(W*.5,H*.62)};});
ok(!hits.corner&&!hits.corner2,'corners click through');ok(hits.mid,'the machine is solid under the cursor');
await page.evaluate(()=>window.vinyl.drop(0));await page.waitForTimeout(1500);
const t1=await page.evaluate(()=>window.vinyl.time());ok(t1>.8,`playing (t=${t1.toFixed(2)})`);
await page.evaluate(()=>{window.__keep=setInterval(()=>window.vinylView.invalidate(3),100);});await page.screenshot({path:path.join(out,'pet-playing.png'),omitBackground:true});
// scratch: grab the record and turn it back by a quarter turn, then forward
const sc=await page.evaluate(async()=>{const v=window.vinyl,r=v.record.metadata.disc_radius_mm*.7;const a0=Math.atan2(1,1);v.grabStart(r*Math.cos(a0),r*Math.sin(a0));const t0=v.time();
 for(let i=1;i<=20;i++){const a=a0-i*.08;v.grabMove(r*Math.cos(a),r*Math.sin(a));await new Promise(r=>setTimeout(r,16));}const back=v.time();
 for(let i=1;i<=30;i++){const a=a0-1.6+i*.08;v.grabMove(r*Math.cos(a),r*Math.sin(a));await new Promise(r=>setTimeout(r,16));}const fwd=v.time();v.grabEnd();return {t0,back,fwd};});
ok(sc.back<sc.t0-.3&&sc.fwd>sc.back+.3,`scratch runs back and forward (${sc.t0.toFixed(2)} → ${sc.back.toFixed(2)} → ${sc.fwd.toFixed(2)})`);
// frame rate while playing and while idle
const fps=async()=>page.evaluate(()=>new Promise(res=>{let n=0;const c=window.vinylView.renderer.info.render;const f0=c.frame;setTimeout(()=>res(c.frame-f0),2000);}));
await page.waitForTimeout(3000);const playFrames=await fps();
await page.evaluate(()=>window.vinyl.lift());await page.waitForTimeout(12000);await page.waitForFunction(()=>!window.vinylView.lastDraw,null,{timeout:60000,polling:200}).catch(()=>console.log('  (scene still settling after 60 s)'));
const idleFrames=await fps();
console.log('  idle draw reasons:',await page.evaluate(()=>new Promise(res=>{const seen={};const t=setInterval(()=>{const k=window.vinylView.lastDraw||'-';seen[k]=(seen[k]||0)+1;},50);setTimeout(()=>{clearInterval(t);res(JSON.stringify(seen));},1500);})));
ok(playFrames<=70,`playing draws ≤ ~30 fps (${playFrames/2} fps)`);ok(idleFrames<=4,`idle draws almost nothing (${idleFrames/2} fps)`);
// inspect, then put it back
await page.evaluate(()=>window.vinylView.beginInspection());await page.waitForFunction(()=>window.vinylView.inspect.phase==='held',null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(800);
ok(await page.evaluate(()=>window.vinylView.inspect.phase==='held'),'inspect lifts the record');
await page.evaluate(()=>{window.__keep=setInterval(()=>window.vinylView.invalidate(3),100);});await page.screenshot({path:path.join(out,'pet-inspect.png'),omitBackground:true,timeout:120000});
await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.vinylView.inspect.active,null,{timeout:30000}).catch(()=>{});
ok(await page.evaluate(()=>!window.vinylView.inspect.active),'Esc puts it back');
// library persists
await page.waitForTimeout(800);
const lib=JSON.parse(fs.readFileSync(path.join(data,'library.json'),'utf8'));ok(lib.length===1&&lib[0].path===song,'library saved to disk');
if(link){
 const t0=Date.now();await page.evaluate(l=>window.vinyl.playLink(l),link);
 await page.waitForFunction(l=>window.vinyl.entry?.url===l&&window.vinyl.buffer,link,{timeout:240000}).catch(()=>{});
 const e=await page.evaluate(()=>({url:window.vinyl.entry?.url,title:window.vinyl.entry?.title,dur:window.vinyl.buffer?.duration,file:window.vinyl.entry?.file}));
 ok(e.url===link&&e.dur>1,`web link plays (${e.title}, ${e.dur?.toFixed(1)} s, ${((Date.now()-t0)/1000).toFixed(0)} s to fetch)`);
 await page.waitForTimeout(2500);await page.evaluate(()=>{window.__keep=setInterval(()=>window.vinylView.invalidate(3),100);});await page.screenshot({path:path.join(out,'pet-link.png'),omitBackground:true});
}
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,5).join(' | '):''));
const log=path.join(data,'log.txt');if(fs.existsSync(log))console.log('--- app log\n'+fs.readFileSync(log,'utf8').slice(-2000));
await app.close();
