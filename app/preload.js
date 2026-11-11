'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const on=(ch,fn)=>{const h=(e,...a)=>fn(...a);ipcRenderer.on(ch,h);return ()=>ipcRenderer.removeListener(ch,h);};
contextBridge.exposeInMainWorld('desk',{
 solid:s=>ipcRenderer.send('pet:solid',!!s),
 moveStart:(x,y)=>ipcRenderer.send('pet:move-start',x,y),move:(x,y)=>ipcRenderer.send('pet:move',x,y),moveEnd:()=>ipcRenderer.send('pet:move-end'),
 resize:(dir,fx,fy)=>ipcRenderer.send('pet:resize',dir,fx,fy),
 menu:state=>ipcRenderer.invoke('pet:menu',state),
 settings:()=>ipcRenderer.invoke('pet:settings'),set:patch=>ipcRenderer.send('pet:set',patch),
 clipboard:()=>ipcRenderer.invoke('pet:clipboard'),
 library:()=>ipcRenderer.invoke('pet:library'),saveLibrary:list=>ipcRenderer.invoke('pet:library-save',list),
 saveCover:(id,url)=>ipcRenderer.invoke('pet:cover-save',id,url),forget:(id,file)=>ipcRenderer.invoke('pet:forget',id,file),
 keep:(file,on)=>ipcRenderer.invoke('pet:keep',file,on),
 read:file=>ipcRenderer.invoke('pet:read',file),transcode:(file,opts)=>ipcRenderer.invoke('pet:transcode',file,opts),probe:file=>ipcRenderer.invoke('pet:probe',file),
 image:url=>ipcRenderer.invoke('pet:image',url),
 linkInfo:url=>ipcRenderer.invoke('pet:link-info',url),linkFetch:(job,url,direct)=>ipcRenderer.invoke('pet:link-fetch',job,url,direct),
 tempSweep:files=>ipcRenderer.invoke('pet:temp-sweep',files),
 pathOf:file=>{try{return webUtils.getPathForFile(file);}catch{return '';}},
 onCommand:fn=>on('pet:command',fn),onProgress:fn=>on('pet:link-progress',fn),
 log:(...a)=>ipcRenderer.send('pet:log',...a)
});
