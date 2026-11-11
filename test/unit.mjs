// Quick checks that need no window: every script parses, the page's CSP still allows its
// import map, records are sized sensibly for any song length, and user-facing text keeps
// to plain words (no tool names, no "download").
import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import crypto from 'crypto';import {execFileSync} from 'child_process';import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const f of ['app/renderer/static/view.js','app/renderer/static/post.js','app/main.js','app/preload.js','app/renderer/pet-player.js','app/renderer/pet-shell.js','app/renderer/pet-boot.js','app/clip-link.js'])
 {try{const src=fs.readFileSync(path.join(root,f),'utf8');if(/static\/(view|post)\.js$/.test(f)){const tmp=path.join(root,'test','.check-'+path.basename(f,'.js')+'.mjs');fs.writeFileSync(tmp,src);try{execFileSync(process.execPath,['--check',tmp]);}finally{fs.rmSync(tmp);}}else execFileSync(process.execPath,['--check',path.join(root,f)]);ok(true,'parses: '+f);}catch(e){ok(false,'parses: '+f);}}
const html=fs.readFileSync(path.join(root,'app/renderer/index.html'),'utf8');
const map=/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1],h=crypto.createHash('sha256').update(map).digest('base64');
ok(html.includes(`'sha256-${h}'`),'CSP allows the import map');
const Core=require(path.join(root,'app/renderer/static/vinyl-core.js'));
for(const d of [5,30,90,200,600,1800,5400]){const m=Core.parameters(d),turns=d*m.rpm_cut/60,inner=m.r_start_mm-m.pitch_mm*(turns+m.lead_in_turns+m.lead_out_turns);
 ok(inner>m.label_radius_mm&&m.pitch_mm>0&&m.amp_mm<m.pitch_mm,`a ${d}s song fits its record (${m.disc_radius_mm*2} mm, pitch ${m.pitch_mm.toFixed(3)} mm, run-out at ${inner.toFixed(1)} mm)`);}
// wording: strings shown to people (menu labels, messages) never name tools/sites or say download/rip
const ui=[];for(const f of ['app/renderer/static/view.js','app/renderer/static/post.js','app/main.js','app/renderer/pet-player.js','app/renderer/pet-shell.js']){const s=fs.readFileSync(path.join(root,f),'utf8');
 for(const m of s.matchAll(/(?:label:|say\(|error:|return\s)['`]([^'`]{6,})['`]/g))ui.push(m[1]);}
const bad=ui.filter(t=>/youtube|yt-dlp|ffmpeg|download|rip\b|ripper/i.test(t));
ok(ui.length>30&&!bad.length,`user-facing text stays plain (${ui.length} strings checked${bad.length?': '+bad.join(' | '):''})`);
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');ok(!/youtube|ripper|downloader/i.test(readme),'README keeps the wording');
// the clipboard, whatever it hands back (Electron 44+: readText() is a Promise; old API: strings; odd values must never throw)
{const {readClipboardLink,firstUrl}=require(path.join(root,'app','clip-link.js'));const L='https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4';
 const item=(types,get)=>({types,getType:t=>Promise.resolve(get(t))});
 const cases=[
  ['readText() is a Promise (Electron 44+)',{readText:()=>Promise.resolve('  '+L+'\n')},L],
  ['readText() is a plain string (older Electron)',{readText:()=>L},L],
  ['readText() returns undefined',{readText:()=>undefined},''],
  ['readText() returns null',{readText:()=>null},''],
  ['readText() returns a number',{readText:()=>42},'42'],
  ['readText() returns an object',{readText:()=>({a:1})},''],
  ['readText() returns a Buffer',{readText:()=>Buffer.from(L)},L],
  ['readText() throws',{readText:()=>{throw new Error('boom');}},''],
  ['readText() rejects',{readText:()=>Promise.reject(new Error('no'))},''],
  ['readText() never settles',{readText:()=>new Promise(()=>{})},''],
  ['text has words around the link',{readText:()=>Promise.resolve('watch this: '+L+' (great)')},L],
  ['only a bookmark (right-click > Copy link)',{readText:()=>Promise.resolve(''),read:()=>Promise.resolve([item(['electron application/bookmark'],()=>({title:'Bunny',url:L}))])},L],
  ['only HTML with an href',{readText:()=>Promise.resolve(''),read:()=>Promise.resolve([item(['text/html'],()=>new Blob(['<a href="'+L+'">Bunny</a>']))])},L],
  ['a text/uri-list with a comment',{readText:()=>'',read:()=>Promise.resolve([item(['text/uri-list'],()=>'# from the browser\r\n'+L+'\r\n')])},L],
  ['read() returns junk',{readText:()=>'',read:()=>Promise.resolve([null,{types:'x'},{types:['text/html'],getType:()=>{throw 1;}}])},''],
  ['old API: readBookmark only',{readText:()=>'',readBookmark:()=>({title:'',url:L})},L],
  ['old API: readHTML only',{readText:()=>'',readHTML:()=>'<p><a href='+L+'>x</a></p>'},L],
  ['no clipboard at all',null,''],
  ['plain words, no link',{readText:()=>Promise.resolve('just some words')},'just some words'],
 ];
 for(const [name,cb,want] of cases){let got,err=null;try{got=await readClipboardLink(cb);}catch(e){err=e;}ok(!err&&typeof got==='string'&&got===want,`clipboard: ${name} -> ${JSON.stringify(got)}${err?' threw '+err.message:''}`);}
 ok(firstUrl('<a href="https://x.test/a?b=1&amp;c=2">')==='https://x.test/a?b=1&c=2','clipboard: HTML entities in an href are decoded');}
// main never lets a menu click or a stray error reach Electron's modal box
{const m=fs.readFileSync(path.join(root,'app/main.js'),'utf8');
 ok(/process\.on\('uncaughtException'/.test(m)&&/process\.on\('unhandledRejection'/.test(m),'main handles uncaught errors itself (no modal box)');
 ok(!/clipboard\.read(Text|HTML|Bookmark|Buffer)\(/.test(m),'main never reads the clipboard directly (only through clip-link.js)');
 const builds=[...m.matchAll(/Menu\.buildFromTemplate\(([^)]{0,12})/g)].map(x=>x[1]);ok(builds.length>=2&&builds.every(b=>b.startsWith('guard(')),`every menu is built through guard() (${builds.length})`);}
process.exit(fails?1:0);
