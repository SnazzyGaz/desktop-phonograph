// Quick checks that need no window: every script parses, the page's CSP still allows its
// import map, records are sized sensibly for any song length, and user-facing text keeps
// to plain words (no tool names, no "download").
import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import crypto from 'crypto';import {execFileSync} from 'child_process';import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const f of ['app/renderer/static/view.js','app/renderer/static/post.js','app/main.js','app/preload.js','app/renderer/pet-player.js','app/renderer/pet-shell.js','app/renderer/pet-boot.js','app/clip-link.js','app/renderer/play-order.js'])
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
{const {readClipboardLink,firstUrl}=require(path.join(root,'app','clip-link.js'));const L='https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.360p.vp9.webm';
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
// link errors in plain words, matched to the right cause
{const m=fs.readFileSync(path.join(root,'app/main.js'),'utf8');const src=/function friendly\(err\)\{[\s\S]*?\n\}/.exec(m)[0];const friendly=new Function(src+';return friendly;')();
 for(const [err,want] of [['ERROR: [generic] x: Unable to download webpage: HTTP Error 404: Not Found',/go anywhere/],['ERROR: Sign in to confirm your age. This video may be inappropriate',/sign in/],['ERROR: Private video. Sign in if you have been granted access',/sign in/],
  ['ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>',/internet/],['ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests',/busy/],['ERROR: Unsupported URL: https://example.com/',/anything I can play/],['ERROR: [generic] Unable to download webpage: HTTP Error 500',/wouldn.t play/]])
  ok(want.test(friendly(err)),`error words: “${err.slice(7,60)}…” → “${friendly(err)}”`);}
// Next / Previous / Shuffle / Repeat order (play-order.js)
{const O=require(path.join(root,'app/renderer/play-order.js'));const seq=['a','b','c','d'];
 ok(O.baseOrder([{id:'c',added:3},{id:'a',added:1},{id:'q1',added:5,queue:'Q',qIndex:1},{id:'q0',added:9,queue:'Q',qIndex:0},{id:'b',added:2}]).join()==='a,b,c,q0,q1','base order: as added, a list keeps its own order from where it started');
 ok(O.next(seq,'b',{})==='c'&&O.next(seq,'d',{})===null&&O.next(seq,'d',{repeat:'all'})==='a','in order: Next moves on, stops at the end, Repeat All goes round');
 ok(O.next(seq,'b',{repeat:'one'},'ended')==='b'&&O.next(seq,'b',{repeat:'one'},'skip')==='c'&&O.next(seq,'d',{repeat:'one'},'skip')==='a','Repeat One: a record that ends plays again; Next still moves on (and comes round)');
 ok(O.prev(seq,'c',{})==='b'&&O.prev(seq,'a',{})===null&&O.prev(seq,'a',{repeat:'all'})==='d','Previous: the one before, nothing before the first unless repeating');
 ok(O.previousAction(seq,'c',5,{}).restart===true&&O.previousAction(seq,'c',1.5,{}).id==='b'&&O.previousAction(seq,'a',1,{}).restart===true,'Previous more than 3 s in restarts; early on goes back; at the first record restarts');
 {let st={shuffle:true,played:['a']},cur='a',got=[cur];const rng=(()=>{let x=7;return ()=>((x=x*1103515245+12345&0x7fffffff)/0x7fffffff);})();
  for(let i=0;i<3;i++){cur=O.next(seq,cur,{...st,rng});got.push(cur);st.played=O.notePlayed(st,cur,seq.length);}
  ok(new Set(got).size===4,`shuffle plays every record once before any repeats (${got.join('')})`);
  ok(O.next(seq,cur,{shuffle:true,played:got,rng})===null,'shuffle, Repeat off: stops when the cycle is done');
  const again=O.next(seq,cur,{shuffle:true,repeat:'all',played:got,rng});ok(again&&again!==cur,'shuffle, Repeat All: a new cycle, never the same record twice in a row');
  ok(O.notePlayed({played:['a','b','c']},'d',4).join()==='d','a finished cycle starts the played list again');
  ok(O.prev(seq,'c',{shuffle:true,history:['a','d','c']})==='d'&&O.prev(seq,'a',{shuffle:true,history:['a']})===null,'shuffle Previous walks back through what actually played');}
 ok(O.next([],'a',{})===null&&O.next(['a'],'a',{shuffle:true,repeat:'all'})==='a'&&O.next(seq,'zz',{})==='a','edge cases: empty, one record, a record no longer in the list');}
process.exit(fails?1:0);
