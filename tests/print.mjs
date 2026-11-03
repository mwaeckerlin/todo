import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const label=process.argv[2]??'final';if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid print report label.');
const url=(await readFile('artifacts/visual-url.txt','utf8')).trim();
const browser=await chromium.launch({headless:true});const failures=[];const measurements={};
try{
  const context=await browser.newContext({storageState:'artifacts/visual-session.json'});const page=await context.newPage();
  await page.goto(url);await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Board',exact:true}).click();
  const title=page.locator('.task-card .card-title').first();await expect(title).toHaveText('Delivery updated');
  await page.emulateMedia({media:'print'});
  measurements.board=await title.isVisible();if(!measurements.board)failures.push('The printed board hides the task title.');
  await page.emulateMedia({media:'screen'});await page.getByRole('tab',{name:'History',exact:true}).click();
  const revisions=page.locator('.history-list > li > button');await expect(revisions.first()).toBeVisible();
  const screen=await revisions.allTextContents();if(!screen.some(text=>text.includes('Delivery updated')))throw new Error('The print fixture has no populated edit history.');
  await page.emulateMedia({media:'print'});
  measurements.history=await revisions.first().isVisible();if(!measurements.history)failures.push('The printed history hides saved revisions.');
  await mkdir(`artifacts/${label}`,{recursive:true});await writeFile(`artifacts/${label}/print-results.json`,JSON.stringify({url,measurements,failures,at:new Date().toISOString()},null,2));
}finally{await browser.close();}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Printed task titles and saved revisions remain visible.');
