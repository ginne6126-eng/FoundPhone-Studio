import { access, constants, cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root=process.cwd(), source=resolve(root,"experience/false-earth");
const exists=p=>access(p,constants.F_OK).then(()=>true,()=>false);
function run(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,stdio:"inherit",shell:process.platform==="win32"});if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);}
if(!(await exists(resolve(source,".git"))))throw new Error("False Earth submodule missing. Run git submodule update --init --recursive.");
run("git",["submodule","update","--init","--recursive"],source);
await writeFile(resolve(source,"src/components/character/Character.tsx"),await readFile(resolve(root,"experience/overrides/Character.tsx"),"utf8"));
const loadingPath=resolve(source,"src/ui/LoadingScreen.tsx");
let loading=await readFile(loadingPath,"utf8");
loading=loading.replace("FALSE EARTH","星星的孩子")
.replace(/<p>\s*After drifting beyond the edge of space,[\s\S]*?<\/p>/,"<p>我们生活在同一个世界里，却不一定拥有相同的感受。这里是一颗陌生的星球。你可以按照自己的节奏，慢慢开始探索。</p>")
.replace(/<p>\s*With each step, something descends[\s\S]*?<\/p>/,"<p>不需要完成任务，也没有正确路线。停下来、转身或继续向前，都由你决定。</p>")
.replace("[ START ]","进入陌生星球")
.replace('label="MOVE"','label="移动"').replace('label="RUN"','label="奔跑"').replace('label="CAM"','label="镜头"').replace('label="LOOK"','label="观察"')
.replace("SYSTEM INCOMPATIBLE","当前浏览器暂不支持此体验");
if(loading.includes("After drifting")||loading.includes("With each step"))throw new Error("English opening copy was not replaced.");
await writeFile(loadingPath,loading);
const htmlPath=resolve(source,"index.html");
let html=await readFile(htmlPath,"utf8");
html=html.replace('<html lang="en">','<html lang="zh-CN">').replace("<title>False Earth</title>","<title>星星的孩子｜进入陌生星球</title>").replace('maximum-scale=1.0, user-scalable=0, ','');
if(html.includes("<title>False Earth</title>"))throw new Error("Original English document title remains.");
await writeFile(htmlPath,html);
const uiPath=resolve(source,"src/ui/UI.tsx");
let ui=await readFile(uiPath,"utf8");
const loadingAnchor="            <LoadingScreen />";
if(!ui.includes(loadingAnchor))throw new Error("False Earth UI insertion point missing.");
ui=ui.replace(loadingAnchor,loadingAnchor+String.raw`
            <a href="../?chapters=1" style={{position:"fixed",left:18,top:18,zIndex:60,pointerEvents:"auto",padding:"9px 14px",border:"1px solid rgba(255,255,255,.32)",borderRadius:24,color:"#eef3f8",background:"rgba(5,12,20,.38)",backdropFilter:"blur(12px)",fontSize:12,textDecoration:"none",letterSpacing:".08em"}}>探索手册 ↗</a>`);
await writeFile(uiPath,ui);
const cameraPath=resolve(source,"src/components/camera/CameraViewControl.tsx");
let camera=await readFile(cameraPath,"utf8");
const originalCameraTiming="smoothTime={isControlEnabled ? 0.1 : 1}";
if(!camera.includes(originalCameraTiming))throw new Error("Initial camera transition setting changed; review before patching.");
camera=camera.replace(originalCameraTiming,"smoothTime={isControlEnabled ? 0.12 : 3.2}");
await writeFile(cameraPath,camera);
const appPath=resolve(source,"src/app/App.tsx");
let app=await readFile(appPath,"utf8");
app=app.replace('import { Environment, PerformanceMonitor, useGLTF } from "@react-three/drei";','import { Environment, PerformanceMonitor } from "@react-three/drei";')
.replace('import { LevaWrapper, AudioManager, KeyboardMapper, KTX2Preloader, preloadVATAssets } from "@core";','import { LevaWrapper, AudioManager, KeyboardMapper } from "@core";')
.replace('import { ROSE_TEXTURES } from "../components/Rose/core/config";\n','')
.replace("import { BODY_TEXTURE_PATHS, DETAIL_TEXTURE_PATHS, MODEL_PATHS } from '../components/character/config';\n",'')
.replace("useGLTF.preload(MODEL_PATHS);\n\npreloadVATAssets('/vat/Rose_meta.json');\npreloadVATAssets('/vat/RoseLowPoly_meta.json');\n",'')
.replace('                    <KTX2Preloader paths={ROSE_TEXTURES} />\n                    <KTX2Preloader paths={BODY_TEXTURE_PATHS} />\n                    <KTX2Preloader paths={DETAIL_TEXTURE_PATHS} />\n','');
if(app.includes("KTX2Preloader")||app.includes("MODEL_PATHS")||app.includes("useGLTF.preload"))throw new Error("Astronaut asset preloads were not fully removed; aborting.");
await writeFile(appPath,app);
run("npm",["install","--no-audit","--no-fund"],source);
run("npm",["run","build","--","--base=./","--outDir=../../dist/experience","--emptyOutDir"],source);
const output=resolve(root,"dist/experience");
// The procedural child character replaces the licensed astronaut model and its animation set.
// Do not ship those unused assets in the public experience bundle.
await Promise.all([
  rm(resolve(output,"models"),{recursive:true,force:true}),
  rm(resolve(output,"textures/Body"),{recursive:true,force:true}),
  rm(resolve(output,"textures/Details"),{recursive:true,force:true}),
]);
// False Earth references public media with origin-root URLs such as /textures/... and /audio/...
// The experience is hosted under /experience/, so mirror its public folders at the Worker root.
for (const folder of ["audio", "textures"]) {
  const sourceDir = resolve(output, folder);
  if (await exists(sourceDir)) {
    await cp(sourceDir, resolve(root, "dist", folder), { recursive: true, force: true });
  }
}
// GitHub Pages hosts this project below /FoundPhone-Studio/, not at the domain root.
// Resolve False Earth's origin-root media URLs relative to /experience/ so they work
// both on GitHub Pages and on the Cloudflare Worker preview.
for (const name of await readdir(resolve(output, "assets"))) {
  if (!/\\.(?:js|css)$/.test(name)) continue;
  const filePath = resolve(output, "assets", name);
  const content = await readFile(filePath, "utf8");
  const patched = content
    .replaceAll("/textures/", "../../textures/")
    .replaceAll("/audio/", "../../audio/");
  if (patched !== content) await writeFile(filePath, patched);
}
const assetDir=resolve(output,"assets");
for(const name of await readdir(assetDir)){
  if(name.endsWith(".map"))await rm(resolve(assetDir,name),{force:true});
}
if(!(await exists(resolve(output,"index.html"))))throw new Error("3D experience entry file missing after build.");
const remainingModels=await exists(resolve(output,"models"));
if(remainingModels)throw new Error("Unused astronaut model assets remain in the public bundle.");
console.log("3D experience built to dist/experience; unused astronaut assets and source maps removed.");
