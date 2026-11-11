// Who keeps the pet drawing? Lists the callers of invalidate() over two idle seconds.
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-p-'));
const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args:[root,...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:60000});
await page.evaluate(p=>window.vinyl.openPaths([p]),path.resolve(process.argv[2]));await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:60000});
await page.waitForTimeout(12000);
for(const phase of ['idle','playing']){
 if(phase==='playing'){await page.evaluate(()=>window.vinyl.drop(0));await page.waitForTimeout(1500);}
 const r=await page.evaluate(()=>new Promise(res=>{window.__invTrace=[];const f0=window.vinylView.renderer.info.render.frame;const seen={};const t=setInterval(()=>{const k=window.vinylView.lastDraw||'-';seen[k]=(seen[k]||0)+1;},50);
  setTimeout(()=>{clearInterval(t);const c={};for(const s of window.__invTrace)c[s]=(c[s]||0)+1;window.__invTrace=null;res({frames:window.vinylView.renderer.info.render.frame-f0,reasons:seen,callers:Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,6)});},2000);}));
 console.log(phase,JSON.stringify(r,null,1));
}
await app.close();
