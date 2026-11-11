// Inspect performance: draws per second, time per draw, drawing-buffer size, shadow renders and
// window setBounds calls, in four phases: held (idle, record spinning) and turning it with a
// right-drag, at the default distance and at full zoom.
// Usage: xvfb-run -a -s "-screen 0 1600x1000x24" node test/inspect-perf.mjs song.mp3
//   (PLAYWRIGHT=..., DESK_EXE optional, SCALE=1.5 to emulate a 150% Windows display)
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-perf-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:560,y:330,width:440,height:393}}));
const exe=process.env.DESK_EXE,scale=process.env.SCALE;
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),...(scale?['--force-device-scale-factor='+scale]:[]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
const wait=ms=>page.waitForTimeout(ms);
await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];globalThis.__sb=0;const o=w.setBounds.bind(w);w.setBounds=(...a)=>{globalThis.__sb++;return o(...a);};const p=w.setPosition.bind(w);w.setPosition=(...a)=>{globalThis.__sb++;return p(...a);};});
if(process.env.TIER)await page.evaluate(t=>window.vinylView.setQuality(t),process.env.TIER);
await page.evaluate(p=>window.vinyl.openPaths([p]),path.resolve(process.argv[2]));await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:60000});await wait(3000);
await page.evaluate(()=>window.vinylView.beginInspection());
await page.waitForFunction(()=>window.vinylView.inspect.phase==='held',null,{timeout:30000});await wait(2500);
async function phase(name,act){
 const s0=await app.evaluate(()=>globalThis.__sb),p0=await page.evaluate(()=>({t:performance.now(),sh:window.vinylView.perf.shadowRenders}));
 await act();
 const p1=await page.evaluate(t=>{const p=window.vinylView.perf;return {t:performance.now(),sh:p.shadowRenders,log:p.log.filter(x=>x[0]>=t),buffer:p.buffer,dpr:p.dpr,post:p.post};},p0.t);
 const s1=await app.evaluate(()=>globalThis.__sb);
 const secs=(p1.t-p0.t)/1000,d=p1.log.map(x=>x[1]).sort((a,b)=>a-b),gaps=p1.log.slice(1).map((x,i)=>x[0]-p1.log[i][0]).sort((a,b)=>a-b);
 const q=(a,f)=>a.length?+a[Math.min(a.length-1,Math.floor(a.length*f))].toFixed(1):null;
 const r={phase:name,fps:+(p1.log.length/secs).toFixed(1),drawMs:{median:q(d,.5),p95:q(d,.95)},frameGapMs:{median:q(gaps,.5),p95:q(gaps,.95)},buffer:p1.buffer.join('x'),dpr:p1.dpr,tier:p1.post.tier,shadowRendersPerSec:+((p1.sh-p0.sh)/secs).toFixed(1),setBounds:s1-s0};
 console.log('PERF',JSON.stringify(r));return r;}
const drag=async()=>{await page.evaluate(async()=>{const v=window.vinylView,el=v.renderer.domElement,r=el.getBoundingClientRect();
 const ev=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{clientX:r.left+x,clientY:r.top+y,button:2,buttons:t==='pointerup'?0:2,pointerId:1,pointerType:'mouse',bubbles:true}));
 const x0=r.width/2,y0=r.height/2;ev('pointerdown',x0,y0);const t0=performance.now();let i=0;
 while(performance.now()-t0<3000){i++;ev('pointermove',x0+Math.sin(i/9)*120,y0+Math.cos(i/13)*60);await new Promise(s=>requestAnimationFrame(s));}
 ev('pointerup',x0,y0);});};
const res=[];
res.push(await phase('held, idle',()=>wait(3000)));
res.push(await phase('held, turning it',drag));
const zoom=await page.evaluate(async()=>{const el=window.vinylView.renderer.domElement,r=el.getBoundingClientRect();
 for(let i=0;i<60;i++){el.dispatchEvent(new WheelEvent('wheel',{deltaY:-240,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));await new Promise(s=>setTimeout(s,25));}
 return null;});
const sbZoom=await app.evaluate(()=>globalThis.__sb);await wait(2000);
res.push(await phase('full zoom, idle',()=>wait(3000)));
res.push(await phase('full zoom, turning it',drag));
console.log('setBounds total during the whole inspect (incl. the one grow):',await app.evaluate(()=>globalThis.__sb),'after 60 wheel ticks:',sbZoom);
await app.close().catch(()=>{});
