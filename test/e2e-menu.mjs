// Every right-click menu item and every tray item, through the menus main actually built, with
// the state each one should change checked afterwards. The clipboard is a stand-in that answers
// the way Electron 44+ does (a Promise), plus odd values that used to crash main.
// Usage: node test/e2e-menu.mjs song.mp3   (PLAYWRIGHT=..., DESK_EXE=packaged exe optional)
//   NATIVE=1 (Windows): pick the popup items through UI Automation on the real native menu.
//   LINK=<url>: also play that link for real from the (stand-in) clipboard and check it plays.
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const song=path.resolve(process.argv[2]);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-e2e-'));const exe=process.env.DESK_EXE;
const NATIVE=process.platform==='win32'&&!!process.env.NATIVE;const LINK=process.env.LINK||'';
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:60,y:60,width:440,height:393}}));
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),...(process.platform==='linux'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']:[])],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const pid=app.process().pid;const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
const wait=ms=>page.waitForTimeout(ms),R=(f,a)=>page.evaluate(f,a),M=(f,a)=>app.evaluate(f,a);
const bubble=()=>R(()=>{const b=document.getElementById('bubble');return b&&!b.hidden?document.getElementById('bubbleText').textContent:'';});
// stand-ins: the open dialog answers with the test song; the clipboard answers like Electron 44+ (or oddly)
await M(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},song);
const setClip=kind=>M((_,{kind,link})=>{const P=v=>Promise.resolve(v);const c={
 promise:{readText:()=>P(link)},object:{readText:()=>P({})},number:{readText:()=>7},undef:{readText:()=>undefined},throws:{readText:()=>{throw new Error('clipboard busy');}},
 bookmark:{readText:()=>P(''),read:()=>P([{types:['electron application/bookmark'],getType:()=>P({title:'x',url:link})}])}}[kind];global.__deskPhono.setClipboard(c);},{kind,link:LINK||'https://example.test/song'});
const spyLinks=()=>R(()=>{window.__links=[];const real=window.__realPlayLink||(window.__realPlayLink=window.vinyl.playLink);window.vinyl.playLink=t=>{if(!/^https?:/i.test(String(t)))return real(t);window.__links.push(t);return Promise.resolve();};}); // links are only noted; anything else goes on to the real player, which says what to do
if(!LINK)await spyLinks();
async function openPopup(at){
 const c=at||await R(()=>window.vinylView.toClient(0,0,0));const n=await M(()=>global.__deskPhono.popups);
 await page.mouse.click(c.x,c.y,{button:'right'});
 for(let i=0;i<40;i++){if(await M(()=>global.__deskPhono.popups)>n)return true;await wait(100);}
 return false;
}
const labelsOf=menu=>M((_,which)=>{const m=global.__deskPhono[which];const walk=(items,pre)=>items.flatMap(i=>i.type==='separator'?[]:[...(i.visible===false?[]:[pre+i.label]),...(i.submenu?walk(i.submenu.items,pre+i.label+'>'):[])]);return m?walk(m.items,''):[];},menu);
// Fire one item the way a click on the native menu does (the Menu's own command dispatch), or through UI Automation.
async function pick(menu,label){
 if(NATIVE&&menu==='popup'){const r=execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test','uia-menu.ps1'),label,String(pid)],{encoding:'utf8',timeout:30000}).trim();await wait(300);return /^(INVOKED|TOGGLED|SELECTED)/.test(r)?'ok':r;}
 return M((_,{menu,label})=>{const m=global.__deskPhono[menu];if(!m)return 'no menu';
  let host=m,item=null;for(const part of label.split('>')){host=item?item.submenu:m;item=host.items.find(i=>i.label===part);if(!item)return 'no item '+part;}
  const w=global.__deskPhono.win;
  if(typeof host._executeCommand==='function')host._executeCommand({},item.commandId);else item.click(undefined,w,w.webContents);
  if(menu==='popup')m.closePopup?.(w);return 'ok';},{menu,label});
}
async function popupItem(label,at){
 const opened=await openPopup(at);if(!opened){ok(false,`menu opens for “${label}”`);return false;}
 const labels=await labelsOf('popup');if(!labels.includes(label)){ok(false,`“${label}” is in the menu (have: ${labels.join(' | ')})`);await M(()=>global.__deskPhono.popup?.closePopup());return false;}
 const r=await pick('popup',label);if(r!=='ok')ok(false,`picked “${label}” — ${r}`);await wait(700);return r==='ok';
}
const until=async(f,ms=8000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await R(f))return true;await wait(150);}return false;};
const mainUntil=async(f,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await M(f))return true;await wait(150);}return false;};
const st=()=>R(()=>({down:window.vinyl.down,rpm:window.vinyl.rpm,vol:window.vinyl.volume,insp:window.vinylView.inspect.active,toy:window.vinylView.toy,pip:!!window.vinylNeedle?.on,auto:window.vinyl.autoNext,n:window.vinyl.libraryCount}));
const settingsFile=()=>{try{return JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));}catch{return {};}};
console.log(NATIVE?'  (popup items picked through UI Automation on the native menu)':'  (items fired through each menu’s own command dispatch)');

// right-click menu
await popupItem('Play a song from this computer…');ok(await until(()=>!!window.vinyl.buffer,60000),'“Play a song from this computer…” loads the chosen song');await wait(1500);
await popupItem('Put the needle down');ok(await until(()=>window.vinyl.down),'“Put the needle down” plays it');
await wait(800);await popupItem('Lift the needle');ok(await until(()=>!window.vinyl.down),'“Lift the needle” stops it');
const cut=await R(()=>window.vinyl.record.metadata.rpm_cut);
for(const [lab,want] of [['Speed>78 rpm',78],['Speed>33⅓ rpm',100/3],['Speed>45 rpm',45]]){await popupItem(lab);const r=(await st()).rpm;ok(Math.abs(r-want)<.2,`“${lab}” → ${r.toFixed(1)} rpm`);}
let r0=(await st()).rpm;await popupItem('Speed>A little faster');ok((await st()).rpm>r0+.5,`“Speed>A little faster” → ${(await st()).rpm.toFixed(1)}`);
r0=(await st()).rpm;await popupItem('Speed>A little slower');ok((await st()).rpm<r0-.5,`“Speed>A little slower” → ${(await st()).rpm.toFixed(1)}`);
await popupItem('Speed>78 rpm');await popupItem('Speed>Back to normal speed');ok(Math.abs((await st()).rpm-cut)<.2,`“Speed>Back to normal speed” → ${(await st()).rpm.toFixed(1)}`);
await popupItem('Volume>20%');ok(Math.abs((await st()).vol-.2)<.01,'“Volume>20%”');await popupItem('Volume>Silent');ok((await st()).vol===0,'“Volume>Silent”');
await popupItem('Look closely at the record');ok(await until(()=>window.vinylView.inspect.active),'“Look closely at the record” lifts it out');
await page.keyboard.press('Escape');ok(await until(()=>!window.vinylView.inspect.active),'Esc puts it back');await wait(1200);
let s=await st();
await popupItem('Play the next one automatically');await wait(500);ok((await st()).auto===!s.auto&&/by itself|after each/.test(await bubble()),`“Play the next one automatically” → ${!s.auto}, and says so`);
ok(settingsFile().autoNext===!s.auto,'…and remembers it');
await popupItem('Play the next one automatically');ok((await st()).auto===s.auto,'…and back');
await popupItem('Needle close-up');ok((await st()).pip===!s.pip,`“Needle close-up” → ${!s.pip}`);await popupItem('Needle close-up');ok((await st()).pip===s.pip,'…and back');
await popupItem('Swap the dancer');ok((await st()).toy!==s.toy,`“Swap the dancer” → ${(await st()).toy}`);
const top0=await M(()=>global.__deskPhono.win.isAlwaysOnTop());
await popupItem('Always on top');ok(await mainUntil(new Function(`return global.__deskPhono.win.isAlwaysOnTop()===${!top0}`))&&/top|cover/.test(await bubble()),`“Always on top” → ${!top0}, and says so (“${await bubble()}”)`);
await popupItem('Always on top');ok(await M(()=>global.__deskPhono.win.isAlwaysOnTop())===top0,'…and back');
for(const kind of ['object','number','undef','throws']){await setClip(kind);await popupItem('Play a web link (from the clipboard)');await wait(400);const b=await bubble();ok(/Copy a web link first/.test(b),`clipboard gives ${kind}: a friendly hint, no crash (“${b.slice(0,48)}…”)`);}
for(const kind of ['promise','bookmark']){
 await setClip(kind);
 if(!LINK){await popupItem('Play a web link (from the clipboard)');ok(await until(()=>window.__links.length>0)&&(await R(()=>window.__links.pop()))==='https://example.test/song',`clipboard as ${kind==='promise'?'text (a Promise, as Electron 44+ gives it)':'a bookmark only'}: the link reaches the player`);}
 else if(kind==='promise'){await popupItem('Play a web link (from the clipboard)');
  ok(await until(()=>window.vinyl.entry?.kind==='link'&&!!window.vinyl.buffer&&window.vinyl.down&&window.vinyl.time()>1,180000),`the copied link plays as a record (“${await R(()=>window.vinyl.entry?.title||'?')}”, ${(await R(()=>window.vinyl.time())).toFixed(1)} s in)`);
  await popupItem('Keep this record');ok(await until(()=>!!window.vinyl.entry?.kept,8000),'“Keep this record” keeps it');
  await popupItem('Lift the needle');await until(()=>!window.vinyl.down);await spyLinks();}
}
const second=path.join(data,'second song.mp3');fs.copyFileSync(song,second);const nb=await R(()=>window.vinyl.libraryCount);await R(p=>window.vinyl.openPaths([p]),second);await until(new Function('return window.vinyl.libraryCount>'+nb),30000);await until(()=>!!window.vinyl.buffer,60000);await wait(2500);
const sp=await R(()=>window.vinylView.sleevePoints().filter(p=>!p.empty));const n0=await R(()=>window.vinyl.libraryCount);
if(sp.length){await popupItem('Put this record away',{x:sp[0].x,y:sp[0].y});ok(await until(new Function('return window.vinyl.libraryCount<'+n0),4000),`“Put this record away” (${n0} → ${await R(()=>window.vinyl.libraryCount)} records)`);}
else ok(false,'a sleeve to right-click');
await popupItem('Hide (click the tray icon to bring it back)');ok(await mainUntil(()=>!global.__deskPhono.win.isVisible()),'“Hide” hides it');
// tray
const tl=await labelsOf('tray');ok(tl.includes('Show the phonograph'),`the tray menu follows (${tl.join(' | ')})`);
await pick('tray','Show the phonograph');ok(await mainUntil(()=>global.__deskPhono.win.isVisible()),'tray “Show the phonograph”');
await pick('tray','Hide the phonograph');ok(await mainUntil(()=>!global.__deskPhono.win.isVisible()),'tray “Hide the phonograph”');
await pick('tray','Show the phonograph');await mainUntil(()=>global.__deskPhono.win.isVisible());
await R(()=>{window.__paths=[];const o=window.vinyl.openPaths;window.vinyl.openPaths=p=>{window.__paths.push(...p);return o(p);};});
await pick('tray','Play a song from this computer…');ok(await until(()=>window.__paths.length>0),'tray “Play a song from this computer…”');
await setClip('promise');await pick('tray','Play a web link from the clipboard');ok(await until(()=>window.__links.length>0),'tray “Play a web link from the clipboard”');
await setClip('throws');await pick('tray','Play a web link from the clipboard');await wait(600);{const b=await bubble(),l=await R(()=>window.__links.slice());ok(/Copy a web link first/.test(b),`tray link with a broken clipboard: a hint, no crash (“${b}”, links ${JSON.stringify(l)})`);}
await M(()=>{const w=global.__deskPhono.win;const b=w.getBounds();w.setBounds({...b,x:-6000,y:-6000});});
await pick('tray','Put it back on screen');ok(await mainUntil(({screen})=>{const b=global.__deskPhono.win.getBounds(),wa=screen.getPrimaryDisplay().workArea;return b.x>=wa.x-1&&b.y>=wa.y-1&&b.x+b.width<=wa.x+wa.width+1&&b.y+b.height<=wa.y+wa.height+1;}),'tray “Put it back on screen”');
// a throw inside any click shows in the pet (logged), never as Electron's modal box
await M(()=>{setTimeout(()=>{throw new Error('test: a stray error in main');},0);});await wait(800);
ok(/went wrong/.test(await bubble())&&await M(()=>!!global.__deskPhono.win&&!global.__deskPhono.win.isDestroyed()),'a stray error in main becomes a bubble, the app carries on');
const logTxt=fs.existsSync(path.join(data,'log.txt'))?fs.readFileSync(path.join(data,'log.txt'),'utf8'):'';
const bad=logTxt.split('\n').filter(l=>/ error /.test(l)&&!/test: a stray error/.test(l));
ok(!bad.length,'no other errors in the log'+(bad.length?': '+bad.slice(0,3).join(' / '):''));
ok((logTxt.match(/ menu /g)||[]).length>=30,`every click is logged (${(logTxt.match(/ menu /g)||[]).length})`);
ok(!errors.length,'no page errors'+(errors.length?': '+errors.join(' | '):''));
const closed=new Promise(r=>app.once('close',()=>r(true)));
ok(await openPopup(),'menu opens for “Quit”');await pick('popup','Quit').catch(()=>{});ok(await Promise.race([closed,new Promise(r=>setTimeout(()=>r(false),10000))]),'“Quit” quits');
await new Promise(r=>setTimeout(r,1500));try{fs.rmSync(data,{recursive:true,force:true});}catch{}
console.log(fails?`${fails} FAILED`:'all passed');process.exit(fails?1:0);
