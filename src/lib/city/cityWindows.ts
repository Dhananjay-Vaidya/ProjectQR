import * as THREE from "three";

export interface WindowUniforms {
  uTime: { value: number };
  uLitFraction: { value: number };
  uEmissive: { value: number };
  uFlicker: { value: number };
  uGlass: { value: THREE.Color };
  uLitA: { value: THREE.Color };
  uLitB: { value: THREE.Color };
  uExport: { value: number };
}

export function makeWindowUniforms(): WindowUniforms {
  return {
    uTime: { value: 0 },
    uLitFraction: { value: 0 },
    uEmissive: { value: 0 },
    uFlicker: { value: 0 },
    uGlass: { value: new THREE.Color("#56605c") },
    uLitA: { value: new THREE.Color("#bff3ff") },
    uLitB: { value: new THREE.Color("#ffd1f0") },
    uExport: { value: 0 },
  };
}

/**
 * Patches a MeshStandardMaterial so a window grid is derived procedurally in
 * the fragment shader from WORLD-SPACE position on the four side faces only.
 * No geometry is added — the whole building InstancedMesh stays one draw call.
 *
 * Grid: floor height 0.35 units, window pitch 0.28, mullions 20% of the pitch.
 * A per-instance `aSeed` attribute + hash(seed, column, floor) vs the theme's
 * lit fraction decide which windows glow. `aSeed < 0` (protected finder blocks)
 * disables windows entirely. Rooftops and ground faces are untouched.
 */
export function applyWindowShader(material: THREE.MeshStandardMaterial, u: WindowUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aSeed;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSeed = aSeed;
vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
vWNormal = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform float uLitFraction;
uniform float uEmissive;
uniform float uFlicker;
uniform float uExport;
uniform vec3 uGlass;
uniform vec3 uLitA;
uniform vec3 uLitB;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vWNormal;
float cityHash(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        `if (uExport < 0.5 && vSeed >= 0.0 && abs(vWNormal.y) < 0.5) {
  float axisX = step(0.5, abs(vWNormal.x));
  float uu = mix(vWPos.x, vWPos.z, axisX);
  float pitch = 0.28;
  float fh = 0.35;
  float m = 0.2;
  float colId = floor(uu / pitch);
  float flrId = floor(vWPos.y / fh);
  float fu = fract(uu / pitch);
  float fy = fract(vWPos.y / fh);
  float inWin = step(m, fu) * step(fu, 1.0 - m) * step(m, fy) * step(fy, 1.0 - m) * step(fh * 0.6, vWPos.y);
  if (inWin > 0.5) {
    float lc = cityHash(vec3(vSeed * 0.7 + 1.0, colId, flrId));
    if (lc < uLitFraction) {
      float tone = cityHash(vec3(vSeed + 5.0, colId, 3.0));
      vec3 lit = tone < 0.5 ? uLitA : uLitB;
      float f = 1.0;
      if (cityHash(vec3(vSeed + 9.0, colId, flrId + 7.0)) < uFlicker) {
        f = 0.55 + 0.45 * sin(uTime * 1.7 + lc * 6.2831);
      }
      totalEmissiveRadiance += lit * uEmissive * f;
      diffuseColor.rgb = mix(diffuseColor.rgb, lit, 0.22 * f);
    } else {
      diffuseColor.rgb = uGlass;
    }
  }
}
#include <lights_fragment_begin>`,
      );
  };
  material.customProgramCacheKey = () => "city-windows-v1";
  return material;
}
