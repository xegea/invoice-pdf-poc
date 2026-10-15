import { XMLParser } from 'fast-xml-parser';

// Tags that can appear several times and must always be arrays.
const ARRAY_TAGS = new Set(['POSICION', 'ORIGEN', 'HISTORICO', 'LECTURA']);

// The sample .txt was copied from a browser XML viewer: lines start with "- "
// and tags are rendered as "<TAG />". Strip the viewer artefacts so both the
// raw SAP XML and the copied text parse the same way.
function clean(xml) {
  return xml
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*-\s+(?=<)/, ''))
    .join('\n')
    .trim();
}

export function parseXml(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false, // keep "23.112" / "0,52 €" as strings
    trimValues: true,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
  const doc = parser.parse(clean(xml));
  const root = doc?.FACT_ISU?.ZFA_XML_ISU;
  if (!root) throw new Error('Invalid XML: FACT_ISU/ZFA_XML_ISU not found');
  return root;
}
