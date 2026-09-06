/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {PNG}=require('pngjs');
const jsQR=require('jsqr');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1365,height:1000}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  const base=process.env.LIVING_TEST_URL||'http://localhost:3107';
  const out=path.resolve(__dirname,'../evidence/living');fs.mkdirSync(out,{recursive:true});
  await page.goto(base+'/verify');
  await page.getByRole('button',{name:'Run verification',exact:true}).click();
  await page.getByText(/^Living Neon Bloom \(/).waitFor();
  assert.equal(await page.getByText('ok: false',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Inspect Living morph',exact:true}).click();
  const canvas=page.locator('[data-living-tree] canvas');await canvas.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
  const setProgress=async value=>{
    await page.getByLabel('Living reveal progress').fill(String(value));
    await page.waitForFunction(v=>Number(document.querySelector('[data-living-tree] canvas')?.dataset.reveal)===v,value);
  };
  for(const p of [0,.267,.467,.8,.999,1]){await setProgress(p);await canvas.screenshot({path:path.join(out,`morph-${p}.png`)});}
  await page.getByLabel('Verified flat handoff').uncheck();
  const assembled=PNG.sync.read(await canvas.screenshot({path:path.join(out,'handoff-before.png')}));
  await page.getByLabel('Verified flat handoff').check();
  const verified=PNG.sync.read(await canvas.screenshot({path:path.join(out,'handoff-after.png')}));
  let different=0;for(let i=0;i<assembled.data.length;i+=4)if(assembled.data.slice(i,i+4).compare(verified.data.slice(i,i+4)))different++;
  console.log('Handoff different pixels:',different);
  assert.equal(different,0,'The flat-render handoff must be pixel-identical.');
  for(const frame of [assembled,verified])assert.equal(jsQR(new Uint8ClampedArray(frame.data),frame.width,frame.height)?.data,'https://linkforge.app/demo');
  console.log('Inspector counts:',await page.locator('[data-living-tree]').evaluate(el=>({leaves:el.dataset.leaves,k:el.dataset.slots})));
  for(const theme of ['neon','verdant','ember']){
    await page.getByLabel('Living inspection theme').selectOption(theme);
    await page.waitForTimeout(200);
    await canvas.screenshot({path:path.join(out,`scan-${theme}.png`)});
  }
  await page.goto(base+'/create');
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
  await page.waitForTimeout(1700);
  await page.locator('[data-living-tree] canvas').screenshot({path:path.join(out,'editor-tree.png')});
  await page.getByRole('button',{name:'Scan',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='1.0000');
  await page.getByRole('button',{name:'Tap to see the tree',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
  await page.locator('[data-living-tree] canvas').click();
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='1.0000');
  await page.locator('[data-living-tree] canvas').click();
  await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
  for(const theme of ['Neon Bloom','Verdant','Ember']){
    await page.getByRole('button',{name:theme,exact:true}).click();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();
    await(await download).saveAs(path.join(out,`export-${theme.replace(' ','-')}.png`));
    const png=PNG.sync.read(fs.readFileSync(path.join(out,`export-${theme.replace(' ','-')}.png`)));
    assert.equal(jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data,'https://linkforge.app/demo');
  }
  console.log('Console errors:',errors);assert.equal(errors.length,0);
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await mobile.goto(base+'/create');await mobile.locator('[data-living-tree] canvas').waitFor();
  await mobile.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
  console.log('Mobile counts:',await mobile.locator('[data-living-tree]').evaluate(el=>({leaves:el.dataset.leaves,k:el.dataset.slots})));
  await mobile.getByRole('button',{name:'Scan',exact:true}).click();
  await mobile.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='1.0000');
  await mobile.locator('[data-living-tree] canvas').screenshot({path:path.join(out,'mobile-scan.png')});
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
