/* Cover pictures for web links. Pure (no Electron): used by the main process and the unit tests.
   A link can name several pictures (sizes, formats). Some of the biggest don't exist for older
   videos (the site answers 404, sometimes with a small grey stand-in picture), and a list's
   entries often carry no sizes at all. So we keep an ordered list of candidates, biggest first,
   and take the first one that really is a picture. */
'use strict';
const MAX_BYTES=8e6,MAX_CANDIDATES=16;
// Video sites whose pictures live at a known address for every video id (tried after the named ones).
function videoIdOf(x,url){
 const key=String(x&&(x.ie_key||x.extractor_key||x.extractor)||'');
 if(/^youtube$/i.test(key)&&/^[\w-]{11}$/.test(String(x.id||'')))return x.id;
 const u=String(url||x&&(x.webpage_url||x.url||x.original_url)||'');
 const m=/^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{11})(?![\w-])/i.exec(u);
 return m?m[1]:null;
}
const KNOWN=['maxresdefault','sddefault','hqdefault','mqdefault','default'];
function knownPictures(id){return id?KNOWN.map(n=>`https://i.ytimg.com/vi/${id}/${n}.jpg`):[];}
function thumbCandidates(x,url){
 x=x||{};const out=[],seen=new Set();
 const push=u=>{if(typeof u!=='string'||!/^https?:\/\//i.test(u)||seen.has(u))return;seen.add(u);out.push(u);};
 push(x.thumbnail);
 const t=Array.isArray(x.thumbnails)?x.thumbnails.filter(t=>t&&typeof t.url==='string'):[];
 const area=t=>(t.width||0)*(t.height||0),small=t.filter(z=>(z.width||0)<=1280),big=t.filter(z=>(z.width||0)>1280);
 const by=(a,b)=>area(b)-area(a)||(b.preference||0)-(a.preference||0);
 // with no sizes given, the last-listed is usually the best (yt-dlp lists worst to best)
 const sized=[...small].sort(by),unsized=t.filter(z=>!area(z)).reverse();
 for(const z of sized.filter(z=>area(z)))push(z.url);
 for(const z of unsized)push(z.url);
 for(const z of big.sort(by))push(z.url);
 out.splice(MAX_CANDIDATES-KNOWN.length); // room is kept for the standard sizes
 for(const u of knownPictures(videoIdOf(x,url)))push(u);
 return out;
}
// What kind of picture the bytes are, and how big (enough of JPEG/PNG/GIF/WebP/AVIF headers).
function imageInfo(b){
 if(!b||b.length<12)return null;
 if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return {type:'image/png',width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b.toString('latin1',0,4)==='GIF8')return {type:'image/gif',width:b.readUInt16LE(6),height:b.readUInt16LE(8)};
 if(b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP'){
  const k=b.toString('latin1',12,16);let w=0,h=0;
  if(k==='VP8 '&&b.length>29){w=b.readUInt16LE(26)&0x3fff;h=b.readUInt16LE(28)&0x3fff;}
  else if(k==='VP8L'&&b.length>24){const v=b.readUInt32LE(21);w=(v&0x3fff)+1;h=((v>>14)&0x3fff)+1;}
  else if(k==='VP8X'&&b.length>29){w=b.readUIntLE(24,3)+1;h=b.readUIntLE(27,3)+1;}
  return {type:'image/webp',width:w,height:h};}
 if(b.toString('latin1',4,8)==='ftyp'&&/avi[fs]/.test(b.toString('latin1',8,12)))return {type:'image/avif',width:0,height:0};
 if(b[0]===0xff&&b[1]===0xd8){
  let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue;}const m=b[i+1];
   if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   const len=b.readUInt16BE(i+2);
   if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return {type:'image/jpeg',width:b.readUInt16BE(i+7),height:b.readUInt16BE(i+5)};
   i+=2+len;}
  return {type:'image/jpeg',width:0,height:0};}
 return null;
}
// The grey "no picture" stand-in some sites send instead of a missing size: 120x90 and tiny.
// (A real 120x90 picture is a few KB; the page also checks the decoded pixels for plain grey.)
function isPlaceholder(info,bytes){return !!info&&info.width===120&&info.height===90&&bytes.length<2000;}
async function fetchImage(url,fetchImpl){
 try{
  if(!/^https?:\/\//i.test(String(url)))return null;
  const r=await fetchImpl(url);if(!r||!r.ok)return null;
  const b=Buffer.from(await r.arrayBuffer());if(!b.length||b.length>MAX_BYTES)return null;
  const info=imageInfo(b);if(!info)return null; // whatever the content-type says, it must be a picture
  if(isPlaceholder(info,b))return null;
  return 'data:'+info.type+';base64,'+b.toString('base64');
 }catch{return null;}
}
// First candidate that is a real picture: {index, dataUrl}, or null.
async function firstImage(cands,fetchImpl){
 const list=Array.isArray(cands)?cands:[cands];
 for(let i=0;i<list.length;i++){const d=await fetchImage(list[i],fetchImpl);if(d)return {index:i,dataUrl:d};}
 return null;
}
module.exports={thumbCandidates,videoIdOf,imageInfo,isPlaceholder,fetchImage,firstImage};
