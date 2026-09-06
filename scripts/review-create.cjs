/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1680,height:1000},reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.CREATE_TEST_URL||'http://localhost:3000')+'/create');
    await page.locator('[data-living-tree] canvas').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-living-tree] canvas')?.dataset.reveal==='0.0000');
    const dir=path.resolve(__dirname,'../evidence/create'); fs.mkdirSync(dir,{recursive:true});
    const label=process.env.CREATE_REVIEW_LABEL||'after';
    for(const [name,width,height] of [['desktop',1680,1000],['laptop',1365,900],['tablet',1024,900],['mobile',390,844]]) {
      await page.setViewportSize({width,height}); await page.waitForTimeout(350);
      await page.screenshot({path:path.join(dir,`${label}-${name}.png`),fullPage:true});
      console.log(name,await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('[data-living-tree] canvas')?.getBoundingClientRect().toJSON()})));
    }
    console.log('Errors:',errors);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
