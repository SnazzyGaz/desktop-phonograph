/* What plays next and what came before: the order behind Next, Previous, Shuffle and Repeat.
   Pure (no DOM): loaded by the page as window.PlayOrder and by the unit tests through require().
   seq   the records in their own order (the order they were added; a list keeps its own order)
   state {shuffle, repeat:'off'|'all'|'one', played:[ids this shuffle cycle], history:[ids, oldest first], rng}
   why   'ended' (the record ran out) or 'skip' (Next was pressed) */
(function(root){
 'use strict';
 function baseOrder(entries){
  const groupStart=new Map();
  for(const e of entries)if(e.queue){const g=groupStart.get(e.queue);if(g==null||e.added<g)groupStart.set(e.queue,e.added);}
  return entries.slice().sort((a,b)=>{const ka=a.queue?groupStart.get(a.queue):a.added,kb=b.queue?groupStart.get(b.queue):b.added;
   return ka-kb||(a.queue&&a.queue===b.queue?(a.qIndex||0)-(b.qIndex||0):0)||String(a.id).localeCompare(String(b.id));}).map(e=>e.id);
 }
 function next(seq,cur,st={},why='skip'){
  const repeat=st.repeat||'off';
  if(!seq.length)return null;
  if(why==='ended'&&repeat==='one'&&seq.includes(cur))return cur;
  const wrap=repeat==='all'||repeat==='one'; // Next with Repeat One still moves on, and comes round again
  if(st.shuffle){
   const played=new Set([...(st.played||[]),cur]);
   let pool=seq.filter(id=>!played.has(id));
   if(!pool.length){if(!wrap)return null;pool=seq.filter(id=>id!==cur);if(!pool.length)return seq.includes(cur)?cur:null;}
   const r=typeof st.rng==='function'?st.rng():Math.random();
   return pool[Math.min(pool.length-1,Math.floor(r*pool.length))];
  }
  const i=seq.indexOf(cur);
  if(i<0)return seq[0];
  if(i+1<seq.length)return seq[i+1];
  return wrap?seq[0]:null;
 }
 function prev(seq,cur,st={}){
  if(!seq.length)return null;
  if(st.shuffle){const h=(st.history||[]).filter(id=>seq.includes(id));let k=h.lastIndexOf(cur);if(k<0)k=h.length;for(let j=k-1;j>=0;j--)if(h[j]!==cur)return h[j];return null;}
  const i=seq.indexOf(cur);
  if(i<0)return seq[seq.length-1];
  if(i>0)return seq[i-1];
  return st.repeat==='all'||st.repeat==='one'?seq[seq.length-1]:null;
 }
 // Previous: more than 3 s in, it starts the record again; otherwise the one before.
 function previousAction(seq,cur,t,st){if(t>3)return {restart:true,id:cur};const id=prev(seq,cur,st);return id?{restart:false,id}:{restart:true,id:cur};}
 // One shuffle cycle ends when everything has played; the played list then starts again.
 function notePlayed(st,id,seqLen){const p=(st.played||[]).filter(x=>x!==id);p.push(id);if(p.length>=seqLen)return [id];return p;}
 const api={baseOrder,next,prev,previousAction,notePlayed};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.PlayOrder=api;
})(typeof window!=='undefined'?window:globalThis);
