import { access, constants, cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root=process.cwd(), source=resolve(root,"experience/false-earth");
const exists=p=>access(p,constants.F_OK).then(()=>true,()=>false);
function run(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,stdio:"inherit",shell:process.platform==="win32"});if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);}
if(!(await exists(source)))throw new Error("False Earth 源码目录缺失：experience/false-earth。");
if(await exists(resolve(source,".git")))run("git",["submodule","update","--init","--recursive"],source);
await writeFile(resolve(source,"src/components/character/Character.tsx"),await readFile(resolve(root,"experience/overrides/Character.tsx"),"utf8"));
const loadingPath=resolve(source,"src/ui/LoadingScreen.tsx");
let loading=await readFile(loadingPath,"utf8");
loading=loading.replace("FALSE EARTH","星星的孩子")
.replace(/<p>\s*After drifting beyond the edge of space,[\s\S]*?<\/p>/,"<p>我们生活在同一个世界里，却不一定拥有相同的感受。这里是一颗陌生的星球。你可以按照自己的节奏，慢慢开始探索。</p>")
.replace(/<p>\s*With each step, something descends[\s\S]*?<\/p>/,"<p>不需要完成任务，也没有正确路线。停下来、转身或继续向前，都由你决定。</p>")
.replace("[ START ]","进入陌生星球")
.replace('label="MOVE"','label="移动"').replace('label="RUN"','label="奔跑"').replace('label="CAM"','label="镜头"').replace('label="LOOK"','label="观察"')
.replace("SYSTEM INCOMPATIBLE","当前浏览器暂不支持 3D 场景");
loading=loading.replace("ERROR CODE: {gpuError}","当前设备或浏览器没有可用的 WebGPU 图形设备。你仍可进入图文科普版本，继续浏览全部内容。");
loading=loading.replace("                        </button>\\n\\n                        <div style={{",'                        </button>\\n                        {gpuError && <a href="../?chapters=1" style={{marginTop:18,padding:"12px 18px",border:"1px solid rgba(255,255,255,.4)",borderRadius:24,color:"white",textDecoration:"none",fontSize:13,pointerEvents:"auto"}}>进入图文科普版本</a>}\\n\\n                        <div style={{');
if(loading.includes("After drifting")||loading.includes("With each step"))throw new Error("English opening copy was not replaced.");
await writeFile(loadingPath,loading);
const htmlPath=resolve(source,"index.html");
let html=await readFile(htmlPath,"utf8");
html=html.replace('<html lang="en">','<html lang="zh-CN">').replace("<title>False Earth</title>","<title>星星的孩子｜进入陌生星球</title>").replace('maximum-scale=1.0, user-scalable=0, ','');
const bootDiagnostic = String.raw`<div id="boot-diagnostic" style="position:fixed;z-index:999999;inset:0;display:flex;align-items:center;justify-content:center;background:#080b12;color:#fff;font:14px/1.6 system-ui;padding:24px;text-align:left">
  <div style="max-width:720px;width:100%">
    <div style="font-size:18px;margin-bottom:12px">正在启动 3D 场景…</div>
    <pre id="boot-diagnostic-detail" style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0;opacity:.9">正在加载场景模块，请稍候。</pre>
  </div>
</div>
<script>
(() => {
  const panel = document.getElementById("boot-diagnostic");
  const detail = document.getElementById("boot-diagnostic-detail");
  const show = message => {
    if (panel) panel.style.display = "flex";
    if (detail) detail.textContent = String(message).slice(0, 3000);
  };
  const hide = () => { if (panel) panel.style.display = "none"; };
  window.addEventListener("error", event => {
    if (event instanceof ErrorEvent) show("脚本运行错误：" + (event.message || event.filename || "未知错误"));
  });
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    show("未处理的异步错误：" + (reason && reason.stack ? reason.stack : String(reason ?? "未知错误")));
  });
  const moduleScript = document.querySelector('script[type="module"]');
  if (moduleScript) moduleScript.addEventListener("error", () => show("3D 程序入口加载失败：浏览器未能加载 src/index.jsx 或其依赖模块。请截图反馈。"));
  const root = document.getElementById("root");
  const appHasVisibleText = () => Boolean(root && root.textContent && root.textContent.trim().length > 0);
  if (root) {
    const observer = new MutationObserver(() => {
      // A React root can contain an empty canvas even when WebGPU rendering failed.
      // Only hide the diagnostic once the actual HTML loading/interface text appears.
      if (appHasVisibleText()) {
        window.__experienceAppMounted = true;
        hide();
        observer.disconnect();
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    if (appHasVisibleText()) {
      window.__experienceAppMounted = true;
      hide();
      observer.disconnect();
    }
  }
  window.setTimeout(() => {
    if (!window.__experienceAppMounted) show("3D 页面启动超时：页面没有渲染出可见的 HTML 界面文字。可能是 React 启动、WebGPU 初始化或脚本加载失败。请将这段提示截图发给开发者。");
  }, 12000);
})();
</script>`;
if (!html.includes('id="boot-diagnostic"')) {
  const moduleTag = '<script type="module" src="./src/index.jsx"></script>';
  if (!html.includes(moduleTag)) throw new Error("3D module script tag not found; boot diagnostic was not injected.");
  html = html.replace(moduleTag, bootDiagnostic + "\\n    " + moduleTag);
}

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

// Keep the original WebGPU capability check and Canvas gate. Without them,
// unsupported browsers can fail during renderer initialization and show a blank page.

const diagnosticState = "    const [runtimeError, setRuntimeError] = useState<string | null>(null);";
const diagnosticEffect = String.raw`    useEffect(() => {
        const onError = (event: ErrorEvent) => setRuntimeError(event.message || "Unknown script error");
        const onRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            setRuntimeError(reason instanceof Error ? reason.message : String(reason ?? "Unknown promise rejection"));
        };
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);
`;
if (!app.includes("    const [dpr, setDpr] = useState(1.5);")) throw new Error("App diagnostic insertion point missing.");
const gpuGateState = "    const [gpuCheckComplete, setGpuCheckComplete] = useState(false);";
app = app.replace("    const [dpr, setDpr] = useState(1.5);", "    const [dpr, setDpr] = useState(1.5);\n" + gpuGateState + "\n" + diagnosticState + "\n" + diagnosticEffect);
const gpuGateEffect = String.raw`    useEffect(() => {
        let cancelled = false;
        const checkWebGPU = async () => {
            try {
                if (!navigator.gpu) throw new Error("当前浏览器未提供 WebGPU");
                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter) throw new Error("没有可用的 WebGPU 图形设备");
                if (typeof adapter.requestDevice === "function") {
                    const device = await adapter.requestDevice();
                    device.destroy?.();
                }
                if (!cancelled) setGpuError(null);
            } catch (error) {
                if (!cancelled) setGpuError(error instanceof Error ? error.message : String(error));
            } finally {
                if (!cancelled) setGpuCheckComplete(true);
            }
        };
        void checkWebGPU();
        return () => { cancelled = true; };
    }, [setGpuError]);
`;
const oldCheckStart = "    // Check WebGPU support on mount";
const oldCheckEnd = "    useShortcut('c', () => {";
const checkStart = app.indexOf(oldCheckStart);
const checkEnd = app.indexOf(oldCheckEnd, checkStart);
if (checkStart < 0 || checkEnd < 0) throw new Error("Original WebGPU check block not found");
app = app.slice(0, checkStart) + gpuGateEffect + "\n" + app.slice(checkEnd);
app = app.replace("{!gpuError && (", "{gpuCheckComplete && !gpuError && (");

const uiAnchor = "        <UI />";
if (!app.includes(uiAnchor)) throw new Error("App UI diagnostic insertion point missing.");
const diagnosticOverlay = String.raw`
        {runtimeError && <div role="alert" style={{position:"fixed",left:12,right:12,bottom:12,zIndex:100000,padding:"14px 16px",border:"1px solid rgba(255,120,120,.65)",borderRadius:10,background:"rgba(20,8,12,.96)",color:"#fff",fontFamily:"monospace",fontSize:12,lineHeight:1.5,overflowWrap:"anywhere"}}>
            <strong>场景启动遇到错误</strong><div style={{marginTop:6}}>{runtimeError}</div><div style={{marginTop:6,opacity:.75}}>请截图反馈此信息</div>
        </div>}
`;
app = app.replace(uiAnchor, uiAnchor + diagnosticOverlay);

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
for (const folder of ["audio", "textures", "vat"]) {
  const sourceDir = resolve(output, folder);
  if (await exists(sourceDir)) {
    await cp(sourceDir, resolve(root, "dist", folder), { recursive: true, force: true });
  }
}
// GitHub Pages hosts this project below /FoundPhone-Studio/, not at the domain root.
// Resolve False Earth's origin-root media URLs relative to /experience/ so they work
// both on GitHub Pages and on the Cloudflare Worker preview.
for (const name of await readdir(resolve(output, "assets"))) {
  if (!name.endsWith(".js") && !name.endsWith(".css")) continue;
  const filePath = resolve(output, "assets", name);
  const content = await readFile(filePath, "utf8");
  const patched = content
    .replaceAll("../../textures/", "../textures/")
    .replaceAll("../../audio/", "../audio/")
    .replaceAll("/textures/", "../textures/")
    .replaceAll("/audio/", "../audio/");
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
