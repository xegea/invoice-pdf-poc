# Invoice PDF PoC

Takes an invoice **XML** (SAP ISU export) and a static **HTML template**, joins them and renders a **PDF**.
Includes a visual template editor.

- **Generator** (`/`): drop the XML, press *Generate PDF*, see the PDF and the per-stage timings.
- **Template editor** (`/editor.html`): edit the template visually (GrapesJS), insert data fields, save, preview as PDF.
- **API**: `POST /api/generate` with the XML → PDF.
- **CLI**: `node src/cli.js <xml> [output.pdf]`.

## Requirements

- Node.js 22 or newer
- Internet access the first time, to download Chromium (~100 MB)

## Getting started

```bash
npm install
npx playwright install chromium
npm start
```

Then open <http://localhost:3000>.

An anonymised sample is included in `demo-samples/demo.xml`, so it works right after cloning.

### Using your own XML

Put your files in `samples/` (git-ignored, so real customer data never ends up in the repo).
The editor preview and the field catalogue use the first `.xml` found there; if the folder does not exist
they fall back to `demo-samples/`.

## Usage

### Generator

1. Open <http://localhost:3000>.
2. Drop an XML (`.xml` or `.txt`) — the invoice number, customer and total are shown to confirm it was read.
3. Choose the template and press **Generate PDF**.
4. The PDF appears in the preview with the time spent in each stage (XML parsing, view model, template, Chromium).

### Template editor

Open <http://localhost:3000/editor.html> (or *Edit template* in the generator).

- **Canvas**: the A4 template with `{{fields}}` visible. Raw-HTML fields (charts, QR) appear as red dashed boxes.
- **Blocks panel**: basic elements and every data field, grouped by section. Drag them onto the canvas.
- **Preview PDF**: renders the current, unsaved edit with the sample XML.
- **Save**: overwrites the template; the previous version is kept in `templates/<id>/.history/`.
- **Save as…**: creates a new template in `templates/<id>/`.

Notes:

- Saving flattens the template into a single `invoice.hbs` (the partials in `partials/` are inlined).
- Loops and conditionals (`{{#each}}`, `{{#if}}`) are kept as invisible comments in the editor. Do not move or delete them
  unless you know what you are doing.
- The server caches compiled templates; saving from the editor invalidates the cache. If you edit files by hand, restart the server.

### API

```bash
# multipart upload
curl -F xml=@demo-samples/demo.xml http://localhost:3000/api/generate -o invoice.pdf

# raw body, e.g. from a webhook
curl -H 'Content-Type: application/xml' --data-binary @demo-samples/demo.xml \
  http://localhost:3000/api/generate -o invoice.pdf
```

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/generate` | XML (multipart field `xml`, or raw `application/xml` body) → PDF. Optional `template` field/query. Timings in the `X-Timings` and `Server-Timing` headers. |
| `POST` | `/api/inspect` | XML → JSON summary (invoice number, customer, period, total). |
| `GET` | `/api/templates` | List template ids. |
| `GET` / `PUT` | `/api/templates/:id` | Read / save a template (`{ html, css }`). |
| `GET` | `/api/fields` | Catalogue of data fields available to the template. |
| `POST` | `/api/preview` | PDF of an unsaved template (`{ html, css }`) rendered with the sample XML. |
| `GET` | `/health` | `{ "ok": true }` |

### CLI

```bash
node src/cli.js demo-samples/demo.xml invoice.pdf
```

## Configuration

All optional (see `.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `SAMPLES_DIR` | `samples/`, then `demo-samples/` | Folder with the sample XML for the editor. |
| `CHROMIUM_PATH` | — | Use a system Chromium instead of Playwright's (also enables `--no-sandbox`, needed in containers). |
| `MAX_CONCURRENT_PDF` | `2` | PDFs rendered at the same time; the rest wait in a queue. |

## How it works

```
XML ──► parseXml ──► viewModel ──► Handlebars template ──► HTML ──► Chromium ──► PDF
        (src/parseXml.js)  (src/viewModel.js)  (templates/<id>/)       (src/renderPdf.js)
```

`generateInvoice(xml, { templateId })` in `src/generateInvoice.js` is the core and has no HTTP dependency, so it can be reused from a
webhook, a function or a batch job.

## Project structure

| Path | Description |
| --- | --- |
| `server.js` | Express app and API. |
| `src/parseXml.js` | XML → object (tolerates XML copied from a browser viewer). |
| `src/viewModel.js` | Presentation rules: number/date formats, table rows, subtotal, page split, QR. |
| `src/charts.js` | SVG charts: consumption bars, energy-mix donut, A–G scale. |
| `src/renderPdf.js` | Handlebars rendering and Chromium PDF (shared browser, render queue, auto-recovery). |
| `src/templates.js` | Template storage, partial expansion and field catalogue for the editor. |
| `src/generateInvoice.js` | Core: XML + template → PDF with timings. |
| `src/cli.js`, `src/screenshot.js` | CLI and a dev helper that renders each page as PNG. |
| `templates/invoice/` | The template: `invoice.hbs`, `invoice.css`, `partials/`. |
| `public/` | Generator page and editor (GrapesJS is served from `node_modules`). |
| `demo-samples/` | Anonymised sample XML. |

## Notes

- **Memory**: Chromium needs roughly 1 GB of RAM to run comfortably. It does not fit in a 0.5 GB server.
- **Security**: the editor accepts arbitrary HTML that the server renders. Do not expose it publicly without authentication.
- **GrapesJS** is pinned to `0.22.14`; `0.23.7` was published without its JavaScript bundle.
- **Presentation rules** inferred from the reference PDF (not present in the XML): *Exceso de potencia* is printed on top of
  the billing table as `Concepto:PEEXPS` and excluded from the printed subtotal; rows after the electricity tax continue on
  page 2; `1.060,00 kWh` is printed as `1.060 kWh`.
- **Contact data** is taken from the XML (hotline, e-mail), not from the reference PDF, which shows an older brand.
