// Link covers, end to end in the page: a saved link record with no cover gets one when the library
// loads, from its list of pictures tried in order (a 404, a plain grey 120x90 stand-in big enough to
// pass the byte check, a web page, then a real picture). Linux + xvfb: xvfb-run -a node test/covers.mjs
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';import http from 'http';import {execFileSync} from 'child_process';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dp-cov-')),data=path.join(tmp,'data');fs.mkdirSync(data);
execFileSync('python3',['-c',`from PIL import Image;import random
g=Image.new('L',(120,90));g.putdata([random.randint(150,230) for _ in range(120*90)]);g.convert('RGB').save('${tmp}/grey.jpg',quality=100)
c=Image.new('RGB',(320,180));c.putdata([(x%256,(x*7)%256,200) for x in range(320*180)]);c.save('${tmp}/real.jpg',quality=90)`]);
const grey=fs.readFileSync(path.join(tmp,'grey.jpg')),real=fs.readFileSync(path.join(tmp,'real.jpg')),asked=[];
const srv=http.createServer((q,s)=>{asked.push(q.url);
 if(q.url==='/missing.jpg'){s.writeHead(404,{'content-type':'image/jpeg'});s.end(grey.subarray(0,1097));}
 else if(q.url==='/grey.jpg'){s.writeHead(200,{'content-type':'image/jpeg'});s.end(grey);}
 else if(q.url==='/page'){s.writeHead(200,{'content-type':'text/html'});s.end('<!doctype html><p>hi');}
 else if(q.url==='/real.jpg'){s.writeHead(200,{'content-type':'image/jpeg'});s.end(real);}
 else{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
ok(grey.length>2000,`the grey stand-in is ${grey.length} bytes (gets past the main process, so the page must catch it)`);
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0}));
fs.writeFileSync(path.join(data,'library.json'),JSON.stringify([
 {id:'rcov1',title:'Old link',artist:'Someone',kind:'link',path:null,url:base+'/watch?v=1',kept:true,duration:200,added:1,used:1,thumbs:[base+'/missing.jpg',base+'/grey.jpg',base+'/page',base+'/real.jpg',base+'/never.jpg']},
 {id:'rcov2',title:'No pictures',artist:'',kind:'link',path:null,url:base+'/watch?v=2',kept:true,duration:200,added:2,used:2,thumbs:[base+'/gone.jpg']}]));
const app=await _electron.launch({executablePath:require(path.join(root,'node_modules','electron')),args:[root,'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});
const t0=Date.now();while(Date.now()-t0<20000&&!fs.existsSync(path.join(data,'covers','rcov1.jpg')))await page.waitForTimeout(250);
await page.waitForTimeout(800);
const s=await page.evaluate(()=>window.vinyl.allSleeves().map(x=>({id:x.id,art:x.art})));
ok(fs.existsSync(path.join(data,'covers','rcov1.jpg'))&&s.find(x=>x.id==='rcov1')?.art,'the saved link record got its cover back');
const one=asked.filter(u=>u!=='/gone.jpg');
ok(asked.includes('/gone.jpg')&&JSON.stringify(one.slice(0,4))===JSON.stringify(['/missing.jpg','/grey.jpg','/page','/real.jpg'])&&!asked.includes('/never.jpg'),`pictures tried in order and it stopped at the first real one (${asked.join(' ')})`);
ok(!fs.existsSync(path.join(data,'covers','rcov2.jpg'))&&s.find(x=>x.id==='rcov2')?.art===false,'a record whose pictures are all missing stays plain, no error');
const sq=fs.existsSync(path.join(data,'covers','rcov1.jpg'))?execFileSync('python3',['-c',`from PIL import Image;print(*Image.open('${data}/covers/rcov1.jpg').size)`]).toString().trim():'';
ok(sq==='180 180','the cover is cut square from the picture ('+sq+')');
ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
await app.close();srv.close();process.exit(fails?1:0);
