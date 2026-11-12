// Quick checks that need no window: every script parses, the page's CSP still allows its
// import map, records are sized sensibly for any song length, and user-facing text keeps
// to plain words (no tool names, no "download").
import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import crypto from 'crypto';import {execFileSync} from 'child_process';import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const f of ['app/renderer/static/view.js','app/renderer/static/post.js','app/main.js','app/preload.js','app/renderer/pet-player.js','app/renderer/pet-shell.js','app/renderer/pet-boot.js','app/clip-link.js','app/renderer/play-order.js','app/cover.js'])
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
// link covers: an ordered list of pictures, tried until one really is a picture
{const C=require(path.join(root,'app/cover.js'));
 const jpeg=(w,h,n)=>{const b=Buffer.alloc(Math.max(n,24));b.set([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,11,8]);b.writeUInt16BE(h,13);b.writeUInt16BE(w,15);return b;};
 const resp=(status,type,body)=>({ok:status>=200&&status<300,status,headers:{get:k=>/content-type/i.test(k)?type:null},arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)});
 const id='dQw4w9WgXcQ',one={id,ie_key:'Youtube',thumbnail:`https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`,thumbnails:[{url:'https://x.test/a.jpg',width:120,height:90},{url:'https://x.test/b.jpg',width:480,height:360},{url:'https://x.test/huge.jpg',width:1920,height:1080}]};
 const c1=C.thumbCandidates(one,'https://www.youtube.com/watch?v='+id);
 ok(c1[0]===one.thumbnail&&c1.indexOf('https://x.test/b.jpg')<c1.indexOf('https://x.test/a.jpg')&&c1.indexOf('https://x.test/a.jpg')<c1.indexOf('https://x.test/huge.jpg')&&c1.at(-1)===`https://i.ytimg.com/vi/${id}/default.jpg`&&c1.includes(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)&&new Set(c1).size===c1.length,`a single video: its named pictures biggest first (over 1280 wide last), then the standard sizes (${c1.length} candidates)`);
 const flat=C.thumbCandidates({id,ie_key:'Youtube',url:'https://www.youtube.com/watch?v='+id});
 ok(flat.length===5&&flat[0].endsWith('/maxresdefault.jpg')&&flat[1].endsWith('/sddefault.jpg')&&flat[4].endsWith('/default.jpg'),'a list entry with no pictures still gets the five standard sizes');
 ok(C.thumbCandidates({},'https://youtu.be/'+id+'?t=3').length===5&&C.thumbCandidates({},'https://example.com/song').length===0&&C.thumbCandidates({thumbnail:'https://cdn.test/t.png'},'https://vimeo.com/1').join()==='https://cdn.test/t.png','address-only links: short links work, other sites keep only their own pictures');
 {const many=C.thumbCandidates({id,ie_key:'Youtube',thumbnails:Array.from({length:40},(_,i)=>({url:'https://x.test/n'+i+'.jpg'}))});ok(many.length===16&&many.at(-1).endsWith('/default.jpg')&&many.at(-5).endsWith('/maxresdefault.jpg'),'a long list of named pictures never crowds out the standard sizes');}
 ok(C.thumbCandidates({thumbnails:[{url:'https://x.test/1.jpg'},{url:'https://x.test/2.jpg'}]}).join()==='https://x.test/2.jpg,https://x.test/1.jpg','pictures with no sizes: last listed first');
 const png=Buffer.alloc(40);png.set([0x89,0x50,0x4e,0x47,13,10,26,10]);png.writeUInt32BE(300,16);png.writeUInt32BE(200,20);
 const webp=Buffer.alloc(40);webp.write('RIFF',0,'latin1');webp.write('WEBPVP8X',8,'latin1');webp.writeUIntLE(1279,24,3);webp.writeUIntLE(719,27,3);
 const ii=[C.imageInfo(jpeg(640,480,3000)),C.imageInfo(png),C.imageInfo(webp),C.imageInfo(Buffer.from('<html>not found</html>'))];
 ok(ii[0].width===640&&ii[0].height===480&&ii[1].type==='image/png'&&ii[1].width===300&&ii[2].type==='image/webp'&&ii[2].width===1280&&ii[2].height===720&&ii[3]===null,'picture sizes read from JPEG, PNG and WebP headers; a web page is not a picture');
 // mocked fetch: 1st is missing (404 with the grey stand-in), 2nd answers 200 but is the stand-in, 3rd is HTML, 4th works (sent as a plain byte stream)
 const cands=['https://i.test/maxres.jpg','https://i.test/sd.jpg','https://i.test/page','https://i.test/hq.webp','https://i.test/mq.jpg'],asked=[];
 const fake=async u=>{asked.push(u);
  if(u.endsWith('maxres.jpg'))return resp(404,'image/jpeg',jpeg(120,90,1097));
  if(u.endsWith('sd.jpg'))return resp(200,'image/jpeg',jpeg(120,90,1097));
  if(u.endsWith('/page'))return resp(200,'text/html',Buffer.from('<!doctype html><title>x</title>'));
  if(u.endsWith('hq.webp'))return resp(200,'application/octet-stream',webp);
  throw new Error('should have stopped');};
 const got=await C.firstImage(cands,fake);
 ok(got&&got.index===3&&got.dataUrl.startsWith('data:image/webp;base64,')&&asked.length===4,`mocked fetch: a 404, a grey stand-in and a web page are skipped; the 4th picture is used (asked ${asked.length})`);
 ok(await C.firstImage(['https://i.test/a'],async()=>{throw new Error('offline');})===null&&await C.firstImage([],fake)===null&&await C.fetchImage('file:///c:/x.jpg',fake)===null,'offline, no candidates, or not a web address: no cover, no error');
 ok(await C.fetchImage('https://i.test/real-small',async()=>resp(200,'image/jpeg',jpeg(120,90,2888)))!==null,'a real 120x90 picture (a few KB) is still a cover');}
process.exit(fails?1:0);
