import { access, constants, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root=process.cwd(), source=resolve(root,"experience/false-earth");
const exists=p=>access(p,constants.F_OK).then(()=>true,()=>false);
function run(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,stdio:"inherit",shell:process.platform==="win32"});if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);}
if(!(await exists(resolve(source,".git"))))throw new Error("False Earth submodule missing. Run git submodule update --init --recursive.");
run("git",["submodule","update","--init","--recursive"],source);
await writeFile(resolve(source,"src/components/character/Character.tsx"),await readFile(resolve(root,"experience/overrides/Character.tsx"),"utf8"));
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
