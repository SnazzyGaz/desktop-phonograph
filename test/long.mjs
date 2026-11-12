// 1.0.10: records that are too long are turned away before anything is fetched, read or decoded,
// and a record that crashed the page is not put on again by itself.
//  1) a 3-hour link (a stand-in for the link tool answers with its length): refused, never fetched
//  2) a list with a 3-hour entry: that entry is left out, with a note
//  3) a 3-hour file on this computer: refused from its header, never read or decoded
//  4) a record marked bad is skipped at start; a crash while putting one on marks it bad;
//     two crashes within a minute and the page starts with nothing playing
// Box only: PLAYWRIGHT=/workspace/pw/node_modules/playwright-core xvfb-run -a node test/long.mjs
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import {execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dp-long-')),data=path.join(tmp,'data');fs.mkdirSync(data);
const fakeLog=path.join(tmp,'yt.log'),fake=path.join(tmp,'fake-yt');
fs.writeFileSync(fake,`#!/bin/sh
echo "$@" >> "${fakeLog}"
case "$*" in
 *--version*) echo 2026.01.01;;
 *flat-playlist*list=*) echo '{"_type":"playlist","title":"Mixed","entries":[{"url":"https://example.test/a","title":"Short one","duration":200},{"url":"https://example.test/jre","title":"JRE MMA Show #188","duration":10543},{"url":"https://example.test/b","title":"Short two","duration":190}]}';;
 *flat-playlist*) echo '{"id":"jre","title":"JRE MMA Show #188","uploader":"PowerfulJRE","duration":10543,"webpage_url":"https://example.test/jre"}';;
 *) echo FETCH >> "${fakeLog}"; exit 1;;
esac
`);fs.chmodSync(fake,0o755);
// sound: a 3-hour silent file (tiny: low-rate mono AAC) and a short tone
const longF=path.join(tmp,'three hours.m4a'),shortF=path.join(tmp,'short.wav'),short2=path.join(tmp,'short two.wav');
execFileSync('ffmpeg',['-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=8000:cl=mono','-t','10543','-c:a','aac','-b:a','8k',longF],{timeout:120e3});
const midF=path.join(tmp,'twenty-five minutes.m4a');
execFileSync('ffmpeg',['-loglevel','error','-y','-f','lavfi','-i','sine=f=220:r=44100','-ac','2','-t','1500','-c:a','aac','-b:a','32k',midF],{timeout:120e3});
for(const f of [shortF,short2])execFileSync('ffmpeg',['-loglevel','error','-y','-f','lavfi','-i','sine=f=440:d=6','-ar','44100',f]);
console.log('long file',(fs.statSync(longF).size/1e6).toFixed(1),'MB');
const args=[root,'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'];
const env={...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1',DESK_PHONO_YTDLP:fake};
const libFile=path.join(data,'library.json'),lib=()=>{try{return JSON.parse(fs.readFileSync(libFile,'utf8'));}catch{return [];}};
async function start(){
 const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args,env});
 const page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
 await page.evaluate(()=>{window.__said=[];const s=window.petShell.say;window.petShell.say=(t,k)=>{if(t)window.__said.push(t);return s(t,k);};});
 // count every read / decode / fetch the page asks for (each answers "no" so nothing heavy happens)
 await app.evaluate(({ipcMain})=>{global.__asked={read:0,transcode:0,fetch:0};
  for(const [ch,k] of [['pet:read','read'],['pet:transcode','transcode'],['pet:link-fetch','fetch']]){ipcMain.removeHandler(ch);ipcMain.handle(ch,()=>{global.__asked[k]++;return {error:'test: not allowed'};});}});
 return {app,page};
}
const said=p=>p.evaluate(()=>window.__said.slice());const asked=a=>a.evaluate(()=>({...global.__asked}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const TOO='longer than an hour and a half';
{const {app,page}=await start();
 // 1) one 3-hour link
 await page.evaluate(()=>window.vinyl.playLink('https://example.test/jre'));await wait(1500);
 let s=await said(page),a=await asked(app),y=fs.existsSync(fakeLog)?fs.readFileSync(fakeLog,'utf8'):'';
 ok(s.some(t=>t.includes(TOO)),`a 3-hour link gets the friendly "too long" note (${s.at(-1)})`);
 ok(a.fetch===0&&!y.includes('FETCH')&&y.includes('--flat-playlist'),`it is never fetched (only its length was asked: ${y.trim().split('\n').length} call(s), ${a.fetch} fetches)`);
 ok(await page.evaluate(()=>window.vinyl.libraryCount)===0,'and it is not in the stack');
 // 2) a list with a 3-hour entry
 await page.evaluate(()=>{window.__said=[];window.vinyl.playLink('https://example.test/watch?list=mixed');});await wait(2000);
 s=await said(page);const titles=await page.evaluate(()=>window.vinyl.entries().map(e=>e.title));
 ok(!titles.includes('JRE MMA Show #188')&&titles.includes('Short one')&&titles.includes('Short two'),`in a list, only the long one is left out (${titles.join(', ')})`);
 ok(s.some(t=>/left out one that is longer than an hour and a half/.test(t)),`with a gentle note (${s.find(t=>/list/i.test(t))})`);
 // 3) a 3-hour file
 await page.evaluate(()=>{window.__said=[];for(const e of window.vinyl.entries())window.vinyl.forget(e.id,true);});
 const a0=await asked(app);
 await page.evaluate(f=>window.vinyl.openPaths([f]),longF);await wait(1500);
 s=await said(page);a=await asked(app);
 ok(s.some(t=>t.includes(TOO)),`a 3-hour file gets the same note (${s.at(-1)})`);
 ok(a.read===a0.read&&a.transcode===a0.transcode,`it is turned away from its header: never read or decoded (reads ${a.read-a0.read}, decodes ${a.transcode-a0.transcode})`);
 ok(!(await page.evaluate(()=>window.vinyl.entries().map(e=>e.path))).includes(longF),'and it is not in the stack');
 await wait(800);ok(!lib().some(e=>e.path===longF||/JRE/.test(e.title)),'nothing long was saved to the library');
 await app.close();}
// 4) crash-loop guard
fs.writeFileSync(libFile,JSON.stringify([
 {id:'rgood',title:'Good one',kind:'file',path:shortF,kept:true,duration:6,added:1,used:1},
 {id:'rbad',title:'Crashed me',kind:'file',path:short2,kept:true,duration:0,added:2,used:9,bad:true},
 {id:'rthird',title:'Third one',kind:'file',path:shortF,kept:true,duration:6,added:4,used:0.5},
 {id:'rold',title:'Old long one',kind:'file',path:longF,kept:true,duration:10543,added:3,used:5}]));
{const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args,env});
 let page=await app.firstWindow();await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:90000});
 await page.waitForFunction(()=>window.vinyl.currentId,null,{timeout:30000}).catch(()=>{});
 let cur=await page.evaluate(()=>window.vinyl.currentId);
 ok(cur==='rgood',`a record marked bad is not put on at start, even though it was played last (on: ${cur})`);
 await wait(1000);ok(!lib().some(e=>e.id==='rold'),'a too-long record saved by an older version is dropped from the library');
 // crash while "putting on" the good one (after a crash Playwright's page is gone: the page is reached through the main process)
 const js=code=>app.evaluate(({BrowserWindow},c)=>BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(c),code);
 const crash=async()=>{await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer();});await wait(1500);
  for(let i=0;i<120;i++){if(await js("!!document.querySelector('canvas[data-ready]')").catch(()=>false))break;await wait(500);}};
 await page.evaluate(()=>window.desk.loading('rgood'));await crash();
 ok(lib().find(e=>e.id==='rgood')?.bad===true,'a crash while a record is being put on marks it bad in the library');
 await wait(5000);cur=await js('window.vinyl.currentId');
 ok(cur==='rthird',`after that crash it is not put on again by itself; the next good one is (on: ${cur})`);
 await crash();await wait(5000);cur=await js('window.vinyl.currentId');
 ok(!cur,`two crashes within a minute: it starts with nothing playing (on: ${cur})`);
 // 5) a 25-minute file still plays, decoded the low-memory way (mono, lower rate)
 await js(`window.vinyl.openPaths([${JSON.stringify(midF)}])`);
 for(let i=0;i<60;i++){if(await js('window.vinyl.entry?.path||""')===midF)break;await wait(1000);}
 const b=JSON.parse(await js('JSON.stringify({p:window.vinyl.entry?.path,ch:window.vinyl.buffer?.numberOfChannels,sr:window.vinyl.buffer?.sampleRate,d:window.vinyl.buffer?.duration})'));
 ok(b.p===midF&&b.ch===1&&b.sr===32000&&Math.abs(b.d-1500)<2,`a 25-minute file plays, held as mono at 32 kHz (${JSON.stringify(b)})`);
 await app.close();}
const lg=path.join(data,'log.txt');if(fs.existsSync(lg))console.log('--- app log (tail)\n'+fs.readFileSync(lg,'utf8').split('\n').slice(-12).join('\n'));
fs.rmSync(tmp,{recursive:true,force:true});
console.log(fails?`${fails} FAILED`:'ALL PASS');process.exit(fails?1:0);
