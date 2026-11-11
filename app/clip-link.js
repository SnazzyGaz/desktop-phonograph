'use strict';
/* Getting a link off the clipboard, whatever shape the clipboard API hands back.
   Electron 44 made the main-process clipboard asynchronous (readText() is a Promise, and
   readBookmark/readHTML/readBuffer went away in favour of read() -> ClipboardItem[]), so every
   value here is treated as unknown: awaited if it is thenable, coerced to text, never trusted. */
const URL_RE=/\bhttps?:\/\/[^\s"'<>]+/i;
function asText(v){
 if(v==null)return '';
 if(typeof v==='string')return v;
 if(typeof Buffer!=='undefined'&&Buffer.isBuffer(v))return v.toString('utf8').replace(/\0+$/,'');
 if(v instanceof Uint8Array)return new TextDecoder().decode(v).replace(/\0+$/,'');
 if(typeof v==='object'){if(typeof v.url==='string')return v.url;if(typeof v.text==='string')return v.text;return '';}
 try{return String(v);}catch{return '';}
}
// The first http(s) link in some text, HTML (an href first) or a text/uri-list.
function firstUrl(v){
 const s=asText(v);if(!s)return '';
 const href=/href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i.exec(s);if(href)return decodeEntities(href[1]);
 for(const line of s.split(/\r?\n/)){const l=line.trim();if(!l||l.startsWith('#'))continue;const m=URL_RE.exec(l);if(m)return trimTail(m[0]);}
 return '';
}
const decodeEntities=s=>s.replace(/&amp;/g,'&').replace(/&#38;/g,'&');
const trimTail=s=>s.replace(/[)\].,;:!?]+$/,'');
async function settle(f,ms=1500){
 try{let v=f();if(v&&typeof v.then==='function')v=await Promise.race([v,new Promise(r=>setTimeout(()=>r(null),ms))]);return v;}catch{return null;}
}
// Best link on the clipboard; failing that the plain text (trimmed), so the page can say what it found.
async function readClipboardLink(cb){
 if(!cb)return '';
 const text=asText(await settle(()=>cb.readText())).trim();
 const fromText=firstUrl(text);if(fromText)return fromText;
 if(typeof cb.read==='function'){ // Electron 44+: ClipboardItem[] with lazy getType()
  const items=await settle(()=>cb.read());
  if(Array.isArray(items))for(const it of items){
   const types=Array.isArray(it?.types)?it.types:[];
   for(const t of ['electron application/bookmark','text/uri-list','text/html','text/plain']){
    if(!types.includes(t)||typeof it.getType!=='function')continue;
    let v=await settle(()=>it.getType(t));
    if(v&&typeof v!=='string'&&typeof v.text==='function'&&typeof v.url!=='string')v=await settle(()=>v.text());
    const u=firstUrl(v);if(u)return u;
   }
  }
 }
 for(const f of [()=>cb.readBookmark?.(),()=>cb.readHTML?.(),()=>cb.readBuffer?.('text/uri-list')]){ // older Electron
  const u=firstUrl(await settle(f));if(u)return u;
 }
 return text;
}
module.exports={readClipboardLink,firstUrl,asText};
