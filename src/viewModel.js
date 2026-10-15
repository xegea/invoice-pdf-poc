import QRCode from 'qrcode';
import { consumptionChart, donutChart, energyScale } from './charts.js';

// XML mixes "96.96 €" and "776,56 €"; the printed invoice always uses a comma.
const money = (s = '') => String(s).replace(/^(-?\d+)\.(\d{1,2})(\s*€)$/, '$1,$2$3');
const toNumber = (s) => Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
const fmtEuro = (n) => n.toFixed(2).replace('.', ',') + ' €';
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Presentation rules inferred from the reference PDF (not present in the XML):
//  - "Exceso de potencia" is printed on top of the table as "Concepto:PEEXPS"
//    and is excluded from the printed subtotal.
//  - Rows after "Impuesto sobre la electricidad" continue on the next page.
const TOP_CONCEPTS = ['Exceso de potencia'];
const PAGE1_LAST_ROW = 'Impuesto sobre la electricidad';

function buildRows(positions) {
  const topRows = [];
  const rows = [];
  let topSum = 0;
  for (const p of positions) {
    const row = {
      concepto: p.CONCEPTO,
      calc1: p.CALC1 ? money(p.CALC1).replace(/(\d),00 kWh/, '$1 kWh') : '',
      calc2: p.CALC2 || '',
      imp: money(p.IMP),
      stacked: p.FORMATO === 'F4',
      subtotal: p.FORMATO === 'F8',
      bold: p.FORMATO === 'F3',
    };
    if (TOP_CONCEPTS.includes(p.CONCEPTO)) {
      topSum += toNumber(p.IMP);
      topRows.push({ ...row, concepto: 'Concepto:PEEXPS', calc1: '', calc2: '', stacked: false });
    } else rows.push(row);
  }
  for (const r of rows) {
    if (r.subtotal && topSum) r.imp = fmtEuro(toNumber(r.imp) - topSum);
  }
  const cut = rows.findIndex((r) => r.concepto.startsWith(PAGE1_LAST_ROW));
  return {
    topRows,
    page1: cut >= 0 ? rows.slice(0, cut + 1) : rows,
    page2: cut >= 0 ? rows.slice(cut + 1) : [],
  };
}

export async function buildViewModel(x) {
  const g = x.DATOS_GENERAL || {};
  const r = x.DATOS_RESUMENFACTURA || {};
  const post = x.DATOS_POSTAL || {};
  const pago = x.DATOS_FACTURACION || {};
  const sum = x.DATOS_SUMINISTRO_LG || {};
  const hist = x.DATOS_HIST_ELE || {};
  const lec = x.DATOS_LECTURAS_ELE || {};
  const con = x.DATOS_CONCEPTOS || {};
  const front = x.DATOS_FRONTAL || {};

  const periods = arr(hist.DETALLE_HIST?.HISTORICO).map((h) => ({
    label: h.FECHA,
    ep1: h.CONS_EP1,
  }));

  const lecturas = arr(lec.DETALLE_LEC?.LECTURA)
    .slice()
    .sort((a, b) => a.PERIODO.localeCompare(b.PERIODO))
    .map((l) => ({
      periodo: l.PERIODO,
      act: l.LECTURA_ACTUAL,
      ant: l.LECTURA_ANTERIOR,
      reactAct: l.VALOR_ACT_REACTIVA,
      reactAnt: l.VALOR_ANT_REACTIVA,
      max: l.MAXIMETRO,
    }));

  const { topRows, page1, page2 } = buildRows(arr(con.DETALLE_PROD?.DETALLE_CON?.POSICION));
  const impuestos = arr(con.DETALLE_IMP?.POSICION).map((p) => ({
    concepto: p.CONCEPTO,
    imp: money(p.IMP),
    bold: p.FORMATO === 'F3',
  }));

  const [origenHead = {}, ...origenRows] = arr(x.DATOS_ORIGEN?.DETALLE_GRF?.ORIGEN);
  const imp = x.DATOS_IMPACTO || {};
  const qrUrl = x.QR?.URL_QR;
  const qrSvg = qrUrl ? await QRCode.toString(qrUrl, { type: 'svg', margin: 0 }) : '';
  const fijos = (node, n) => Array.from({ length: n }, (_, i) => node?.[`TEXT_FIJO${i + 1}`]).filter(Boolean);

  return {
    frontal: { titulo: front.DATOS_FRONTAL, subtitulo: front.DATOS_FRONTAL2 },
    legal: g.LEGAL,
    resumen: {
      titulo: r.TEXT_CAB,
      cups: r.CUPS, numFactura: r.NUM_FACTURA, fecha: r.FEC_EMI, periodo: r.PER_GAS,
      albaran: r.OPBEL, tarifa: r.ATR, tarifaAcceso: r.TARIFA, segmento: r.SEGTARIF,
      contador: r.CONTADOR, contrato: r.VERTRAG, finContrato: r.AUSZDAT,
      penalizacion: r.TEXT_PENALIZ, potencias: r.POTENCIA,
      impAtr: money(r.IMP_ATR), impPt: money(r.IMP_PT), impEn: money(r.IMP_EN),
      t: r, // static captions straight from the XML (TEXT_*)
    },
    postal: {
      nombre: post.NOMBRE,
      linea1: [post.CALLE, post.NUM, post.PISO].filter(Boolean).join(' '),
      linea2: [post.COD_POSTAL, post.POBLACION].filter(Boolean).join(' '),
      provincia: post.PROVINCIA,
    },
    suministro: { titulo: sum.TEXT_CAB, d: sum },
    pago: {
      titulo: pago.TEXT_CAB, tIban: pago.TEXT_IBAN, iban: pago.IBAN,
      tTotal: pago.TEXT_TOTAL, total: pago.TOTAL, tFecha: pago.TEXT_FEC_CAR, fecha: pago.FEC_CAR,
    },
    consumos: {
      titulo: hist.TEXT_CAB,
      nota: hist.TEXT_LEY_RP1,
      chart: consumptionChart(periods),
    },
    lecturas: {
      titulo: lec.TEXT_CAB,
      tActiva: lec.TEXT_FECHA_ACT, tReactiva: lec.TEXT_FECHA_ANT, tMax: lec.TEXT_MAXIMETRO,
      fechaAct: lec.FECHA_ACT, fechaAnt: lec.FECHA_ANT, fechaMax: lec.FECHA_MAXIMETRO,
      filas: lecturas,
    },
    detalle: {
      titulo: con.TEXT_CAB,
      tConcepto: con.TEXT_CONCEPTO, tCalculo: con.TEXT_CALCULO, tImporte: con.TEXT_IMPORTE,
      topRows, page1, page2, impuestos,
      tTotal: con.TEXT_TOTAL, total: con.TOTAL,
    },
    origen: {
      titulo: x.DATOS_ORIGEN?.TEXT_CAB,
      comercializadora: origenHead.VALOR1,
      cols: [origenHead.CONCEPTO, origenHead.VALOR1, origenHead.VALOR2],
      filas: origenRows.map((o) => ({ concepto: o.CONCEPTO, v1: o.VALOR1, v2: o.VALOR2 })),
      donut: donutChart(origenRows),
    },
    impacto: {
      titulo: imp.TEXT_CAB, intro: imp.TEXT_FIJO1, masInfo: imp.TEXT_FIJO2,
      emisiones: { titulo: imp.TEXT_EMI1, sociedad: imp.TEXT_SOCIEDAD, scale: energyScale(imp.VAL_EMI),
        t1: imp.TEXT_EME1, t2: imp.TEXT_EME2, valor: imp.EME, tMedia: imp.TEXT_MED, media: imp.MED },
      residuos: { titulo: imp.TEXT_RED1, sociedad: imp.TEXT_SOCIEDAD, scale: energyScale(imp.VAL_RED),
        t: imp.TEXT_RED, valor: imp.RED, tMedia: imp.TEXT_NAC, media: imp.NAC },
    },
    avisos: [x.ARBITRAJE, x.ATENCION, x.NOTIFICACION]
      .filter(Boolean)
      .map((n) => ({ titulo: n.TEXT_CAB, parrafos: fijos(n, 6) })),
    consejos: { titulo: x.DATOS_CONSEJOS?.TEXT_CAB, items: fijos(x.DATOS_CONSEJOS, 10) },
    contacto: {
      averias: x.AVERIAS, sac: x.SAC, gas: x.AUDAX_GAS,
      gasTexto: fijos(x.AUDAX_GAS, 2).join(' '),
      qrTexto: x.QR?.TEXT_QR, qr: qrSvg,
    },
  };
}
