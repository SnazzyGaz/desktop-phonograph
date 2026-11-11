// A list link becomes a queue: the first plays, only the next one or two are fetched ahead,
// each arrives as its own sleeve, and when a record ends the next one goes on by itself.
// Usage: node test/e2e-list.mjs <list link>   (PLAYWRIGHT=/path/to/playwright-core)
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const link=process.argv[2],data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-list-'));
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const exe=process.env.DESK_EXE;
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
const t0=Date.now();page.evaluate(l=>window.vinyl.playLink(l),link);
await page.waitForFunction(()=>window.vinyl.entry?.queue&&window.vinyl.down,null,{timeout:300000});
const s1=await page.evaluate(()=>({first:window.vinyl.entry.title}));
ok(true,`first in the list plays after ${((Date.now()-t0)/1000).toFixed(0)} s: ${s1.first}`);
await page.waitForFunction(()=>{const q=window.vinyl.entries().filter(e=>e.queue);return q.filter(e=>e.file).length>=3;},null,{timeout:300000}).catch(()=>{});
const s2=await page.evaluate(()=>window.vinyl.entries().filter(e=>e.queue).sort((a,b)=>a.qIndex-b.qIndex).map(e=>e.file?'F':e.state[0]).join(''));
ok(/^FFF[^F]+$/.test(s2),`only the next two are fetched ahead (${s2}: F=fetched, w=waiting)`);
const sl=await page.evaluate(()=>window.vinyl.sleeves().map(s=>s.label));
ok(sl.length<=6&&sl.length>=2,`the stack shows ${sl.length} sleeves: ${sl.slice(0,3).join(' / ')}…`);
const {id1,i1}=await page.evaluate(()=>{const v=window.vinyl,i1=v.entry.qIndex;v.lift();v.drop(v.buffer.duration-1.2);return {id1:v.currentId,i1};}); // a short first one may already have handed over by itself
await page.waitForFunction(id=>window.vinyl.currentId!==id&&window.vinyl.down,id1,{timeout:120000}).catch(()=>{});
const s3=await page.evaluate(()=>({id:window.vinyl.currentId,i:window.vinyl.entry?.qIndex,down:window.vinyl.down,t:window.vinyl.time()}));
ok(s3.id!==id1&&s3.i===i1+1&&s3.down,`the next one went on and is playing (index ${i1} → ${s3.i}, t=${s3.t.toFixed(1)})`);
await page.waitForTimeout(5000);
const s4=await page.evaluate(()=>window.vinyl.entries().filter(e=>e.queue).sort((a,b)=>a.qIndex-b.qIndex).map(e=>e.file?'F':e.state[0]).join(''));
ok(/^FFFF/.test(s4),`and one more is fetched ahead (${s4})`);
ok(!errors.length,'no page errors '+errors.join(' | '));
const log=path.join(data,'log.txt');if(fs.existsSync(log))console.log('--- app log\n'+fs.readFileSync(log,'utf8').slice(-1500));
await app.close();process.exit(fails?1:0);
