// Dev helper: render each A4 page of the generated invoice as a PNG so the
// layout can be compared with the reference without a PDF rasteriser.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateInvoice } from './generateInvoice.js';
import { closeBrowser } from './renderPdf.js';

const [input, outDir = '.'] = process.argv.slice(2);
const { html } = await generateInvoice(fs.readFileSync(input, 'utf8'));
await closeBrowser();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.4 });
await page.setContent(html, { waitUntil: 'load' });
const pages = await page.locator('.page').all();
for (const [i, p] of pages.entries()) await p.screenshot({ path: `${outDir}/page${i + 1}.png` });
await browser.close();
console.log(`${pages.length} pages`);
