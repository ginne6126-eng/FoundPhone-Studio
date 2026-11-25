# @momentchan/three-core

A minimalist utility library for **Three.js (WebGPU)** and **React Three Fiber**.

## 📦 Installation

This package is managed as a Git Submodule. To add it to your project:

```bash
git submodule add [https://github.com/momentchan/three-core.git](https://github.com/momentchan/three-core.git) packages/three-core
```

## Core Modules

### 1. Rendering & Performance
* **`WebGPUCanvas`**: Pre-configured canvas tailored for WebGPU.
* **`AsyncCompile`**: Prevents frame stutters by compiling shaders asynchronously.
* **`WebGpuPerf`**: Performance monitor overlay for FPS and GPU memory.

### 2. Input System
* **`InputSystem`**: Logic engine that tracks game actions (e.g., "Jump", "Move").
* **`KeyboardMapper`**: Component that maps physical keys to the `InputSystem`.

### 3. Media & Visuals
* **`AudioManager` & `Bgm`**: Centralized system for sound effects and background music.
* **`LevaWrapper`**: A UI panel for real-time debugging and variable tweaking.
* **`DistortedCircle`**: Shader-based procedural visual component.
* **`Sparkles`**: Twinkling star particles shed off moving objects, inheriting their motion, then falling. Every look and motion knob is a `settings` prop (see `SPARKLE_DEFAULTS`); `createStarTexture` / `createGlowTexture` or your own textures set the shape.
* **`playSound` / `preloadSound` / `useClickSound`**: Low-latency, non-spatial UI sounds via Web Audio, with the iPad first-tap unlock and silent-mode handling built in.

### 4. Custom Hooks
* **`useDeviceDetection`**: Detects Mobile vs. Desktop to toggle UI like Joysticks.
* **`useKTX2Texture`**: Optimized loader for GPU-friendly compressed textures.
* **`useUploadQueue`**: Manages resource uploads to the GPU to maintain smooth FPS.

### 5. TSL Utilities
* **`math` & `color`**: Helper functions for **Three Shading Language (TSL)** to write GPU logic in JavaScript.

### 6. Utilities
* **`stableRandom01` / `stableRandomRange`**: Deterministic, hash-based (sin-fract) PRNG for stable procedural layouts that survive re-renders and reloads.
* **`base64ToBlob` / `fileToBase64` / `blobToBase64`**: Generic image/blob conversion helpers for working with image data URLs and binary blobs.
* **`getHandOpenState` / `getHandSign`**: MediaPipe 21-point gesture classification (open hand / fist) with Leap Motion native grab-strength + hysteresis fallback. Exported from `@core/interaction`.

### 7. Soft Body
* **`SoftBody`**: Turns any `Object3D` (e.g. a cloned GLTF scene) into a jelly / plush soft body — drag to pull a patch of the surface (multi-pointer), click to poke, let go and it wobbles back. `pinned` holds the core in place so only the touched part stretches; unpinned, it can be lifted, dropped and bounces. Knobs: `firmness`, `damping`, `gravity`, `grabRadius`, `pokeStrength`, `friction`, `upright`, `resolution` (see `SOFT_BODY_DEFAULTS`). The object should stand on its lowest point; that height is the floor.
* **`SoftBodySimulation`**: The framework-free solver behind it (voxelised hexahedral lattice, PBD shape matching + volume constraint, trilinear skinning with deformation-gradient normals). Writes CPU vertex buffers, so any material works unchanged. Use directly for custom input (`grab` / `moveGrab` / `release` / `poke`, all in root space), or to hand it motion from outside: `addVelocity` (e.g. an impact) and `addAngularVelocity` (a twist about `getCenter()`).

```jsx
const { scene } = useGLTF(url);
const model = useMemo(() => scene.clone(true), [scene]);
<SoftBody object={model} pinned firmness={0.5} />
```
