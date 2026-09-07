import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 0.3-scale plaza tree: 0.15 trunk + 0.5 canopy cube, baked vertex colours. */
export function plazaTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6);
  trunk.translate(0, 0.14, 0);
  const canopy = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  canopy.translate(0, 0.42, 0);
  const merged = mergeGeometries([paint(trunk, "#6E4B34"), paint(canopy, "#4b7a43")])!;
  trunk.dispose();
  canopy.dispose();
  return merged;
}

/** Perimeter lamp: 0.06×1.2 post + 0.14 head, baked vertex colours. */
export function lampGeometry(headColor: THREE.ColorRepresentation): THREE.BufferGeometry {
  const post = new THREE.BoxGeometry(0.06, 1.2, 0.06);
  post.translate(0, 0.6, 0);
  const head = new THREE.BoxGeometry(0.16, 0.12, 0.16);
  head.translate(0, 1.24, 0);
  const merged = mergeGeometries([paint(post, "#3a3a44"), paint(head, headColor)])!;
  post.dispose();
  head.dispose();
  return merged;
}

/** Small plane: 0.5 fuselage + 0.4 wing span, light grey. */
export function planeGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.5, 0.08, 0.08);
  const wing = new THREE.BoxGeometry(0.12, 0.02, 0.4);
  const tail = new THREE.BoxGeometry(0.08, 0.12, 0.02);
  tail.translate(-0.2, 0.06, 0);
  const merged = mergeGeometries([body, wing, tail])!;
  body.dispose();
  wing.dispose();
  tail.dispose();
  return merged;
}

/** One wing triangle (0.18), pivoting at the local origin (the bird's spine). */
export function birdWingGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.18, 0, -0.06, 0.18, 0, 0.06]), 3),
  );
  g.computeVertexNormals();
  return g;
}
