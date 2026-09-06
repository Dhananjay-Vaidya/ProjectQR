import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { LivingTree } from "./treeGen";
export function woodGeometry(tree: LivingTree) {
    const pieces = [tree.trunk, ...tree.branches].map((branch, index) => {
        const start = new THREE.Vector3(...branch.from), end = new THREE.Vector3(...branch.to);
        const direction = end.clone().sub(start);
        const g = new THREE.CylinderGeometry(branch.tipRadius, branch.baseRadius, direction.length(), tree.radialSegments, 1);
        const values = new Float32Array(g.attributes.position.count * 3), base = new THREE.Color("#6F4A32");
        for (let i = 0; i < g.attributes.position.count; i++) {
            const h = g.attributes.position.getY(i) / direction.length() + .5;
            const c = base.clone().multiplyScalar(index === 0 ? .65 + .35 * h : 1);
            c.toArray(values, i * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(values, 3));
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
        g.translate(...start.add(end).multiplyScalar(.5).toArray());
        return g;
    });
    const result = mergeGeometries(pieces)!;
    pieces.forEach(g => g.dispose());
    return result;
}
export function tuftGeometry() {
    const parts = [0, Math.PI / 3, 2 * Math.PI / 3].map(angle => {
        const g = new THREE.PlaneGeometry(.09, .5);
        g.translate(0, .25, 0);
        g.rotateZ(.1);
        g.rotateY(angle);
        return g;
    });
    const result = mergeGeometries(parts)!;
    parts.forEach(g => g.dispose());
    return result;
}
export function slabGeometry(side: number) {
    const h = side / 2 - .1, shape = new THREE.Shape();
    shape.moveTo(-h, -h);
    shape.lineTo(h, -h);
    shape.lineTo(h, h);
    shape.lineTo(-h, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: .5, bevelEnabled: true, bevelSize: .1, bevelThickness: .1, bevelSegments: 1, steps: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -.6, 0);
    return g;
}
/** Matte Lambert in Experience; exact unlit sRGB module colors at Scan. */
export function livingMaterial(flat: {
    value: number;
}, vertexColors = false) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors, toneMapped: false });
    material.onBeforeCompile = shader => {
        shader.uniforms.livingFlat = flat;
        shader.fragmentShader = "uniform float livingFlat;\n" + shader.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, diffuseColor.rgb, livingFlat);\n#include <opaque_fragment>");
    };
    material.customProgramCacheKey = () => "living-flat-v1";
    return material;
}
