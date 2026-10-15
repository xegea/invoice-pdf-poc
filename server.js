import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { generateInvoice, inspectInvoice, viewModelFor } from './src/generateInvoice.js';
import { listTemplates, readTemplate, writeTemplate, trashTemplate, documentFrom, fromEditorHtml, ensurePageRule, fieldCatalog } from './src/templates.js';
import { invalidateTemplate } from './src/renderPdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.set('trust proxy', true);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(path.join(here, 'public')));
app.use('/vendor/grapesjs', express.static(path.join(here, 'node_modules', 'grapesjs', 'dist')));

// Sample XML for the editor preview and the field catalogue. SAMPLES_DIR wins;
// otherwise the (git-ignored) samples/ folder, then the anonymised demo-samples/.
const sampleXml = () => {
  const candidates = [process.env.SAMPLES_DIR, path.join(here, 'samples'), path.join(here, 'demo-samples')].filter(Boolean);
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const f = fs.readdirSync(dir).find((n) => n.endsWith('.xml'));
    if (f) return fs.readFileSync(path.join(dir, f), 'utf8');
  }
  throw new Error('No sample XML found (put one in samples/ or demo-samples/)');
};

// Accepts either a multipart upload (field "xml") or the raw XML as body
// (Content-Type: application/xml), so it can also be used as a webhook.
const rawXml = express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '5mb' });
function readXml(req) {
  if (req.file) return req.file.buffer.toString('utf8');
  if (typeof req.body === 'string' && req.body.length) return req.body;
  throw Object.assign(new Error('Missing XML (field "xml" or application/xml body)'), { status: 400 });
}

app.post('/api/inspect', rawXml, upload.single('xml'), async (req, res) => {
  try {
    res.json(await inspectInvoice(readXml(req)));
  } catch (e) {
    res.status(e.status || 422).json({ error: e.message });
  }
});

app.post('/api/generate', rawXml, upload.single('xml'), async (req, res) => {
  try {
    const { pdf, timings, meta } = await generateInvoice(readXml(req), {
      templateId: req.body?.template || req.query.template || 'invoice',
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factura-${meta.numFactura}.pdf"`,
      'X-Timings': JSON.stringify({ ...timings, bytes: pdf.length, numFactura: meta.numFactura }),
      'Server-Timing': Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(', '),
      'Access-Control-Expose-Headers': 'X-Timings, Server-Timing, Content-Disposition',
    });
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(e.status || 422).json({ error: e.message });
  }
});

// --- template editor API ---------------------------------------------------
const json = express.json({ limit: '10mb' });
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

app.get('/api/templates', (_req, res) => res.json(listTemplates()));

app.get('/api/templates/:id', (req, res) => {
  try { res.json(readTemplate(req.params.id)); } catch (e) { fail(res, e); }
});

app.put('/api/templates/:id', json, (req, res) => {
  try {
    const { html, css } = req.body || {};
    if (typeof html !== 'string' || typeof css !== 'string') throw Object.assign(new Error('html and css are required'), { status: 400 });
    writeTemplate(req.params.id, { html, css });
    invalidateTemplate(req.params.id);
    res.json({ ok: true, id: req.params.id });
  } catch (e) { fail(res, e); }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const movedTo = trashTemplate(req.params.id);
    invalidateTemplate(req.params.id);
    res.json({ ok: true, movedTo, templates: listTemplates() });
  } catch (e) { fail(res, e); }
});

app.get('/api/fields', async (_req, res) => {
  try { res.json(fieldCatalog(await viewModelFor(sampleXml()))); } catch (e) { fail(res, e); }
});

// PDF of an unsaved template, rendered with the sample XML.
app.post('/api/preview', json, async (req, res) => {
  try {
    const { html, css } = req.body || {};
    const templateSource = { hbs: documentFrom(fromEditorHtml(html)), css: ensurePageRule(css) };
    const { pdf } = await generateInvoice(sampleXml(), { templateSource });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="preview.pdf"' }).send(pdf);
  } catch (e) { console.error(e); fail(res, e); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}`));
