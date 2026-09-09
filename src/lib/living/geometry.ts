import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { trunkPointAt, type LivingTree, type Vec3 } from "./treeGen";

const BARK = new THREE.Color("#6E4B34");

/**
 * A smooth low-poly tapered tube along a path. Built from a unit-radius
 * TubeGeometry whose every ring is then scaled toward its centre by the
 * lerped radius, so the taper stays continuous with no seams.
 */
function taperedTube(
  points: THREE.Vector3[],
  baseRadius: number,
  tipRadius: number,
  radialSegments: number,
  tubularSegments: number,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.1);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, centre);
    const r = THREE.MathUtils.lerp(baseRadius, tipRadius, t);
    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      v.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).sub(centre).multiplyScalar(r).add(centre);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function paintBark(geo: THREE.BufferGeometry, topY: number, joinDark = 0): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const yNorm = THREE.MathUtils.clamp(pos.getY(i) / Math.max(0.001, topY), 0, 1);
    // Darker low on the trunk, and a touch darker overall where branches join.
    const shade = 0.58 + 0.42 * yNorm - joinDark;
    c.copy(BARK).multiplyScalar(Math.max(0.32, shade));
    c.toArray(colours, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geo;
}

/** Merged trunk + branch geometry with baked bark vertex colours. */
export function woodGeometry(tree: LivingTree): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];

  const spline = Array.from({ length: 9 }, (_, i) =>
    new THREE.Vector3(...trunkPointAt(tree, i / 8)),
  );
  pieces.push(
    paintBark(
      taperedTube(spline, tree.trunkBaseRadius, tree.trunkTipRadius, tree.radialSegments, 20),
      tree.height,
    ),
  );

  // Low, tapered buttress roots make the trunk feel planted without covering
  // the QR's finder/timing area. They share the merged bark geometry/draw call.
  const rootCount = 6;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + 0.18;
    const from = new THREE.Vector3(Math.cos(a) * 0.38, 0.52, Math.sin(a) * 0.38);
    const mid = new THREE.Vector3(Math.cos(a) * 0.9, 0.18, Math.sin(a) * 0.9);
    const to = new THREE.Vector3(Math.cos(a) * (1.35 + (i % 2) * 0.3), 0.04, Math.sin(a) * (1.35 + (i % 2) * 0.3));
    pieces.push(paintBark(taperedTube([from, mid, to], 0.28, 0.025, 5, 5), tree.height, 0.04));
  }

  for (const branch of tree.branches) {
    const from = new THREE.Vector3(...branch.from);
    const to = new THREE.Vector3(...branch.to);
    const mid = from.clone().lerp(to, 0.5);
    pieces.push(
      paintBark(
        taperedTube([from, mid, to], branch.baseRadius, branch.tipRadius, Math.max(4, tree.radialSegments - 2), 6),
        tree.height,
        branch.primary ? 0.14 : 0.08,
      ),
    );
  }

  const merged = mergeGeometries(pieces, false)!;
  pieces.forEach((g) => g.dispose());
  return merged;
}

/** A blade tuft: three crossed thin planes, 0.5 tall, slightly tilted. */
export function tuftGeometry(): THREE.BufferGeometry {
  const parts = [0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => {
    const g = new THREE.PlaneGeometry(0.11, 0.5, 1, 2);
    g.translate(0, 0.25, 0);
    g.rotateZ(0.12);
    g.rotateY(angle);
    return g;
  });
  const result = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return result;
}

/** Bevelled platform slab, 0.7 thick, top face just below y = 0. */
export function slabGeometry(side: number): THREE.BufferGeometry {
  const h = side / 2 - 0.1;
  const shape = new THREE.Shape();
  shape.moveTo(-h, -h);
  shape.lineTo(h, -h);
  shape.lineTo(h, h);
  shape.lineTo(-h, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.7,
    bevelEnabled: true,
    bevelSize: 0.09,
    bevelThickness: 0.09,
    bevelSegments: 1,
    steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.72, 0);
  return g;
}

/** A single thin vertical rain segment, 0.02 × 0.9 module. */
export function rainGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(0.02, 0.9);
}

/**
 * Matte Lambert in Experience; exact unlit sRGB module colours at Scan. The
 * `flat` uniform (0→1) blends the lit result toward the raw diffuse colour so
 * the hand-off to the verified flat render is seamless.
 */
export function livingMaterial(flat: { value: number }, vertexColors = false): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    vertexColors,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.livingFlat = flat;
    shader.fragmentShader =
      "uniform float livingFlat;\n" +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        "outgoingLight = mix(outgoingLight, diffuseColor.rgb, livingFlat);\n#include <opaque_fragment>",
      );
  };
  material.customProgramCacheKey = () => "living-flat-v1";
  return material;
}

export type { Vec3 };
