# False Earth native integration

False Earth is pinned as a source submodule. Its nested three-core submodule is initialized recursively by the build script.

Run from the repository root:

```bash
git submodule update --init --recursive
npm run experience:build
```

The build overlays an original procedural child character into the upstream character slot, removes astronaut-only model and texture preloads, and compiles the untouched upstream environment, terrain, vegetation, movement solver and follow camera into `dist/experience/`. It does not replace the FoundPhone Studio entry point.

The child is represented as an ordinary child; autism is communicated through narrative and sensory content rather than physical stereotypes. The upstream project uses WebGPU, so browser/device support needs runtime verification. No astronaut model is redistributed.


The public root entry opens the native 3D scene at `/experience/index.html`. The editorial guide remains available at `/?chapters=1`; the scene contains a return link. The guide no longer embeds the upstream website in an iframe.
