import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { chromium } from 'playwright';
import { unwrapDeviceMedia } from './templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(here, '..', 'templates');

// Compiled templates are cached per template id (the files are static).
const cache = new Map();
function loadTemplate(id) {
  if (cache.has(id)) return cache.get(id);
  const dir = path.join(TEMPLATES_DIR, id);
  if (!fs.existsSync(path.join(dir, 'invoice.hbs'))) throw new Error(`Unknown template: ${id}`);
  const hbs = Handlebars.create();
  const partialsDir = path.join(dir, 'partials');
  if (fs.existsSync(partialsDir)) {
    for (const f of fs.readdirSync(partialsDir)) {
      hbs.registerPartial(path.basename(f, '.hbs'), fs.readFileSync(path.join(partialsDir, f), 'utf8'));
    }
  }
  const css = unwrapDeviceMedia(fs.readFileSync(path.join(dir, 'invoice.css'), 'utf8'));
  const compiled = hbs.compile(fs.readFileSync(path.join(dir, 'invoice.hbs'), 'utf8'));
  const tpl = { render: (vm) => compiled({ ...vm, css }) };
  cache.set(id, tpl);
  return tpl;
}

export function renderHtml(viewModel, templateId = 'invoice') {
  return loadTemplate(templateId).render(viewModel);
}

// Render an unsaved template (editor preview): { hbs, css } instead of an id.
export function renderHtmlFromSource({ hbs, css }, viewModel) {
  return Handlebars.create().compile(hbs)({ ...viewModel, css: unwrapDeviceMedia(css) });
}

export function invalidateTemplate(id) {
  cache.delete(id);
}

// One shared browser: launching Chromium dominates the cost of a single PDF.
let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    const launchOptions = process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
      : {};
    browserPromise = chromium.launch(launchOptions).then((browser) => {
      // If Chromium dies (crash, killed, closed), forget it so the next
      // request launches a fresh one instead of reusing a dead handle.
      browser.on('disconnected', () => { browserPromise = undefined; });
      return browser;
    });
    browserPromise.catch(() => { browserPromise = undefined; });
  }
  return browserPromise;
}

// Small servers cannot afford many Chromium pages at once: queue the rest.
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_PDF) || 2;
let running = 0;
const waiting = [];
async function slot() {
  if (running >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
}
function release() {
  running -= 1;
  waiting.shift()?.();
}

export async function htmlToPdf(html) {
  await slot();
  try {
    return await withRetry(html);
  } finally {
    release();
  }
}

async function withRetry(html) {
  try {
    return await renderOnce(html);
  } catch (e) {
    // The shared browser may have been closed between requests: retry once
    // with a fresh one.
    if (!/closed|disconnected/i.test(e.message)) throw e;
    browserPromise = undefined;
    return renderOnce(html);
  }
}

async function renderOnce(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close();
  browserPromise = undefined;
}
