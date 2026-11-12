// The crate fan (double-click the crate) shows exactly the crate's sleeves, in the crate's order,
// then the rest of the most recently added list that didn't fit in the crate; never other records
// from the library (1.0.13 spread the whole library, oldest first, so it looked random).
// Seeds a library of 40 songs, an older list of 8 and a newer list of 15 (3 of them played lately).
// Linux + xvfb: PLAYWRIGHT=/path/to/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node test/fan.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-fan-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:700,y:400,width:440,height:393}}));
const lib=[];let t=1e12;
for(let i=0;i<40;i++){const f=path.join(data,`song ${i}.mp3`);fs.copyFileSync(song,f);lib.push({id:'f'+i,title:'Song '+i,artist:'',kind:'file',path:f,url:null,kept:true,duration:40,added:t++,used:100+i,queue:null,qIndex:null});}
for(let i=0;i<8;i++)lib.push({id:'old'+i,title:'Old list '+i,artist:'',kind:'link',path:null,url:'https://example.com/old'+i,kept:false,duration:60,added:t++,used:50+i,queue:'qOld',qIndex:i});
for(let i=0;i<15;i++)lib.push({id:'new'+i,title:'New list '+i,artist:'',kind:'link',path:null,url:'https://example.com/new'+i,kept:false,duration:60,added:t++,used:i<3?200+i:10+i,queue:'qNew',qIndex:i});
fs.writeFileSync(path.join(data,'library.json'),JSON.stringify(lib));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
await page.waitForFunction(()=>window.vinyl.libraryCount>=63&&window.vinyl.currentId,null,{timeout:60000}).catch(()=>{});await page.waitForTimeout(2500);
const crate=await page.evaluate(()=>window.vinyl.sleeves().map(s=>s.id)),cur=await page.evaluate(()=>window.vinyl.currentId);
console.log('  crate',crate.join(' '),'· playing',cur);
const overflow=lib.filter(e=>e.queue==='qNew'&&e.id!==cur&&!crate.includes(e.id)).sort((a,b)=>a.qIndex-b.qIndex).map(e=>e.id);
const want=[...crate,...overflow];
// open it the way he does: double-click the crate
const at=await page.evaluate(()=>{const v=window.vinylView,T=v.THREE,c=v.scene.getObjectByName('record-crate');c.updateMatrixWorld(true);const b=new T.Box3().setFromObject(c),m=b.getCenter(new T.Vector3());return v.toClient(m.x,m.y,b.max.z-2);});
await page.mouse.move(at.x,at.y);await page.waitForTimeout(400);await page.mouse.dblclick(Math.round(at.x),Math.round(at.y));
await page.waitForFunction(()=>window.vinylView.fan.on,null,{timeout:15000}).catch(()=>{});
if(!(await page.evaluate(()=>window.vinylView.fan.on))){console.log('  (double-click missed the crate; opening from the menu command)');await page.evaluate(()=>window.vinylView.fanOpen());await page.waitForFunction(()=>window.vinylView.fan.on,null,{timeout:15000}).catch(()=>{});}
const got=await page.evaluate(()=>window.vinylView.fan.cards.map(c=>c.id));
ok(crate.length>0&&got.slice(0,crate.length).join()===crate.join(),`the fan starts with the crate's sleeves, same order (${crate.length})`);
ok(got.join()===want.join(),`then the overflow of the last list added, in list order (${overflow.length}): ${got.length} in all`);
ok(!got.some(id=>/^old/.test(id)&&!crate.includes(id)),'nothing from the older list');
ok(!got.some(id=>/^f/.test(id)&&!crate.includes(id)),'no other songs from the library');
ok(got.length<63,`not the whole library (${got.length} of 63)`);
ok(await page.evaluate(()=>window.vinylView.fan.cards.filter(c=>c.shown).length)<=9,'at most 9 cards show at once (the wheel scrolls through the rest)');
await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.vinylView.fan.on,null,{timeout:15000}).catch(()=>{});
ok(!errors.length,`no page errors${errors.length?': '+errors.join(' | '):''}`);
await app.close();console.log(fails?`${fails} FAILED`:'all passed');process.exit(fails?1:0);
