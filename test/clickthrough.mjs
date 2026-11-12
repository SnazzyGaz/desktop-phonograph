// 1.0.12: after the pet is clicked (body, a key, a sleeve, a right-click menu), the stage goes back to
// click-through as soon as the pointer is off the pet, so other windows get the wheel and clicks; a
// wheel over empty screen never sizes the pet; and on Windows the stage is a tool window, which other
// Chromium apps never count as covering them (a whole-screen stage that wasn't made them stop
// drawing: scrolls showed up only after a click).
// Linux + xvfb: PLAYWRIGHT=/path/to/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node test/clickthrough.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const src=fs.readFileSync(path.join(root,'app','main.js'),'utf8');
ok(/process\.platform==='win32'\?\{type:'toolbar'\}/.test(src)&&/\.\.\.STAGE_TYPE/.test(src),'on Windows the stage window is a tool window');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-click-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:700,y:400,width:440,height:393}}));
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
await R(p=>window.vinyl.openPaths([p]),song);await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:90000});await wait(2500);
const ignoring=()=>M(()=>global.__deskPhono.ignoring),solid=()=>R(()=>window.petShell.solid),petW=()=>M(()=>global.__deskPhono.pet.width);
// spots: plain body (nothing pickable), a transport key, a sleeve
const spots=await R(()=>{const v=window.vinylView,c=v.renderer.domElement.getBoundingClientRect(),out={};
 for(let fy=.3;fy<.95;fy+=.02)for(let fx=.15;fx<.9;fx+=.02){const x=c.left+c.width*fx,y=c.top+c.height*fy;if(!window.petShell.hit(x,y))continue;const k=v.pickAt({clientX:x,clientY:y});
  const kind=k?k.kind:'body';if(['body','transport','sleeve'].includes(kind)&&!out[kind])out[kind]={x,y};}
 return out;});
ok(!!spots.body,'a plain spot on the cabinet');
const away={x:40,y:40};
ok(await ignoring(),'click-through at rest');
async function clickThenLeave(name,pt,button='left'){
 if(!pt){ok(false,`no ${name} spot found`);return;}
 await page.mouse.move(pt.x,pt.y);
 const on=await page.waitForFunction(()=>window.petShell.solid,null,{timeout:3000}).then(()=>true,()=>false);if(!on)console.log('debug',name,JSON.stringify(pt),await R(p=>({hit:window.petShell.hit(p.x,p.y),solid:window.petShell.solid,busy:window.petShell.busyState?.()}),pt));
 await page.mouse.down({button});await wait(60);await page.mouse.up({button});await wait(250);
 if(button==='right'){await page.keyboard.press('Escape').catch(()=>{});await wait(300);}

 await page.mouse.move(away.x,away.y,{steps:6});await page.waitForFunction(()=>!window.petShell.solid,null,{timeout:3000}).catch(()=>{});await wait(150);
 const ig=await ignoring(),s=await solid();
 ok(on&&ig&&!s,`${name}: solid while on it (${on}), click-through again once the pointer leaves (${ig})`);
}
await clickThenLeave('body click',spots.body);
await clickThenLeave('key click',spots.transport);
await clickThenLeave('sleeve click',spots.sleeve);
await clickThenLeave('right-click',spots.body,'right');
// a drag that ends off the pet
await page.mouse.move(spots.body.x,spots.body.y);await wait(120);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(spots.body.x+i*6,spots.body.y);await wait(25);}await page.mouse.up();await wait(200);
await page.mouse.move(away.x,away.y,{steps:6});await wait(300);
ok(await ignoring()&&!(await solid()),'after a drag: click-through again once the pointer leaves');
const w0=await petW();await page.mouse.move(away.x,away.y);for(let i=0;i<5;i++){await page.mouse.wheel(0,-120);await wait(40);}await wait(600);
ok(await petW()===w0,`a wheel over empty screen leaves the pet alone (${w0} -> ${await petW()})`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
