import fs from 'node:fs';
import { generateInvoice } from './generateInvoice.js';
import { closeBrowser } from './renderPdf.js';

const [input, output = 'out.pdf'] = process.argv.slice(2);
if (!input) { console.error('Usage: node src/cli.js <xml> [output.pdf]'); process.exit(1); }
const { pdf, html, timings } = await generateInvoice(fs.readFileSync(input, 'utf8'));
fs.writeFileSync(output, pdf);
fs.writeFileSync(output.replace(/\.pdf$/, '.html'), html);
console.log(`PDF: ${output} (${pdf.length} bytes)`, timings);
await closeBrowser();
