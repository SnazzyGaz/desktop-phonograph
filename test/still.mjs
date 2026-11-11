// A still of the pet in its default pose with a song on, for before/after comparisons, plus
// the median cost of one drawn frame (CPU side) and the drawing buffer size.
// Usage: node test/still.mjs out.png song.mp3   (PLAYWRIGHT=/path/to/playwright-core, DESK_EXE optional)
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-still-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:20,y:20,width:440,height:393}}));
const exe=process.env.DESK_EXE;
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
await page.evaluate(p=>window.vinyl.openPaths([p]),path.resolve(process.argv[3]));
await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:60000});
await page.waitForTimeout(14000);
const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.invalidate();return (await w.webContents.capturePage()).toPNG().toString('base64');});
fs.writeFileSync(process.argv[2],Buffer.from(png,'base64'));
// play for a few seconds and time the frames the page draws
const cost=await page.evaluate(()=>new Promise(async res=>{const v=window.vinyl,r=window.vinylView.renderer,c=r.domElement;await v.drop(0);await new Promise(r=>setTimeout(r,2000));
 const gl=r.getContext(),f0=r.info.render.frame,t0=performance.now(),shadow0=window.vinylView.shadowRenders??null;
 setTimeout(()=>{const fr=r.info.render.frame-f0,s=(performance.now()-t0)/1000;v.lift();res({fps:+(fr/s).toFixed(1),buffer:[c.width,c.height],dpr:r.getPixelRatio(),shadowMap:r.shadowMap.enabled?window.vinylView.shadowSize:null,shadowRenders:window.vinylView.shadowRenders!=null&&shadow0!=null?+((window.vinylView.shadowRenders-shadow0)/s).toFixed(1):null});},4000);}));
console.log(JSON.stringify(cost));await app.close();
