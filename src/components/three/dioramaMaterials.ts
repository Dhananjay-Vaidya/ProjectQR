/**
 * Shared diorama material factories. Every scene uses these so the whole site
 * reads as one designed miniature, not a WebGL demo.
 *
 * - MeshStandardMaterial, roughness 0.9, metalness 0, flatShading, instanceColor.
 * - Emissive only on "shard" decorations, intensity ≤ 0.4.
 * - No fog, no bloom, no post, no env maps.
 *
 * The <DioramaLights> component lives in dioramaMaterials.tsx.
 */

import * as THREE from "three";

export function makeVoxelMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
}

export function makeSolidMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
}

export function makeShardMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.4,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
}
