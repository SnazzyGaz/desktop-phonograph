// Downloads the two helper programs the Windows build bundles, and checks them against
// the publishers' own checksums. They are not kept in git. Run before building:
//   npm run fetch-tools
//  - yt-dlp.exe: latest release from https://github.com/yt-dlp/yt-dlp (SHA2-256SUMS)
//  - ffmpeg.exe: gyan.dev "release essentials" build (https://www.gyan.dev/ffmpeg/builds/, .sha256)
import fs from 'fs';import path from 'path';import crypto from 'crypto';import os from 'os';import {execFileSync} from 'child_process';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..'),out=path.join(root,'vendor-bin');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'desk-phonograph-build'}});if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}
const force=process.argv.includes('--force'),notes=[];
// yt-dlp
const yt=path.join(out,'yt-dlp.exe');
if(force||!fs.existsSync(yt)){
 const sums=(await get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS')).toString();
 const want=(sums.split('\n').find(l=>/\syt-dlp\.exe$/.test(l))||'').split(/\s+/)[0];if(!want)throw Error('no yt-dlp.exe checksum published');
 const exe=await get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
 if(sha(exe)!==want)throw Error('yt-dlp.exe checksum mismatch');fs.writeFileSync(yt,exe);console.log('yt-dlp.exe ok',want);
}
notes.push('yt-dlp.exe sha256 '+sha(fs.readFileSync(yt)));
// ffmpeg
const ff=path.join(out,'ffmpeg.exe');
if(force||!fs.existsSync(ff)){
 const base='https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
 const want=(await get(base+'.sha256')).toString().trim().split(/\s+/)[0];
 const zip=await get(base);if(sha(zip)!==want)throw Error('ffmpeg zip checksum mismatch');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ffz-')),zf=path.join(tmp,'ff.zip');fs.writeFileSync(zf,zip);
 if(process.platform==='win32')execFileSync('tar',['-xf',zf,'-C',tmp]);else execFileSync('unzip',['-q',zf,'-d',tmp]);
 const dir=fs.readdirSync(tmp).find(n=>/^ffmpeg-.*essentials_build$/.test(n));if(!dir)throw Error('unexpected ffmpeg zip layout');
 fs.copyFileSync(path.join(tmp,dir,'bin','ffmpeg.exe'),ff);fs.copyFileSync(path.join(tmp,dir,'LICENSE'),path.join(out,'FFMPEG-LICENSE.txt'));
 fs.writeFileSync(path.join(out,'FFMPEG-VERSION.txt'),dir.replace(/^ffmpeg-|-essentials_build$/g,'')+'\n');
 fs.rmSync(tmp,{recursive:true,force:true});console.log('ffmpeg.exe ok',dir);
}
notes.push('ffmpeg.exe sha256 '+sha(fs.readFileSync(ff)));
fs.writeFileSync(path.join(out,'TOOLS.txt'),notes.join('\n')+'\n');
console.log(notes.join('\n'));
