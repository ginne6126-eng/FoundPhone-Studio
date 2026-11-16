import { access, constants, readFile, writeFile } from "node:fs/promises";
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
.replace("After drifting beyond the edge of space, the journey reaches ground again.\n                            A surface extends in every direction, without a visible boundary.\n                            No matter how far it continues, the horizon does not draw closer.","我们生活在同一个世界里，却不一定拥有相同的感受。\n                            这里是一颗陌生的星球。你可以按照自己的节奏，慢慢开始探索。")
.replace("With each step, something descends and alters the surface, leaving traces behind.\n                            The drift does not end here; it continues in another form.","不需要完成任务，也没有正确路线。停下来、转身或继续向前，都由你决定。")
.replace("[ START ]","进入陌生星球")
.replace('label="MOVE"','label="移动"').replace('label="RUN"','label="奔跑"').replace('label="CAM"','label="镜头"').replace('label="LOOK"','label="观察"')
.replace("SYSTEM INCOMPATIBLE","当前浏览器暂不支持此体验");
await writeFile(loadingPath,loading);
const uiPath=resolve(source,"src/ui/UI.tsx");
let ui=await readFile(uiPath,"utf8");
const loadingAnchor="            <LoadingScreen />";
if(!ui.includes(loadingAnchor))throw new Error("False Earth UI insertion point missing.");
ui=ui.replace(loadingAnchor,loadingAnchor+String.raw`
            <a href="../?chapters=1" style={{position:"fixed",left:18,top:18,zIndex:60,pointerEvents:"auto",padding:"9px 14px",border:"1px solid rgba(255,255,255,.32)",borderRadius:24,color:"#eef3f8",background:"rgba(5,12,20,.38)",backdropFilter:"blur(12px)",fontSize:12,textDecoration:"none",letterSpacing:".08em"}}>探索手册 ↗</a>`);
await writeFile(uiPath,ui);
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
console.log("3D experience built to dist/experience.");
