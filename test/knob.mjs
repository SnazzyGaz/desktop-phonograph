// The volume knob: scroll over it turns it (and does not size the pet), scroll elsewhere still
// sizes the pet; a vertical drag turns it and never moves the window; it follows the menu's
// volume; the level persists. Box: xvfb-run -a -s "-screen 0 1600x1000x24" node test/knob.mjs song.mp3
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-knob-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:.5,bounds:{x:560,y:330,width:440,height:393}}));
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data}});
const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),bounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
const settings=()=>JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));
await R(p=>window.vinyl.openPaths([p]),path.resolve(process.argv[2]));await page.waitForFunction(()=>window.vinyl.buffer,null,{timeout:60000});await wait(2500);
const k=await R(()=>window.vinylView.knobPoint());ok(!!k,`the knob is on the cabinet front (${k&&Math.round(k.x)},${k&&Math.round(k.y)})`);
ok(await R(p=>window.vinylView.pickAt({clientX:p.x,clientY:p.y})?.kind==='knob',k),'the knob is what you hit there');
const v0=await R(()=>window.vinyl.volume),a0=await R(()=>window.vinylView.knob.angle);
// scroll up over the knob: louder, the pet keeps its size
let b0=await bounds();await page.mouse.move(k.x,k.y);for(let i=0;i<4;i++){await page.mouse.wheel(0,-100);await wait(60);}await wait(700);
const v1=await R(()=>window.vinyl.volume),a1=await R(()=>window.vinylView.knob.angle);let b1=await bounds();
ok(v1>v0+.15,`scrolling over the knob turns it up (${v0} → ${v1})`);ok(a1>a0,`the knob turns with it (${a0.toFixed(2)} → ${a1.toFixed(2)} rad)`);
ok(b1.width===b0.width&&b1.height===b0.height,`scrolling over the knob does not size the pet (${b0.width}x${b0.height} → ${b1.width}x${b1.height})`);
const bub=await R(()=>{const b=document.getElementById('bubble');return b&&!b.hidden?b.textContent.trim():'';});ok(/Volume \d+%/.test(bub),`a calm bubble says the level (“${bub}”)`);
// scroll elsewhere on the pet: it sizes
const disc=await R(()=>{const v=window.vinylView;return v.toClient(0,0,0);});await page.mouse.move(disc.x,disc.y);
for(let i=0;i<3;i++){await page.mouse.wheel(0,-120);await wait(120);}await wait(600);const b2=await bounds();
ok(b2.width!==b1.width,`scrolling elsewhere still sizes the pet (${b1.width} → ${b2.width})`);
for(let i=0;i<3;i++){await page.mouse.wheel(0,120);await wait(120);}await wait(600);
// drag down on the knob: quieter, the window never moves
const k2=await R(()=>window.vinylView.knobPoint());const b3=await bounds();
await page.mouse.move(k2.x,k2.y);await page.mouse.down();for(let i=1;i<=10;i++){await page.mouse.move(k2.x+i,k2.y+i*7);await wait(30);}await page.mouse.up();await wait(700);
const v3=await R(()=>window.vinyl.volume),b4=await bounds();
ok(v3<v1-.2,`dragging down turns it down (${v1} → ${v3})`);ok(b4.x===b3.x&&b4.y===b3.y,`a knob drag never moves the window (${b3.x},${b3.y} → ${b4.x},${b4.y})`);
// persisted, and the menu's volume moves the knob
await wait(500);ok(Math.abs((settings().volume??-1)-v3)<.011,`the level is saved (${settings().volume})`);
await R(()=>window.vinyl.setVolume(1));await wait(800);const a5=await R(()=>window.vinylView.knob);
ok(Math.abs(a5.shown-1)<.01&&Math.abs(a5.angle-Math.PI*.75)<.02,`the menu's 100% turns the knob to full (${a5.angle.toFixed(2)} rad)`);
await R(()=>window.vinyl.setMuted?.(true));await wait(800);ok((await R(()=>window.vinylView.knob.shown))<.01,'mute turns it to 0');
await app.close();console.log(fails?`${fails} failed`:'all passed');process.exit(fails?1:0);
