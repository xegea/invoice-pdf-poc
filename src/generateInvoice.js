import { parseXml } from './parseXml.js';
import { buildViewModel } from './viewModel.js';
import { renderHtml, renderHtmlFromSource, htmlToPdf } from './renderPdf.js';

const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

// Core of the project: XML + static template -> PDF. No HTTP in here, so it
// can be reused later from a webhook, a Lambda or a batch job.
export async function generateInvoice(xml, { templateId = 'invoice', templateSource } = {}) {
  const timings = {};
  let t = performance.now();
  const data = parseXml(xml);
  timings.parseXml = ms(t);

  t = performance.now();
  const viewModel = await buildViewModel(data);
  timings.viewModel = ms(t);

  t = performance.now();
  const html = templateSource ? renderHtmlFromSource(templateSource, viewModel) : renderHtml(viewModel, templateId);
  timings.template = ms(t);

  t = performance.now();
  const pdf = await htmlToPdf(html);
  timings.pdf = ms(t);

  timings.total = Math.round((timings.parseXml + timings.viewModel + timings.template + timings.pdf) * 10) / 10;
  return {
    pdf,
    html,
    timings,
    meta: { numFactura: viewModel.resumen.numFactura, cliente: viewModel.postal.nombre, total: viewModel.pago.total },
  };
}

// Light summary used by the upload page to confirm the XML was read correctly.
export async function inspectInvoice(xml) {
  const vm = await buildViewModel(parseXml(xml));
  return { numFactura: vm.resumen.numFactura, cliente: vm.postal.nombre, total: vm.pago.total, periodo: vm.resumen.periodo };
}

export async function viewModelFor(xml) {
  return buildViewModel(parseXml(xml));
}
