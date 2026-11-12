// Downloads the two helper programs the Windows build bundles, and checks them against
// the publishers' own checksums. They are not kept in git. Run before building:
//   npm run fetch-tools
//  - yt-dlp.exe: latest release from https://github.com/yt-dlp/yt-dlp (SHA2-256SUMS)
//  - ffmpeg.exe: our slim audio-focused LGPL build (tools/build-ffmpeg-slim.sh), from this repo's releases
import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import crypto from 'crypto';import os from 'os';import {execFileSync} from 'child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'vendor-bin');
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
// ffmpeg: our own slim, audio-focused LGPL build (tools/build-ffmpeg-slim.sh), published as
// assets of the "ffmpeg-slim-9.0.2" release of this repository and pinned here by checksum.
const FF_VER='9.0.2',FF_SHA='b2722696ef30224ed9dae0e52135f043c3ee33a4613b848640b5752af387b00f';
const FF_URL=`https://github.com/SnazzyGaz/desktop-phonograph/releases/download/ffmpeg-slim-${FF_VER}/`;
const ff=path.join(out,'ffmpeg.exe');
if(force||!fs.existsSync(ff)||sha(fs.readFileSync(ff))!==FF_SHA){
 const exe=await get(FF_URL+'ffmpeg.exe');if(sha(exe)!==FF_SHA)throw Error('ffmpeg.exe checksum mismatch');
 fs.writeFileSync(ff,exe);fs.writeFileSync(path.join(out,'FFMPEG-LICENSE.txt'),await get(FF_URL+'FFMPEG-LICENSE.txt'));
 fs.writeFileSync(path.join(out,'FFMPEG-VERSION.txt'),FF_VER+'\n');
 console.log('ffmpeg.exe ok',FF_VER);
}
notes.push('ffmpeg.exe sha256 '+sha(fs.readFileSync(ff)));
for(const f of ['yt-dlp.exe','ffmpeg.exe','FFMPEG-LICENSE.txt'])if(!fs.existsSync(path.join(out,f)))throw Error('missing '+f);
fs.writeFileSync(path.join(out,'TOOLS.txt'),notes.join('\n')+'\n');
console.log(notes.join('\n'));
