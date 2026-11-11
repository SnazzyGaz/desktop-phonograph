// Inspect at full zoom: a still of the window, whether the record touches the window's edge
// (a hard square crop), and what a right-drag turns (the record only, never the player).
// Usage: node test/inspect-zoom.mjs out.png song.mp3   (PLAYWRIGHT=..., DESK_EXE optional)
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-zoom-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:500,y:300,width:440,height:393}}));
const exe=process.env.DESK_EXE;
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
const keep=0;
await page.evaluate(p=>window.vinyl.openPaths([p]),path.resolve(process.argv[3]));await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:60000});await page.waitForTimeout(3000);
const bounds0=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
await page.evaluate(()=>window.vinylView.beginInspection());
await page.waitForFunction(()=>window.vinylView.inspect.phase==='held',null,{timeout:30000});await page.waitForTimeout(1500);
const bounds1=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
// right-drag across the window: what moves?
const rd=await page.evaluate(async()=>{const v=window.vinylView,el=v.renderer.domElement,r=el.getBoundingClientRect(),cam0=v.camera.position.clone(),tg0=v.controls.target.clone();
 const q0=v.disc.quaternion.clone();
 const ev=(t,x,y,b)=>el.dispatchEvent(new PointerEvent(t,{clientX:r.left+x,clientY:r.top+y,button:2,buttons:t==='pointerup'?0:2,pointerId:1,pointerType:'mouse',bubbles:true}));
 const x0=r.width/2,y0=r.height/2;ev('pointerdown',x0,y0);for(let i=1;i<=12;i++){ev('pointermove',x0+i*12,y0+i*4);await new Promise(s=>setTimeout(s,16));}ev('pointerup',x0+144,y0+48);
 await new Promise(s=>setTimeout(s,800));const q1=v.disc.quaternion.clone();
 const turned=q0&&q1?+(2*Math.acos(Math.min(1,Math.abs(q0.dot(q1))))*180/Math.PI).toFixed(1):null;v.disc.quaternion.copy(q0);v.invalidate(3); // put it back face-on for the still
 return {turnedDeg:turned,camMoved:+v.camera.position.distanceTo(cam0).toFixed(3),targetMoved:+v.controls.target.distanceTo(tg0).toFixed(3),recordTurned:q0&&q1?+(2*Math.acos(Math.min(1,Math.abs(q0.dot(q1))))*180/Math.PI).toFixed(1):null};});
// zoom all the way in with the wheel, over the record
const c=await page.evaluate(()=>{const v=window.vinylView;const p=v.camera.position,t=v.controls.target;return {d0:p.distanceTo(t)};});
for(let i=0;i<60;i++){await page.evaluate(()=>{const el=window.vinylView.renderer.domElement,r=el.getBoundingClientRect();el.dispatchEvent(new WheelEvent('wheel',{deltaY:-240,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));});await page.waitForTimeout(25);}
await page.waitForTimeout(1500);
const d1=await page.evaluate(()=>{const v=window.vinylView;return v.camera.position.distanceTo(v.controls.target);});
const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.invalidate();return (await w.webContents.capturePage()).toPNG().toString('base64');});
fs.writeFileSync(process.argv[2],Buffer.from(png,'base64'));
const edge=null; // measured from the PNG afterwards (readPixels on a big SwiftShader canvas kills its GPU process)
const out={bounds0,bounds1,zoom:{from:+c.d0.toFixed(1),to:+d1.toFixed(1)},edge,rightDrag:rd,menuItems:null};
console.log(JSON.stringify(out));await app.close().catch(()=>{});try{fs.rmSync(data,{recursive:true,force:true});}catch{}
