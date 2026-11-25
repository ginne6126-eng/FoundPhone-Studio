import { Environment, PerformanceMonitor } from "@react-three/drei";
import { LevaWrapper, AudioManager, KeyboardMapper } from "@core";
import { Canvas, useLoader } from "@react-three/fiber";
import { useEffect, Suspense, useMemo, useState } from "react";
import { DirectionalLight } from "../components/DirectionalLight";
import { WebGPURenderer } from "three/webgpu";
import Effects from "../components/Effects/Effects";
import { useGameStore } from "../core/store/gameStore";
import { CameraViewControl } from "../components/camera/CameraViewControl";
import { DeviceDetector } from "../core/utils/DeviceDetector";
import { UI } from "../ui/UI";
import { WorldController } from "../components/WorldController";
import { createContext } from "react";
import * as THREE from "three/webgpu";
import { input, keyBindings } from "../core/input/controls";
import { useShortcut } from "@core/hooks/useShortcut";
import { AudioLoader } from 'three';


useLoader.preload(AudioLoader,
    ['/audio/fs_grass1.mp3',
        '/audio/fs_grass2.mp3',
        '/audio/fs_grass3.mp3',
        '/audio/fs_grass4.mp3',
        '/audio/fs_grass5.mp3']);

useLoader.preload(AudioLoader, ['/audio/wave01.mp3']);


export const BeamSceneContext = createContext<THREE.Scene | null>(null);

export default function App() {
    const beamScene = useMemo(() => new THREE.Scene(), []);
    const [dpr, setDpr] = useState(1.5);
    const [gpuCheckComplete, setGpuCheckComplete] = useState(false);
    const [runtimeError, setRuntimeError] = useState<string | null>(null);
    useEffect(() => {
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


    const toggleCameraMode = useGameStore((state) => state.toggleCameraMode);
    const setGpuError = useGameStore((state) => state.setGpuError);
    const setAudioListener = useGameStore((state) => state.setAudioListener);
    const gpuError = useGameStore((state) => state.gpuError);

    useEffect(() => {
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

    useShortcut('c', () => {
        toggleCameraMode();
    });

    return <>
        <LevaWrapper collapsed={true} initialHidden={true} />
        <DeviceDetector />
        <UI />
        {runtimeError && <div role="alert" style={{position:"fixed",left:12,right:12,bottom:12,zIndex:100000,padding:"14px 16px",border:"1px solid rgba(255,120,120,.65)",borderRadius:10,background:"rgba(20,8,12,.96)",color:"#fff",fontFamily:"monospace",fontSize:12,lineHeight:1.5,overflowWrap:"anywhere"}}>
            <strong>场景启动遇到错误</strong><div style={{marginTop:6}}>{runtimeError}</div><div style={{marginTop:6,opacity:.75}}>请截图反馈此信息</div>
        </div>}

        <KeyboardMapper input={input} keyMap={keyBindings} />


        {gpuCheckComplete && !gpuError && (
            <Canvas
                camera={{
                    fov: 45,
                    near: 0.1,
                    far: 200,
                    position: [20, 20, 30]
                }}
                gl={(canvas) => {
                    const renderer = new WebGPURenderer({
                        ...canvas as any,
                        powerPreference: "high-performance",
                        antialias: true,
                        alpha: true,
                    });
                    renderer.setClearColor('#000000');
                    renderer.autoClear = true;
                    // renderer.inspector = new Inspector();
                    renderer.sortObjects = false;

                    return renderer.init().then(() => renderer);
                }}
                dpr={dpr}
            >
                <Suspense fallback={null}>
                </Suspense>

                <AudioManager onListenerCreated={setAudioListener} />

                <PerformanceMonitor
                    bounds={() => [28, 32]}
                    onFallback={() => setDpr(1)}
                    onChange={({ factor }) => {
                        const targetDpr = 1 + 1 * factor;
                        setDpr(targetDpr);
                        // console.log("factor", factor, "target DPR", targetDpr);
                    }}
                />

                <BeamSceneContext.Provider value={beamScene}>
                    <WorldController />

                    <Suspense fallback={null}>
                        <color attach="background" args={['#000000']} />
                        <CameraViewControl />
                        <Environment
                            files="/textures/potsdamer_platz_1k_nb.hdr"
                            environmentIntensity={0.5}
                        />
                        <DirectionalLight />
                        <Effects />
                    </Suspense>
                </BeamSceneContext.Provider>
            </Canvas>
        )}
    </>
}
