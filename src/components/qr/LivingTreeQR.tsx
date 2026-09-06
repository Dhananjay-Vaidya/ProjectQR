"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as Controls } from "three-stdlib";
import * as THREE from "three";
import type { RendererHandle, RendererProps } from "./types";
import { THEME_LABEL, type ThemeName } from "@/lib/living/themes";
import { generateLivingTree, type LivingTree, type Vec3 } from "@/lib/living/treeGen";
import { verifiedLivingScan, type VerifiedLivingScan } from "@/lib/living/verifiedScan";
import { isFinder, LEAF_PALETTES, LEAF_TINTS, type LeafPaletteName } from "@/lib/living/scanColors";
import { clamp01, ease, leafOvershoot, leafProgress, LIVING_REVEAL_SECONDS } from "@/lib/living/timeline";
import { livingMaterial, slabGeometry, tuftGeometry, woodGeometry } from "@/lib/living/geometry";
import { detectQuality } from "@/lib/renderQuality";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { buildGenerativeSeed, domainRng } from "@/lib/generativeSeed";
import { audioEngine } from "@/lib/audio/engine";
import { studioHalfHeight } from "@/lib/living/studioFraming";
export interface LivingTreeQRProps extends RendererProps {
    view: "experience" | "scan";
    theme: ThemeName;
    buildNonce: number;
    hero?: boolean;
    onToggleView?: () => void;
    onWebglError?: (message: string) => void;
    leafPalette?: LeafPaletteName;
    customLeafColors?: [string, string, string];
    /** Verification harness only: freeze the reversible clock at a chosen phase. */
    inspectProgress?: number;
    inspectFlat?: boolean;
}
const LivingTreeQR = forwardRef<RendererHandle, LivingTreeQRProps>(function LivingTreeQR({ model, sizePx, view, theme, buildNonce, hero = false, onToggleView, onReady, onWebglError, inspectProgress, inspectFlat = true, studioPreview = false, leafPalette = "theme", customLeafColors = ["#A8D86F", "#4EA86E", "#D39B54"] }, ref) {
    const quality = useMemo(() => detectQuality(), []), active = useSceneActive<HTMLDivElement>();
    const reduced = usePrefersReducedMotion();
    const [settled, setSettled] = useState(view === "scan");
    const result = useMemo(() => {
        try {
            return { scan: verifiedLivingScan(model, theme, Math.max(sizePx, 360)), error: null };
        }
        catch (error) {
            return { scan: null, error: error instanceof Error ? error.message : "Scan verification failed." };
        }
    }, [model, theme, sizePx]);
    const tree = useMemo(() => generateLivingTree(model, quality.tier === "low"), [model, quality.tier]);
    useImperativeHandle(ref, () => ({
        canExport: () => !!result.scan,
        exportImage: async () => {
            if (!result.scan)
                throw new Error(result.error ?? "Scan verification failed.");
            return verifiedLivingScan(model, theme, Math.max(sizePx, 360)).image;
        },
    }), [model, theme, sizePx, result]);
    return <div ref={active.ref} data-living-tree data-leaves={tree.leaves.length} data-slots={tree.slotsPerModule} data-fallback={result.scan?.fallback} style={{ width: "100%", height: "100%", minHeight: studioPreview ? 0 : sizePx, position: "relative" }}>
    {result.scan ? <>
      <Canvas orthographic dpr={hero ? [1, Math.min(1.5, quality.dpr[1])] : quality.dpr} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [30, 25, 30], near: .1, far: 400 }} onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.toneMapping = THREE.NoToneMapping; onReady?.(); }} onError={() => onWebglError?.("3D rendering is unavailable. Standard QR mode has been enabled.")} style={{ cursor: onToggleView ? "pointer" : "default", touchAction: "pan-y" }} aria-label={`Living tree, ${tree.leaves.length} leaves, ${view} view`}>
        <hemisphereLight args={[0xffffff, 0xd9cfc0, 1.1]}/>
        <directionalLight position={[5, 10, 4]} intensity={1.4}/>
        <LivingScene key={`${model.encodedUrl}|${model.ec}|${quality.tier}`} model={model} tree={tree} scan={result.scan} theme={theme} leafPalette={leafPalette} customLeafColors={customLeafColors} view={view} buildNonce={buildNonce} active={active.active} reduced={reduced} onToggle={onToggleView} onSettled={setSettled} inspectProgress={inspectProgress} inspectFlat={inspectFlat} studioPreview={studioPreview}/>
      </Canvas>
      {onToggleView && !studioPreview ? <button type="button" className="lf-focus" onClick={onToggleView} style={{ position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)", border: "1px solid var(--lf-hairline)", borderRadius: 999, padding: "4px 12px", background: "var(--lf-panel-bg)", color: "var(--lf-muted)", fontSize: 13, whiteSpace: "nowrap" }}>
        {settled ? "Tap to see the tree" : "Tap to reveal QR"}
      </button> : null}
      {result.scan.fallback !== "none" && (!studioPreview || view === "scan") ? <span role="status" style={{ position: "absolute", bottom: 42, left: 0, right: 0, textAlign: "center", fontSize: 12 }}>
        {THEME_LABEL[theme]}: high-contrast scan.
      </span> : null}
    </> : <p role="alert">{result.error}</p>}
  </div>;
});
export default LivingTreeQR;
interface SceneProps {
    model: QRModel;
    tree: LivingTree;
    scan: VerifiedLivingScan;
    theme: ThemeName;
    leafPalette: LeafPaletteName;
    customLeafColors: [string, string, string];
    view: "experience" | "scan";
    buildNonce: number;
    active: boolean;
    reduced: boolean;
    onToggle?: () => void;
    onSettled: (value: boolean) => void;
    inspectProgress?: number;
    inspectFlat: boolean;
    studioPreview: boolean;
}
interface Falling {
    leaf: number;
    target: Vec3;
    age: number;
    slot: number;
}
function LivingScene({ model, tree, scan, theme, leafPalette, customLeafColors, view, buildNonce, active, reduced, onToggle, onSettled, inspectProgress, inspectFlat, studioPreview }: SceneProps) {
    const { camera, size, gl } = useThree(), controls = useRef<Controls>(null);
    const leaves = useRef<THREE.InstancedMesh>(null), tiles = useRef<THREE.InstancedMesh>(null), grass = useRef<THREE.InstancedMesh>(null), fallen = useRef<THREE.InstancedMesh>(null);
    const wood = useRef<THREE.Mesh>(null), slab = useRef<THREE.Mesh>(null), ground = useRef<THREE.Mesh>(null), flat = useRef<THREE.Group>(null), art = useRef<THREE.Group>(null);
    const progress = useRef(view === "scan" ? 1 : 0), build = useRef(reduced ? 1 : 0), time = useRef(0), settled = useRef(view === "scan");
    const orbitStart = useRef(new THREE.Vector3(1, studioPreview ? 1.2 : .82, 1).normalize()), orbitTarget = useRef(new THREE.Vector3(0, tree.height * .35, 0));
    const previous = useRef(view), flatUniform = useMemo(() => ({ value: 0 }), []);
    const rng = useMemo(() => domainRng(buildGenerativeSeed(model.encodedUrl), "motionSeed"), [model.encodedUrl]);
    const fallState = useRef<{
        next: number;
        fall: Falling | null;
        rest: {
            position: Vec3;
            yaw: number;
            tint: number;
        }[];
        cursor: number;
        births: Map<number, number>;
    }>({ next: 24, fall: null, rest: tree.fallen.map(f => ({ ...f })), cursor: 0, births: new Map() });
    const side = model.size + QUIET_ZONE_MODULES * 2;
    const studioPolarAngle = Math.acos(orbitStart.current.y);
    const cameraReady = useRef(false);
    const resources = useMemo(() => {
        const leaf = new THREE.PlaneGeometry(1, 1), tile = new THREE.BoxGeometry(1, 1, 1), plate = new THREE.PlaneGeometry(side, side);
        const lm = livingMaterial(flatUniform), tm = livingMaterial(flatUniform), gm = livingMaterial(flatUniform), fm = livingMaterial(flatUniform);
        const wm = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false });
        const sm = new THREE.MeshLambertMaterial({ color: "#CFC7B9", transparent: true, toneMapped: false });
        const base = livingMaterial(flatUniform);
        return { leaf, tile, plate, lm, tm, gm, fm, wm, sm, base, wood: woodGeometry(tree), slab: slabGeometry(side), tuft: tuftGeometry() };
    }, [tree, side, flatUniform]);
    const palette = useMemo(() => {
        const leafSource = leafPalette === "theme" ? LEAF_TINTS[theme] : leafPalette === "custom" ? customLeafColors : LEAF_PALETTES[leafPalette];
        return { leaf: leafSource.map(c => new THREE.Color(c)), dark: new THREE.Color(scan.colors.dark), finder: new THREE.Color(scan.colors.finder), light: new THREE.Color(scan.colors.light), pale: new THREE.Color("#CFE3A8"), low: new THREE.Color("#DED6C7"), cream: new THREE.Color("#F2ECE0"), grass: [new THREE.Color("#7FD24A"), new THREE.Color("#5FB43A")] };
    }, [theme, leafPalette, customLeafColors, scan]);
    const scratch = useMemo(() => ({ d: new THREE.Object3D(), color: new THREE.Color(), q: new THREE.Quaternion(), end: new THREE.Quaternion(), e: new THREE.Euler(), dir: new THREE.Vector3(), target: new THREE.Vector3() }), []);
    const flatRender = useMemo(() => {
        // Static reference assembled directly from QRModel using the palette that
        // passed jsQR. Keeping the same geometric rasterization preserves MSAA edge
        // pixels; a nearest-filtered PNG texture would change thousands of edges.
        const base = new THREE.InstancedMesh(resources.tile, resources.tm, model.size ** 2);
        const data = new THREE.InstancedMesh(resources.leaf, resources.lm, tree.dataModuleCount);
        const d = new THREE.Object3D();
        for (let r = 0; r < model.size; r++)
            for (let c = 0; c < model.size; c++) {
                const dark = model.dark[r][c], isData = dark && !model.protected[r][c], h = isData ? .005 : .02;
                d.position.set(c + .5 - model.size / 2, h / 2, r + .5 - model.size / 2);
                d.rotation.set(0, 0, 0);
                d.scale.set(1, h, 1);
                d.updateMatrix();
                base.setMatrixAt(r * model.size + c, d.matrix);
                base.setColorAt(r * model.size + c, dark && !isData ? (isFinder(model.size, r, c) ? palette.finder : palette.dark) : palette.light);
            }
        let index = 0;
        for (const l of tree.leaves)
            if (l.tile) {
                d.position.set(l.col + .5 - model.size / 2, .02, l.row + .5 - model.size / 2);
                d.rotation.set(-Math.PI / 2, 0, l.yaw);
                d.scale.setScalar(1);
                d.updateMatrix();
                data.setMatrixAt(index, d.matrix);
                data.setColorAt(index++, palette.dark);
            }
        base.frustumCulled = false;
        data.frustumCulled = false;
        return { base, data };
    }, [resources, model, tree, palette]);
    useEffect(() => () => { Object.values(resources).forEach(r => r.dispose()); }, [resources]);
    useEffect(() => () => { flatRender.base.dispose(); flatRender.data.dispose(); }, [flatRender]);
    useEffect(() => { build.current = reduced ? 1 : 0; }, [buildNonce, reduced]);
    useEffect(() => {
        // Allocate instanceColor before the first shader compilation (no zero-color frame).
        for (const [mesh, count] of [[leaves.current, tree.leaves.length], [tiles.current, model.size ** 2], [grass.current, tree.grass.length], [fallen.current, 60]] as const) {
            if (!mesh)
                continue;
            mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
    }, [tree, model.size]);
    useFrame((_, delta) => {
        if (!active && inspectProgress === undefined)
            return;
        const { d, color, q, end, e, dir, target } = scratch;
        const wanted = view === "scan" ? 1 : 0;
        if (previous.current !== view) {
            if (progress.current === 0) {
                orbitStart.current.copy(camera.position).sub(orbitTarget.current).normalize();
            }
            previous.current = view;
        }
        const p = inspectProgress === undefined ? (reduced ? wanted : THREE.MathUtils.clamp(progress.current + Math.sign(wanted - progress.current) * delta / LIVING_REVEAL_SECONDS, Math.min(progress.current, wanted), Math.max(progress.current, wanted))) : clamp01(inspectProgress);
        const was = progress.current;
        progress.current = p;
        const seconds = p * LIVING_REVEAL_SECONDS, finish = ease((seconds - .6) / .15), camMix = ease(seconds / .6);
        if (onToggle)
            audioEngine.setReveal(p);
        if (settled.current !== (p === 1)) {
            settled.current = p === 1;
            onSettled(p === 1);
        }
        gl.domElement.dataset.reveal = p.toFixed(4);
        flatUniform.value = finish;
        const preview = inspectProgress !== undefined;
        build.current = preview ? 1 : Math.min(1, build.current + delta / 1.5);
        const growth = ease(build.current);
        if (p === 0 && !reduced) {
            time.current += delta;
        }
        // Hand over to the static verified flat renderer at identical bounds.
        const atEnd = p === 1 && (inspectProgress === undefined || inspectFlat);
        if (flat.current)
            flat.current.visible = atEnd;
        if (art.current)
            art.current.visible = !atEnd;
        const cam = camera as THREE.OrthographicCamera;
        const aspect = size.width / Math.max(1, size.height), fraction = size.width < 760 ? .8 : .72;
        const isoH = Math.max(tree.height + side * .55, side * 1.15) / fraction;
        const isoW = side * 1.42 / fraction;
        const isoHalf = Math.max(isoH / 2, isoW / 2 / aspect), scanHalf = side / 2 / .82 * Math.max(1, 1 / aspect);
        let fittedHalf = isoHalf;
        if (studioPreview) {
            fittedHalf = studioHalfHeight(tree, side, aspect);
            if (!cameraReady.current) {
                orbitTarget.current.set(0, tree.height * .32, 0);
            }
            else if (p === 0 && was === 0 && !preview && controls.current) {
                orbitTarget.current.copy(controls.current.target);
                orbitStart.current.copy(camera.position).sub(orbitTarget.current).normalize();
            }
        }
        cam.top = THREE.MathUtils.lerp(fittedHalf, scanHalf, camMix);
        cam.bottom = -cam.top;
        cam.right = cam.top * aspect;
        cam.left = -cam.right;
        cam.zoom = 1;
        cam.updateProjectionMatrix();
        const driveCamera = p > 0 || was > 0 || !controls.current || time.current < delta * 2 || preview || !cameraReady.current;
        if (driveCamera) {
            target.copy(orbitTarget.current).multiplyScalar(1 - camMix);
            dir.copy(orbitStart.current).lerp(scratch.target.set(0, 1, 0), camMix).normalize();
            // target is recomputed because scratch.target is shared with the up vector.
            target.copy(orbitTarget.current).multiplyScalar(1 - camMix);
            cam.position.copy(dir).multiplyScalar(80).add(target);
            cam.up.set(0, Math.cos(camMix * Math.PI / 2), -Math.sin(camMix * Math.PI / 2));
            cam.lookAt(target);
            controls.current?.target.copy(target);
            controls.current?.update();
            cameraReady.current = true;
        }
        if (controls.current) {
            controls.current.enabled = p === 0 && view === "experience" && !preview;
        }
        if (wood.current) {
            wood.current.scale.y = growth * (1 - clamp01(seconds / .3) ** 2);
            wood.current.visible = seconds < .3;
        }
        if (slab.current) {
            resources.sm.opacity = 1 - finish;
            slab.current.visible = finish < 1;
        }
        resources.base.color.copy(palette.cream).lerp(palette.light, finish);
        if (atEnd)
            return;
        const fall = fallState.current;
        if (p === 0 && !reduced && !preview && growth === 1 && tree.fallTargets.length) {
            if (!fall.fall && time.current >= fall.next) {
                const leaf = Math.floor(rng() * tree.leaves.length), target = tree.fallTargets[Math.floor(rng() * tree.fallTargets.length)];
                const slot = fall.rest.length < 60 ? fall.rest.length : fall.cursor++ % 60;
                fall.fall = { leaf, target: [target[0], .1, target[2]], age: 0, slot };
                fall.next = time.current + 20 + rng() * 10;
            }
            if (fall.fall) {
                fall.fall.age += delta;
                if (fall.fall.age >= 3) {
                    const f = fall.fall;
                    fall.rest[f.slot] = { position: f.target, yaw: tree.leaves[f.leaf].yaw, tint: tree.leaves[f.leaf].tint };
                    fall.births.set(f.leaf, time.current);
                    fall.fall = null;
                }
            }
        }
        if (leaves.current) {
            for (let i = 0; i < tree.leaves.length; i++) {
                const l = tree.leaves[i], local = leafProgress(seconds, l.distance), a = ease(local), cluster = tree.clusters[l.cluster];
                const sway = reduced ? 0 : Math.sin(time.current * Math.PI * 2 * .3 + cluster.phase) * Math.PI / 180 * (1 - a);
                let x = l.position[0], y = l.position[1], z = l.position[2];
                const dx = x - cluster.center[0], dy = y - cluster.center[1];
                x = cluster.center[0] + dx * Math.cos(sway) - dy * Math.sin(sway);
                y = cluster.center[1] + dx * Math.sin(sway) + dy * Math.cos(sway);
                const birth = fall.births.get(i);
                let leafScale = birth === undefined ? 1 : THREE.MathUtils.lerp(clamp01((time.current - birth) / .6), 1, ease(seconds / .1));
                if (birth !== undefined && time.current - birth >= .6)
                    fall.births.delete(i);
                if (fall.fall?.leaf === i) {
                    const f = fall.fall, t = clamp01(f.age / 3) * (1 - ease(seconds / .1));
                    x = THREE.MathUtils.lerp(x, f.target[0], t);
                    y = THREE.MathUtils.lerp(y, f.target[1], t);
                    z = THREE.MathUtils.lerp(z, f.target[2], t);
                    leafScale = 1;
                }
                d.position.set(THREE.MathUtils.lerp(x, l.col + .5 - model.size / 2, a), THREE.MathUtils.lerp(y * growth, .02, a) + leafOvershoot(local), THREE.MathUtils.lerp(z, l.row + .5 - model.size / 2, a));
                q.setFromEuler(e.set(l.rotation[0] + sway, l.rotation[1], l.rotation[2]));
                if (fall.fall?.leaf === i) {
                    q.multiply(end.setFromEuler(e.set(fall.fall.age * 2, fall.fall.age, 0)));
                    end.setFromEuler(e.set(-Math.PI / 2, 0, l.yaw));
                    q.slerp(end, clamp01(fall.fall.age / 3) ** 4);
                }
                end.setFromEuler(e.set(-Math.PI / 2, 0, l.yaw));
                d.quaternion.copy(q).slerp(end, a);
                d.scale.setScalar(THREE.MathUtils.lerp(.42 * growth * leafScale, l.tile ? 1 : 0, a));
                d.updateMatrix();
                leaves.current.setMatrixAt(i, d.matrix);
                color.copy(palette.leaf[l.tint]).lerp(palette.dark, a);
                leaves.current.setColorAt(i, color);
            }
            leaves.current.instanceMatrix.needsUpdate = true;
            if (leaves.current.instanceColor)
                leaves.current.instanceColor.needsUpdate = true;
        }
        if (tiles.current) {
            const tileMix = ease(seconds / .7), finderMix = ease(seconds / .35);
            for (let r = 0; r < model.size; r++)
                for (let c = 0; c < model.size; c++) {
                    const dark = model.dark[r][c], finder = dark && isFinder(model.size, r, c), data = dark && !model.protected[r][c];
                    const h = THREE.MathUtils.lerp(dark ? .14 : .08, data ? .005 : .02, tileMix), width = THREE.MathUtils.lerp(.96, 1, tileMix);
                    d.position.set(c + .5 - model.size / 2, h / 2, r + .5 - model.size / 2);
                    d.rotation.set(0, 0, 0);
                    d.scale.set(width, h, width);
                    d.updateMatrix();
                    tiles.current.setMatrixAt(r * model.size + c, d.matrix);
                    color.copy(finder ? palette.pale : dark ? palette.low : palette.cream);
                    if (finder)
                        color.lerp(palette.finder, finderMix);
                    else if (data)
                        color.lerp(palette.light, tileMix);
                    else if (dark)
                        color.lerp(palette.dark, tileMix);
                    else
                        color.lerp(palette.light, finish);
                    tiles.current.setColorAt(r * model.size + c, color);
                }
            tiles.current.instanceMatrix.needsUpdate = true;
            if (tiles.current.instanceColor)
                tiles.current.instanceColor.needsUpdate = true;
        }
        if (grass.current) {
            const scale = growth * (1 - ease(seconds / .35));
            tree.grass.forEach((g, i) => { d.position.set(...g.position); d.rotation.set((1 - scale) * Math.PI / 2, g.yaw, 0); d.scale.set(1, scale, 1); d.updateMatrix(); grass.current!.setMatrixAt(i, d.matrix); grass.current!.setColorAt(i, palette.grass[g.tint]); });
            grass.current.visible = scale > 0;
            grass.current.instanceMatrix.needsUpdate = true;
            if (grass.current.instanceColor)
                grass.current.instanceColor.needsUpdate = true;
        }
        if (fallen.current) {
            fallen.current.count = fall.rest.length;
            fall.rest.forEach((f, i) => { d.position.set(...f.position); d.rotation.set(-Math.PI / 2, 0, f.yaw); d.scale.setScalar(.42 * growth * (1 - ease(seconds / .2))); d.updateMatrix(); fallen.current!.setMatrixAt(i, d.matrix); fallen.current!.setColorAt(i, palette.leaf[f.tint]); });
            fallen.current.instanceMatrix.needsUpdate = true;
            if (fallen.current.instanceColor)
                fallen.current.instanceColor.needsUpdate = true;
        }
    });
    return <>
    <OrbitControls ref={controls} makeDefault enableZoom={false} enablePan={studioPreview} screenSpacePanning enableDamping dampingFactor={.08} enableRotate={typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches} minPolarAngle={studioPreview ? studioPolarAngle : Math.PI * 25 / 180} maxPolarAngle={studioPreview ? studioPolarAngle : Math.PI * 55 / 180}/>
    <group onClick={event => { if (event.delta < 5 && onToggle) {
        event.stopPropagation();
        onToggle();
    } }}>
      <group ref={art}>
        <mesh ref={slab} geometry={resources.slab} material={resources.sm}/>
        <mesh ref={ground} geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, .001, 0]}/>
        <instancedMesh ref={tiles} args={[resources.tile, resources.tm, model.size ** 2]} frustumCulled={false}/>
        <mesh ref={wood} geometry={resources.wood} material={resources.wm}/>
        <instancedMesh ref={leaves} args={[resources.leaf, resources.lm, tree.leaves.length]} frustumCulled={false}/>
        <instancedMesh ref={grass} args={[resources.tuft, resources.gm, tree.grass.length]} frustumCulled={false}/>
        <instancedMesh ref={fallen} args={[resources.leaf, resources.fm, 60]} frustumCulled={false}/>
      </group>
      <group ref={flat} visible={false}>
        <mesh geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, .001, 0]}/>
        <primitive object={flatRender.base}/>
        <primitive object={flatRender.data}/>
      </group>
    </group>
  </>;
}
