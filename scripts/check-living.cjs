/* Run with node scripts/check-living.cjs; uses only installed repo dependencies. */
/* eslint-disable @typescript-eslint/no-require-imports */
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...rest);
};
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
// Exercise the actual rasterizer in Node. Canvas does integer-aligned solid fills
// here; PNG round-trips and the WebGL framebuffer are tested in Chromium.
global.document = { createElement: () => {
  const canvas = { width: 0, height: 0, toDataURL: () => 'node-pixel-check' };
  let pixels;
  const ctx = { fillStyle: '#000000', fillRect(x,y,w,h) {
    pixels ??= new Uint8ClampedArray(canvas.width*canvas.height*4);
    const c=[1,3,5].map(i=>parseInt(this.fillStyle.slice(i,i+2),16));
    for(let row=y;row<y+h;row++) for(let col=x;col<x+w;col++) pixels.set([...c,255],(row*canvas.width+col)*4);
  }, getImageData:()=>({data:pixels}) };
  canvas.getContext=()=>ctx; return canvas;
} };
const {buildQRModel}=require('../src/lib/qr.ts');
const {generateLivingTree}=require('../src/lib/living/treeGen.ts');
const {runLivingTreeSelfChecks}=require('../src/lib/living/checks.ts');
const {verifiedLivingScan}=require('../src/lib/living/verifiedScan.ts');
const {themedScanColors,luminance}=require('../src/lib/living/scanColors.ts');
for(const check of runLivingTreeSelfChecks()){ assert(check.ok,check.name+': '+check.detail); console.log(check.name+': '+check.detail); }
const reports=[];
for(const url of ['https://example.com','https://linkforge.app/demo','https://example.com/linkforge-test','https://example.com/'+ 'long-path-'.repeat(28)]) {
  for(const ec of ['M','Q','H']) {
    const model=buildQRModel(url,ec).model;
    for(const theme of ['neon','verdant','ember']) {
      assert(luminance(themedScanColors(theme).dark)<=.30);
      for(const size of [240,480,720]) {
        const scan=verifiedLivingScan(model,theme,size);
        assert(scan.verification.ok);
        reports.push({version:model.version,ec,theme,size,fallback:scan.fallback});
      }
    }
  }
}
const model=buildQRModel('https://linkforge.app/demo','H').model;
const tree=generateLivingTree(model);
console.log('Default tree bounds:',JSON.stringify({width:Math.max(...tree.leaves.map(l=>l.position[0]))-Math.min(...tree.leaves.map(l=>l.position[0]))+.42,height:tree.height,platform:model.size+8}));
// Independent nearest-free oracle verifies every greedy assignment, not just counts.
const available=[];
for(let r=0;r<model.size;r++)for(let c=0;c<model.size;c++) if(model.dark[r][c]&&!model.protected[r][c])available.push({r,c,n:tree.slotsPerModule});
for(const leaf of tree.leaves.slice().sort((a,b)=>b.distance-a.distance)) {
  let best,dist=Infinity;
  for(const m of available)if(m.n){const d=(leaf.position[0]-(m.c+.5-model.size/2))**2+(leaf.position[2]-(m.r+.5-model.size/2))**2;if(d<dist){dist=d;best=m;}}
  assert.equal(leaf.row,best.r);assert.equal(leaf.col,best.c);best.n--;
}
console.log('Nearest-free oracle: all assignments pass.');
console.log(JSON.stringify({decodeChecks:reports.length,themes:['neon','verdant','ember'].map(theme=>({theme,themed:reports.filter(r=>r.theme===theme&&r.fallback==='none').length,dataInk:reports.filter(r=>r.theme===theme&&r.fallback==='data-ink').length,allInk:reports.filter(r=>r.theme===theme&&r.fallback==='all-ink').length})),versions:[...new Set(reports.map(r=>r.version))]},null,2));
