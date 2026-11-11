// Quick checks that need no window: every script parses, the page's CSP still allows its
// import map, records are sized sensibly for any song length, and user-facing text keeps
// to plain words (no tool names, no "download").
import fs from 'fs';import path from 'path';import crypto from 'crypto';import {execFileSync} from 'child_process';import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const f of ['app/renderer/static/view.js','app/main.js','app/preload.js','app/renderer/pet-player.js','app/renderer/pet-shell.js','app/renderer/pet-boot.js'])
 {try{const src=fs.readFileSync(path.join(root,f),'utf8');if(f.endsWith('view.js')){const tmp=path.join(root,'test','.view-check.mjs');fs.writeFileSync(tmp,src);try{execFileSync(process.execPath,['--check',tmp]);}finally{fs.rmSync(tmp);}}else execFileSync(process.execPath,['--check',path.join(root,f)]);ok(true,'parses: '+f);}catch(e){ok(false,'parses: '+f);}}
const html=fs.readFileSync(path.join(root,'app/renderer/index.html'),'utf8');
const map=/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1],h=crypto.createHash('sha256').update(map).digest('base64');
ok(html.includes(`'sha256-${h}'`),'CSP allows the import map');
const Core=require(path.join(root,'app/renderer/static/vinyl-core.js'));
for(const d of [5,30,90,200,600,1800,5400]){const m=Core.parameters(d),turns=d*m.rpm_cut/60,inner=m.r_start_mm-m.pitch_mm*(turns+m.lead_in_turns+m.lead_out_turns);
 ok(inner>m.label_radius_mm&&m.pitch_mm>0&&m.amp_mm<m.pitch_mm,`a ${d}s song fits its record (${m.disc_radius_mm*2} mm, pitch ${m.pitch_mm.toFixed(3)} mm, run-out at ${inner.toFixed(1)} mm)`);}
// wording: strings shown to people (menu labels, messages) never name tools/sites or say download/rip
const ui=[];for(const f of ['app/renderer/static/view.js','app/main.js','app/renderer/pet-player.js','app/renderer/pet-shell.js']){const s=fs.readFileSync(path.join(root,f),'utf8');
 for(const m of s.matchAll(/(?:label:|say\(|error:|return\s)['`]([^'`]{6,})['`]/g))ui.push(m[1]);}
const bad=ui.filter(t=>/youtube|yt-dlp|ffmpeg|download|rip\b|ripper/i.test(t));
ok(ui.length>30&&!bad.length,`user-facing text stays plain (${ui.length} strings checked${bad.length?': '+bad.join(' | '):''})`);
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');ok(!/youtube|ripper|downloader/i.test(readme),'README keeps the wording');
process.exit(fails?1:0);
