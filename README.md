# Invoice PDF PoC

Takes an invoice XML (SAP ISU export) and a static HTML template, joins them and renders a PDF.

- Upload page: `/` — drop the XML, press **Generate PDF**, see the per-stage timings.
- Template editor: `/editor.html` — visual editing (GrapesJS) of the template, with field blocks.
- API: `POST /api/generate` (multipart `xml` field, or raw `application/xml` body) → PDF.

```bash
npm install
npx playwright install chromium   # or set CHROMIUM_PATH to a system Chromium
npm start                          # http://localhost:3000
```

Put your own XML files in `samples/` (git-ignored); the editor preview uses the first one.
`demo-samples/` holds an anonymised sample XML.
