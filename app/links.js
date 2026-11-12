'use strict';
/* What kind of web link is it? Pure (no Electron): used by main.js and the unit tests.
   A watch link that carries a list (…watch?v=X&list=Y) means the whole list, starting at X.
   Auto-made mixes (list ids starting RD) never end, so only the first MIX_CAP are taken. */
const LIST_CAP=200,MIX_CAP=25;
function classify(url){
 let u;try{u=new URL(String(url||'').trim());}catch{return {list:null,mix:false,video:null};}
 const q=u.searchParams,list=q.get('list')||null;
 let video=q.get('v')||null;
 if(!video&&/(^|\.)youtu\.be$/i.test(u.hostname))video=u.pathname.slice(1).split('/')[0]||null;
 return {list,mix:!!list&&/^RD/i.test(list),video};
}
// yt-dlp arguments for the "what is behind this link" look (flat: nothing downloaded)
function infoArgs(url){
 const c=classify(url);
 return ['--flat-playlist','-J','--no-warnings','--ignore-config',...(c.list?['--yes-playlist']:[]),'--playlist-end',String(c.mix?MIX_CAP:LIST_CAP),url];
}
// A list starts where the pasted link pointed; the ones before it go round to the end.
function startAt(entries,video){
 if(!video)return entries;const i=entries.findIndex(e=>e&&e.id===video);
 return i>0?[...entries.slice(i),...entries.slice(0,i)]:entries;
}
const LIST_HIDDEN='Only this one: the list it came from is private or hidden, so I can\u2019t see the rest.';
module.exports={classify,infoArgs,startAt,LIST_CAP,MIX_CAP,LIST_HIDDEN};
