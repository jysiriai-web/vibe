const p=require('puppeteer-core'); const fs=require('fs');
const F='file:///C:/Users/whwns/Desktop/VIBE/SIRIAI/Sales/Routine/2_compose/templates/intercharm/_굽기/히어로_디자인원본.html';
(async()=>{
 const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',
   args:['--font-render-hinting=none','--force-color-profile=srgb','--disable-lcd-text']});
 const pg=await b.newPage();
 await pg.setViewport({width:760,height:1200,deviceScaleFactor:3});
 await pg.goto(F,{waitUntil:'networkidle0',timeout:60000});
 await pg.evaluate(()=>document.fonts.ready);
 await new Promise(r=>setTimeout(r,2500));
 const info=await pg.evaluate(()=>{const c=getComputedStyle(document.querySelector('.big'));
   return {f:c.fontFamily,w:c.fontWeight,s:c.fontSize,ls:c.letterSpacing,lh:c.lineHeight};});
 console.log('적용:',JSON.stringify(info));
 const h=await pg.evaluateHandle(()=>[...document.querySelectorAll('*')].find(e=>(getComputedStyle(e).backgroundImage||'').includes('hero_bg')));
 const el=h.asElement(); const box=await el.boundingBox();
 console.log('박스:',Math.round(box.width)+'x'+Math.round(box.height));
 await el.screenshot({path:'./hero_baked_raw.png'});
 console.log('구움:',(fs.statSync('./hero_baked_raw.png').size/1024).toFixed(0)+'KB');
 await b.close();})();
