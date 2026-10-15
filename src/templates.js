import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = path.join(here, '..', 'templates');

export const isValidId = (id) => /^[a-z0-9][a-z0-9_-]{0,40}$/i.test(id || '');

export function listTemplates() {
  return fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(TEMPLATES_DIR, d.name, 'invoice.hbs')))
    .map((d) => d.name)
    .sort();
}

// Inline every {{> partial}} so the editor sees one single document.
function expandPartials(src, dir, depth = 0) {
  if (depth > 10) throw new Error('Partials nested too deeply');
  return src
    .replace(/\{\{!--[\s\S]*?--\}\}/g, '')
    .replace(/\{\{!(?!--)[\s\S]*?\}\}/g, '')
    .replace(/\{\{>\s*([\w.-]+)\s*\}\}/g, (_, name) => {
      const file = path.join(dir, 'partials', `${name}.hbs`);
      if (!fs.existsSync(file)) throw new Error(`Missing partial: ${name}`);
      return expandPartials(fs.readFileSync(file, 'utf8'), dir, depth + 1);
    });
}

// The editor must not see Handlebars block tags as text (inside <tbody> the
// HTML parser would throw them out of the table). They travel as comments.
export function toEditorHtml(body) {
  return body
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, p) => `<div class="hbs-raw" data-hbs-raw="${p}">${p}</div>`)
    .replace(/\{\{\s*((?:#|\/|else)[^}]*)\}\}/g, (_, t) => `<!--hbs:${t.trim()}-->`);
}

export function fromEditorHtml(html) {
  return html
    .replace(/<div[^>]*data-hbs-raw="([\w.]+)"[^>]*>[\s\S]*?<\/div>/g, (_, p) => `{{{${p}}}}`)
    .replace(/<!--hbs:([\s\S]*?)-->/g, (_, t) => `{{${t.trim()}}}`);
}

export function readTemplate(id) {
  if (!isValidId(id)) throw Object.assign(new Error('Invalid template id'), { status: 400 });
  const dir = path.join(TEMPLATES_DIR, id);
  if (!fs.existsSync(path.join(dir, 'invoice.hbs'))) throw Object.assign(new Error(`Unknown template: ${id}`), { status: 404 });
  const full = expandPartials(fs.readFileSync(path.join(dir, 'invoice.hbs'), 'utf8'), dir);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(full)?.[1] ?? full;
  const css = unwrapDeviceMedia(fs.readFileSync(path.join(dir, 'invoice.css'), 'utf8'));
  return { html: toEditorHtml(body), css };
}

export function documentFrom(bodyHbs) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Factura {{resumen.numFactura}}</title>
<style>{{{css}}}</style>
</head>
<body>
${bodyHbs}
</body>
</html>
`;
}

// The editor's A4 device used to wrap every style in `@media (max-width: 794px)`,
// which Chromium does not apply when printing to PDF. Unwrap them so templates
// saved that way (and anything saved by older editor builds) render correctly.
export function unwrapDeviceMedia(css) {
  return css.replace(/@media\s*\(max-width:\s*794px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
}

export function ensurePageRule(css) {
  css = unwrapDeviceMedia(css);
  return /@page\b/.test(css) ? css : `@page { size: A4; margin: 0; }\n${css}`;
}

// Writes a template. Overwriting keeps the previous version in .history/.
export function writeTemplate(id, { html, css }) {
  if (!isValidId(id)) throw Object.assign(new Error('Invalid template id'), { status: 400 });
  const dir = path.join(TEMPLATES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const hbsFile = path.join(dir, 'invoice.hbs');
  const cssFile = path.join(dir, 'invoice.css');
  if (fs.existsSync(hbsFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hist = path.join(dir, '.history', stamp);
    fs.mkdirSync(hist, { recursive: true });
    fs.cpSync(hbsFile, path.join(hist, 'invoice.hbs'));
    if (fs.existsSync(cssFile)) fs.cpSync(cssFile, path.join(hist, 'invoice.css'));
    const partials = path.join(dir, 'partials');
    if (fs.existsSync(partials)) fs.cpSync(partials, path.join(hist, 'partials'), { recursive: true });
  }
  fs.writeFileSync(hbsFile, documentFrom(fromEditorHtml(html)));
  fs.writeFileSync(cssFile, ensurePageRule(css));
  // The saved document is already flat: stale partials would only confuse.
  fs.rmSync(path.join(dir, 'partials'), { recursive: true, force: true });
}

// Field catalogue for the editor, taken from a real view model.
export function fieldCatalog(vm) {
  const groups = {};
  const add = (group, entry) => (groups[group] ??= []).push(entry);
  const walk = (obj, prefix, group) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 't' || k === 'css') continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        if (v.startsWith('<svg')) add(group, { path: p, raw: true });
        else add(group, { path: p, sample: v.slice(0, 40) });
      } else if (Array.isArray(v)) {
        const first = v.find((x) => x && typeof x === 'object');
        if (first) for (const [ik, iv] of Object.entries(first)) if (typeof iv === 'string') add(`${group} · inside {{#each ${p}}}`, { path: ik, sample: iv.slice(0, 40) });
      } else if (v && typeof v === 'object') walk(v, p, group);
    }
  };
  for (const [k, v] of Object.entries(vm)) if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, k, k);
  return groups;
}
