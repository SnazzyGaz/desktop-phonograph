'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const on=(ch,fn)=>{const h=(e,...a)=>fn(...a);ipcRenderer.on(ch,h);return ()=>ipcRenderer.removeListener(ch,h);};
let initialStage=null;try{const a=(process.argv||[]).find(x=>x.startsWith('--dp-stage='));if(a)initialStage=JSON.parse(a.slice(11));}catch{}
contextBridge.exposeInMainWorld('desk',{
 initialStage,placed:()=>ipcRenderer.send('pet:placed'),
 solid:s=>ipcRenderer.send('pet:solid',!!s),
 moveStart:(x,y)=>ipcRenderer.send('pet:move-start',x,y),move:(x,y)=>ipcRenderer.send('pet:move',x,y),moveEnd:()=>ipcRenderer.send('pet:move-end'),
 zoomTo:rect=>ipcRenderer.invoke('pet:zoom-to',rect),
 stageGet:()=>ipcRenderer.invoke('pet:stage'),onStage:fn=>on('pet:stage',fn),
 onStageHold:fn=>on('pet:stage-hold',fn),stageHeld:n=>ipcRenderer.send('pet:stage-held',n),handoffReady:()=>ipcRenderer.send('pet:stage-handoff-ok'),
 menu:state=>ipcRenderer.invoke('pet:menu',state),
 settings:()=>ipcRenderer.invoke('pet:settings'),toyData:()=>ipcRenderer.invoke('pet:toy-data'),set:patch=>ipcRenderer.send('pet:set',patch),
 clipboard:()=>ipcRenderer.invoke('pet:clipboard'),
 room:step=>ipcRenderer.invoke('pet:room',step),
 library:()=>ipcRenderer.invoke('pet:library'),saveLibrary:list=>ipcRenderer.invoke('pet:library-save',list),
 saveCover:(id,url)=>ipcRenderer.invoke('pet:cover-save',id,url),forget:(id,file)=>ipcRenderer.invoke('pet:forget',id,file),
 keep:(file,on)=>ipcRenderer.invoke('pet:keep',file,on),
 read:file=>ipcRenderer.invoke('pet:read',file),transcode:(file,opts)=>ipcRenderer.invoke('pet:transcode',file,opts),probe:file=>ipcRenderer.invoke('pet:probe',file),
 duration:file=>ipcRenderer.invoke('pet:duration',file),loading:id=>ipcRenderer.send('pet:loading',id||null),boot:()=>ipcRenderer.invoke('pet:boot'),
 image:url=>ipcRenderer.invoke('pet:image',url),coverFrom:cands=>ipcRenderer.invoke('pet:cover-from',cands),linkThumbs:(url,deep)=>ipcRenderer.invoke('pet:link-thumbs',url,deep),
 linkInfo:url=>ipcRenderer.invoke('pet:link-info',url),linkFetch:(job,url,direct)=>ipcRenderer.invoke('pet:link-fetch',job,url,direct),
 tempSweep:files=>ipcRenderer.invoke('pet:temp-sweep',files),
 pathOf:file=>{try{return webUtils.getPathForFile(file);}catch{return '';}},
 onCommand:fn=>on('pet:command',fn),onProgress:fn=>on('pet:link-progress',fn),
 log:(...a)=>ipcRenderer.send('pet:log',...a)
});
