// The toy swap: the brass pip low on the cabinet front (and "Swap the dancer" in the right-click
// menu) swaps the hula girl for the shiba. Checks that the pip is on the pet and big enough to hit,
// that a real click on it is solid (not click-through) and picks 'toy-switch', that the shiba's
// baked mesh (shiba.bin) actually loads and shows, that the hula girl hides, that the choice is kept
// across a restart, and that it swaps back. 1.0.12 swapped to an empty shiba: nothing ever loaded it.
// Linux + xvfb: PLAYWRIGHT=/path/to/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node test/toy.mjs [out-dir]
process.on('unhandledRejection',e=>{console.log('TEST ERROR',e&&e.stack||e);process.exit(2);});
import {createRequire} from 'module';import fs from 'fs';import {fileURLToPath} from 'url';import path from 'path';import os from 'os';
const require=createRequire(import.meta.url);const {_electron}=require(process.env.PLAYWRIGHT||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=process.argv[2]||null;
const exe=process.env.DESK_EXE;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'dp-toy-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({volume:0,bounds:{x:700,y:400,width:440,height:393}}));
async function launch(){
 const app=await _electron.launch({executablePath:exe||require(path.join(root,'node_modules','electron')),args:[...(exe?[]:[root]),'--no-sandbox','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,DESK_PHONO_DATA:data,DESK_PHONO_TEST:'1'}});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/shiba/i.test(m.text()))errors.push(m.text());});
 await page.waitForSelector('canvas[data-ready]',{state:'attached',timeout:120000});await page.waitForTimeout(1500);return {app,page,errors};
}
const toyState=page=>page.evaluate(()=>{const v=window.vinylView,ph=v.phonograph,s=ph.getObjectByName('shiba-toy'),h=ph.getObjectByName('hula-girl');
 let tris=0;s?.traverse(o=>{if(o.isMesh&&o.geometry){const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position?.count||0)/3;}});
 return {toy:v.toy,shibaVisible:!!s&&s.visible&&s.scale.x>.5,shibaParts:s?s.children.length:0,shibaTris:Math.round(tris),hulaVisible:!!h&&h.visible&&h.scale.x>.5};});
let {app,page,errors}=await launch();
let st=await toyState(page);ok(st.toy==='hula'&&st.hulaVisible&&!st.shibaVisible,`starts with the hula girl (${JSON.stringify(st)})`);
// where the pip is, and how big it is on screen
const pip=await page.evaluate(()=>{const v=window.vinylView,T=v.THREE,o=v.phonograph.getObjectByName('toy-switch-pip'),b=v.phonograph.getObjectByName('toy-switch');b.updateMatrixWorld(true);
 const c=v.toClient(...b.getWorldPosition(new T.Vector3()).toArray()),box=new T.Box3().setFromObject(o),s=[];
 for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])s.push(v.toClient(x,box.max.y,z));
 const w=Math.max(...s.map(p=>p.x))-Math.min(...s.map(p=>p.x)),r=v.renderer.domElement.getBoundingClientRect();
 return {x:c.x,y:c.y,w,inCanvas:c.x>r.left&&c.x<r.right&&c.y>r.top&&c.y<r.bottom};});
ok(pip.inCanvas,`the pip is on the pet (${Math.round(pip.x)},${Math.round(pip.y)})`);ok(pip.w>=7,`the pip is big enough to see (${pip.w.toFixed(1)} px across)`);
ok(await page.evaluate(p=>window.petShell.hit(p.x,p.y),pip),'the pip is solid in the hit test (not click-through)');
ok(await page.evaluate(p=>window.vinylView.pickAt({clientX:p.x,clientY:p.y})?.kind,pip)==='toy-switch','the pick under the pip is the toy switch');
// a real click (through the X server, so the stage has to be solid there)
await page.mouse.move(pip.x,pip.y);await page.waitForFunction(()=>window.petShell.solid,null,{timeout:10000}).catch(()=>{});
await page.mouse.click(Math.round(pip.x),Math.round(pip.y));
await page.waitForFunction(()=>window.vinylView.toy==='shiba',null,{timeout:10000}).catch(()=>{});
await page.waitForFunction(()=>{const s=window.vinylView.phonograph.getObjectByName('shiba-toy');return s&&s.children.length&&s.visible&&s.scale.x>.99;},null,{timeout:30000}).catch(()=>{});
await page.mouse.move(2,2);await page.waitForTimeout(800);
st=await toyState(page);ok(st.toy==='shiba','clicking the pip swaps to the shiba');
ok(st.shibaParts>0&&st.shibaTris>1000,`the shiba is loaded (${st.shibaParts} parts, ${st.shibaTris} triangles)`);ok(st.shibaVisible&&!st.hulaVisible,'the shiba shows and the hula girl is gone');
// a pat: a real click on the dog makes him wobble (and is not a sleeve, a drag or click-through)
{const at=await page.evaluate(()=>{const v=window.vinylView,T=v.THREE,s=v.phonograph.getObjectByName('shiba-toy');s.updateMatrixWorld(true);const b=new T.Box3().setFromObject(s),m=b.getCenter(new T.Vector3());
  for(const f of [.55,.45,.65,.35,.75])for(const g of [.5,.35,.65]){const p=v.toClient(b.min.x+(b.max.x-b.min.x)*g,b.min.y+(b.max.y-b.min.y)*g,b.min.z+(b.max.z-b.min.z)*f);if(v.pickAt({clientX:p.x,clientY:p.y})?.kind==='shiba')return p;}return v.toClient(m.x,m.y,m.z);});
 ok(await page.evaluate(p=>window.vinylView.pickAt({clientX:p.x,clientY:p.y})?.kind,at)==='shiba','the pick on the dog is the dog (not a sleeve in the crate behind him)');
 ok(await page.evaluate(p=>window.petShell.hit(p.x,p.y),at),'the dog is solid in the hit test');
 const clip={x:Math.round(at.x-45),y:Math.round(at.y-45),width:90,height:90};
 await page.mouse.move(at.x,at.y);await page.waitForTimeout(600);
 const still=await page.screenshot({clip,omitBackground:true,timeout:120000});const m0=await page.evaluate(()=>window.vinylView.shibaMotion());
 const win0=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getPosition());
 await page.evaluate(()=>{window.__patMs=6000;}); // the box draws ~1-2 frames a second with the dog in view: a slow-motion pat
 await page.mouse.down();await page.mouse.up();
 const f0=await page.evaluate(()=>window.vinylView.renderer.info.render.frame);
 let peak=0;const shots=[];for(let i=0;i<6;i++){await page.waitForTimeout(400);shots.push(await page.screenshot({clip,omitBackground:true,timeout:120000}));const m=await page.evaluate(()=>window.vinylView.shibaMotion());peak=Math.max(peak,Math.hypot(...m.wob),Math.abs(m.ripple-m0.ripple));}
 const diff=await page.evaluate(async([a,list])=>{const px=async u=>{const im=new Image();im.src='data:image/png;base64,'+u;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,c.width,c.height).data;};
  const A=await px(a);let best=0;for(const u of list){const B=await px(u);let n=0;for(let i=0;i<A.length;i+=4)if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>30)n++;best=Math.max(best,n);}return best;},[still.toString('base64'),shots.map(b=>b.toString('base64'))]);
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'pat-before.png'),still);shots.forEach((b,i)=>fs.writeFileSync(path.join(out,`pat-${i}.png`),b));}
 console.log('  frames during the pat',(await page.evaluate(()=>window.vinylView.renderer.info.render.frame))-f0, 'clip',JSON.stringify(clip),'hopZ',await page.evaluate(()=>window.vinylView.phonograph.getObjectByName('shiba-yaw')?.position.z));
 ok(peak>.02,`a click wobbles him (peak ${peak.toFixed(3)}, at rest ${Math.hypot(...m0.wob).toFixed(3)})`);
 ok(diff>=20,`and it shows on screen (${diff} pixels changed)`);
 const win1=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getPosition());ok(win0.join()===win1.join(),'the pat did not move the window');
 ok(!(await page.evaluate(()=>window.vinylView.sleevePop)),'no sleeve popped out');}
if(out){fs.mkdirSync(out,{recursive:true});await page.evaluate(()=>{window.__k=setInterval(()=>window.vinylView.invalidate(3),100);});await page.screenshot({path:path.join(out,'toy-shiba.png'),omitBackground:true,timeout:120000});await page.evaluate(()=>clearInterval(window.__k));}
ok(!errors.length,`no page errors${errors.length?': '+errors.join(' | '):''}`);
await app.close();
// kept across a restart, and loaded straight away
({app,page,errors}=await launch());
await page.waitForFunction(()=>{const s=window.vinylView.phonograph.getObjectByName('shiba-toy');return s&&s.children.length&&s.visible;},null,{timeout:30000}).catch(()=>{});
st=await toyState(page);ok(st.toy==='shiba'&&st.shibaVisible&&st.shibaParts>0,`after a restart it is still the shiba, loaded (${JSON.stringify(st)})`);
ok(JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8')).toy==='shiba','settings.json says shiba');
// the menu command swaps back
await page.evaluate(()=>window.vinylView.swapToy());await page.waitForFunction(()=>{const h=window.vinylView.phonograph.getObjectByName('hula-girl');return h.visible&&h.scale.x>.99&&!window.vinylView.phonograph.getObjectByName('shiba-toy').visible;},null,{timeout:30000}).catch(()=>{});
st=await toyState(page);ok(st.toy==='hula'&&st.hulaVisible&&!st.shibaVisible,`swapping again brings the hula girl back (${JSON.stringify(st)})`);
ok(!errors.length,`no page errors${errors.length?': '+errors.join(' | '):''}`);
await app.close();
console.log(fails?`${fails} FAILED`:'all passed');process.exit(fails?1:0);
