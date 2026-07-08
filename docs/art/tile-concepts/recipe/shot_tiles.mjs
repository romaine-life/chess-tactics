import puppeteer from 'puppeteer-core';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT='D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/frontend/public/_proofs/tile-sides.png';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1100,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:5173/studio',{waitUntil:'networkidle0',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
const el=await p.$('.tileset-generated-board');
if(el){await el.screenshot({path:OUT});console.log('BOARD shot ok');}
else{await p.screenshot({path:OUT});console.log('FULL page shot (board sel not found)');}
await b.close();
