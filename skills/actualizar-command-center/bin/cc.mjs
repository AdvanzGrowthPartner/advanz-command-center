// Advanz Command Center v0.2.1 · generado por scripts/build-plugin.mjs. No editar: se edita en packages/command-center.

// scripts/cc.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// src/core/fx.ts
var FxMissingError = class extends Error {
};
function fxRate(config2, from, to, date, rates = []) {
  if (from === to) return 1;
  const key = `${from}_${to}`;
  const inv = `${to}_${from}`;
  if (config2.fx.modo === "fijo") {
    const direct = config2.fx.tasas[key];
    if (direct) return direct;
    const inverse = config2.fx.tasas[inv];
    if (inverse) return 1 / inverse;
    throw new FxMissingError(`Sin tasa fija ${key} para ${config2.cliente}`);
  }
  const candidates = rates.filter((r) => r.date <= date && (r.from === from && r.to === to || r.from === to && r.to === from)).sort((a, b) => a.date < b.date ? 1 : -1);
  const best = candidates[0];
  if (best) return best.from === from ? best.rate : 1 / best.rate;
  const fb = config2.fx.fallback?.[key] ?? (config2.fx.fallback?.[inv] ? 1 / config2.fx.fallback[inv] : void 0);
  if (fb) return fb;
  throw new FxMissingError(`Sin tasa diaria ${key} al ${date} para ${config2.cliente}`);
}
function toReport(config2, amount, currency, date, rates = []) {
  return amount * fxRate(config2, currency, config2.moneda_reporte, date, rates);
}

// src/core/parse.ts
function toNumber(raw) {
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  const isPct = s.endsWith("%");
  if (isPct) s = s.slice(0, -1).trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return isPct ? n / 100 : n;
}
function fromMicros(raw) {
  const n = toNumber(raw);
  return n === null ? null : n / 1e6;
}
function fromMetaMoney(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  const amount = toNumber(o.value);
  if (amount === null) return null;
  return { amount, currency: typeof o.unit === "string" ? o.unit : "" };
}
function safeDiv(num2, den) {
  if (num2 === null || num2 === void 0 || den === null || den === void 0) return null;
  if (den === 0 || !Number.isFinite(num2) || !Number.isFinite(den)) return null;
  return num2 / den;
}

// src/core/lectura.ts
function confianza(n, unidad, alta = 1e3, media = 150) {
  const v = n ?? 0;
  const c = v >= alta ? "alta" : v >= media ? "media" : "baja";
  return { confianza: c, confianza_motivo: `${v.toLocaleString("es-CL", { maximumFractionDigits: 0 })} ${unidad} en el per\xEDodo` };
}
function senalPorCambio(delta, mejor, umbral = 0.1) {
  if (delta === null || Math.abs(delta) < umbral) return "estable";
  return delta > 0 === (mejor === "sube") ? "potenciar" : "oportunidad";
}
var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function nombreComparacion(anterior) {
  if (!anterior) return "el per\xEDodo anterior";
  return anterior[0].slice(0, 7) === anterior[1].slice(0, 7) && anterior[0].endsWith("-01") ? MESES[Number(anterior[0].slice(5, 7)) - 1] : "el per\xEDodo anterior";
}
var cambio = (a, b) => a === null || a === void 0 || b === null || b === void 0 || b === 0 ? null : a / b - 1;

// src/core/warroom.ts
var dayMs = 864e5;
var d = (iso) => Date.parse(`${iso}T12:00:00Z`);
var addDays = (iso, n) => new Date(d(iso) + n * dayMs).toISOString().slice(0, 10);
var diffDays = (a, b) => Math.round((d(b) - d(a)) / dayMs);
function activeEvent(config2, hoy) {
  const evs = (config2.calendario.eventos_propios ?? []).filter((e) => e.hasta);
  const enCurso = evs.find((e) => e.desde <= hoy && hoy <= e.hasta);
  if (enCurso) return enCurso;
  const proximo = evs.filter((e) => e.desde > hoy && diffDays(hoy, e.desde) <= 30).sort((a, b) => a.desde < b.desde ? -1 : 1)[0];
  if (proximo) return proximo;
  return evs.filter((e) => e.hasta < hoy && diffDays(e.hasta, hoy) <= 7).sort((a, b) => a.hasta > b.hasta ? -1 : 1)[0] ?? null;
}
function localHour(iso, tz) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
}
function warRoomBlock(config2, rows, hoy, extras = {}) {
  const ev = activeEvent(config2, hoy);
  if (!ev) return null;
  const hoyReal = extras.fechaActualizacion && extras.fechaActualizacion > hoy ? extras.fechaActualizacion : hoy;
  const faltan = Math.max(0, diffDays(hoyReal, ev.desde));
  const hasta = ev.hasta;
  const N = diffDays(ev.desde, hasta) + 1;
  const fase = hoy < ev.desde ? "antes" : hoy > hasta ? "despues" : "durante";
  const conv = (r) => r.currency ? toReport(config2, r.value, r.currency, r.date_to) : r.value;
  const byDay = (src) => {
    const uniq = /* @__PURE__ */ new Map();
    for (const r of rows) {
      if (!src(r) || r.date_from !== r.date_to) continue;
      uniq.set([r.source, r.level, r.metric, r.entity_id, r.date_from, JSON.stringify(r.dims ?? {})].join("|"), r);
    }
    const m = /* @__PURE__ */ new Map();
    for (const r of uniq.values()) m.set(r.date_from, (m.get(r.date_from) ?? 0) + conv(r));
    return m;
  };
  const store = (metric) => (r) => (r.source === "shopify" || r.source === "tiendanube") && r.level === "store" && r.metric === metric && !r.dims?.hora;
  const venta = byDay(store("ventas_total"));
  const pedidosD = byDay(store("pedidos"));
  const gasto = byDay((r) => (r.source === "meta" || r.source === "google_ads") && r.level === "account" && r.metric === "gasto");
  const gastoMeta = byDay((r) => r.source === "meta" && r.level === "account" && r.metric === "gasto");
  const gastoGoogle = byDay((r) => r.source === "google_ads" && r.level === "account" && r.metric === "gasto");
  let referencia = null;
  let refShare = [];
  if (ev.referencia) {
    const M = diffDays(ev.referencia.desde, ev.referencia.hasta) + 1;
    const serie = Array.from({ length: M }, (_, i) => venta.get(addDays(ev.referencia.desde, i)) ?? 0);
    const total = serie.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const iMax = serie.indexOf(Math.max(...serie));
      referencia = { nombre: ev.referencia.nombre, desde: ev.referencia.desde, hasta: ev.referencia.hasta, total, pico: { fecha: addDays(ev.referencia.desde, iMax), venta: serie[iMax] } };
      let acc = 0;
      refShare = serie.map((v) => acc += v / total);
    }
  }
  const cumShare = (k) => {
    if (!refShare.length) return (k + 1) / N;
    const x = (k + 1) / N * refShare.length - 1;
    if (x < 0) return 0;
    const i = Math.floor(x), f = x - i;
    const a = refShare[Math.min(i, refShare.length - 1)], b = refShare[Math.min(i + 1, refShare.length - 1)];
    return a + (b - a) * f;
  };
  const meta = ev.meta_venta ?? referencia?.total ?? null;
  const diario = Array.from({ length: N }, (_, k) => {
    const fecha2 = addDays(ev.desde, k);
    const v = fecha2 <= hoy ? venta.get(fecha2) ?? null : null;
    const g = fecha2 <= hoy ? gasto.get(fecha2) ?? null : null;
    const refFecha = ev.referencia ? addDays(ev.referencia.desde, Math.round(k / Math.max(1, N - 1) * diffDays(ev.referencia.desde, ev.referencia.hasta))) : null;
    return {
      dia: k + 1,
      fecha: fecha2,
      venta: v,
      pedidos: fecha2 <= hoy ? pedidosD.get(fecha2) ?? null : null,
      gasto: g,
      gasto_meta: fecha2 <= hoy ? gastoMeta.get(fecha2) ?? null : null,
      gasto_google: fecha2 <= hoy ? gastoGoogle.get(fecha2) ?? null : null,
      mer: safeDiv(v, g),
      esperado: meta !== null ? meta * (cumShare(k) - (k ? cumShare(k - 1) : 0)) : null,
      referencia: refFecha ? venta.get(refFecha) ?? null : null
    };
  });
  const dia_actual = fase === "durante" ? diffDays(ev.desde, hoy) + 1 : null;
  const hechos = fase === "antes" ? 0 : fase === "durante" ? dia_actual : N;
  const acumulado = diario.slice(0, hechos).reduce((a, x) => a + (x.venta ?? 0), 0);
  const pedidos = diario.slice(0, hechos).reduce((a, x) => a + (x.pedidos ?? 0), 0);
  const esperado_a_hoy = meta !== null && hechos ? meta * cumShare(hechos - 1) : null;
  const ritmo = safeDiv(acumulado, esperado_a_hoy);
  const horas = /* @__PURE__ */ new Map();
  for (const r of rows.filter((x) => (x.source === "shopify" || x.source === "tiendanube") && x.dims?.hora)) {
    const h = localHour(r.dims.hora, config2.zona_horaria);
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: config2.zona_horaria }).format(new Date(r.dims.hora));
    if (localDay !== hoy) continue;
    const o = horas.get(h) ?? { venta: 0, pedidos: 0 };
    if (r.metric === "ventas_total") o.venta += conv(r);
    if (r.metric === "pedidos") o.pedidos += r.value;
    horas.set(h, o);
  }
  const e = extras.email;
  const altasRecientes = (e?.altas ?? []).some((l) => (l.semanas.at(-1)?.altas ?? 0) > 0 && /pre|cyber|evento|lead/i.test(l.lista));
  const flow = (clave) => e?.checklist.find((k) => k.clave === clave);
  const checklist = [
    { tarea: "Meta de venta del evento configurada", estado: ev.meta_venta ? "ok" : "pendiente", detalle: ev.meta_venta ? void 0 : "Sin meta: el ritmo se mide contra el evento anterior" },
    { tarea: "Captaci\xF3n pre-evento activa (lista con altas esta semana)", estado: altasRecientes ? "ok" : "pendiente" },
    { tarea: "Flow de carrito abandonado activo", estado: flow("carrito")?.estado === "activo" ? "ok" : "pendiente" },
    { tarea: "Flow de navegaci\xF3n abandonada activo", estado: flow("navegacion")?.estado === "activo" ? "ok" : "pendiente", detalle: flow("navegacion")?.estado === "borrador" ? "Est\xE1 en borrador" : void 0 },
    { tarea: "Tracking de compras sobre 85%", estado: extras.captura !== null && extras.captura !== void 0 && extras.captura >= 0.85 ? "ok" : "pendiente", detalle: extras.captura != null ? `GA4 ve ${Math.round(extras.captura * 100)}% de los pedidos` : void 0 },
    { tarea: "Descuentos del evento cargados en la tienda", estado: "manual" },
    { tarea: "Banner y p\xE1gina del evento publicados", estado: "manual" },
    { tarea: "Campa\xF1as del evento creadas (en pausa)", estado: "manual" },
    { tarea: "Email de lanzamiento programado", estado: "manual" },
    { tarea: "Stock de los productos m\xE1s vendidos revisado", estado: "manual" }
  ];
  let referencia_por_hora = null;
  if (fase === "durante" && ev.referencia) {
    const k = dia_actual - 1;
    const refFecha = addDays(ev.referencia.desde, Math.round(k / Math.max(1, N - 1) * diffDays(ev.referencia.desde, ev.referencia.hasta)));
    const hs = /* @__PURE__ */ new Map();
    for (const r of rows.filter((x) => (x.source === "shopify" || x.source === "tiendanube") && x.dims?.hora && x.metric === "ventas_total")) {
      const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: config2.zona_horaria }).format(new Date(r.dims.hora));
      if (localDay !== refFecha) continue;
      const h = localHour(r.dims.hora, config2.zona_horaria);
      hs.set(h, (hs.get(h) ?? 0) + conv(r));
    }
    if (hs.size) referencia_por_hora = { fecha: refFecha, horas: [...hs.entries()].sort(([a], [b]) => a - b).map(([hora, venta2]) => ({ hora, venta: venta2 })) };
  }
  const cur = config2.moneda_reporte;
  const money2 = (v) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${Math.round(v).toLocaleString("es-CL")} ${cur}`;
  const pctN = (v) => v === null ? "\u2014" : `${Math.round(v * 100)}%`;
  const crece = referencia && meta ? meta / referencia.total - 1 : null;
  const listos = checklist.filter((c) => c.estado === "ok").length, verificables = checklist.filter((c) => c.estado !== "manual").length;
  const pendientes = checklist.filter((c) => c.estado === "pendiente");
  const semRitmo = ritmo === null ? "estable" : ritmo >= 1 ? "potenciar" : ritmo >= 0.9 ? "estable" : "oportunidad";
  const gastoEv = diario.slice(0, hechos).reduce((a, x) => a + (x.gasto ?? 0), 0);
  const conf = confianza(pedidos, "pedidos del evento", 300, 50);
  const acumuladoL = fase === "antes" ? {
    senal: "estable",
    titular: `La meta es ${money2(meta)}${crece !== null ? ` (${crece >= 0 ? "+" : "\u2212"}${pctN(Math.abs(crece))} sobre ${referencia.nombre})` : ""}: el gr\xE1fico muestra c\xF3mo deber\xEDa acumularse d\xEDa a d\xEDa.`,
    detalle: referencia ? `Sigue la forma de ${referencia.nombre}: arranque suave, el pico en la mitad y cierre m\xE1s tranquilo.` : void 0,
    respaldo: { contra: referencia ? `${referencia.nombre} (${referencia.desde} a ${referencia.hasta}): ${money2(referencia.total)}.` : "Sin evento de referencia: curva lineal.", confianza: referencia ? "alta" : "baja", confianza_motivo: referencia ? "venta real del evento anterior" : "sin referencia", medicion: "Venta acumulada contra la curva, cada vez que se actualiza." },
    que_es: "La venta acumulada del evento contra el camino que lleva a la meta.",
    como_se_lee: "Si la l\xEDnea real va por encima de la curva, vas camino a pasar la meta; si va por debajo, la diferencia es lo que falta recuperar."
  } : {
    senal: semRitmo,
    titular: `${fase === "durante" ? `D\xEDa ${dia_actual} de ${N}: llevas` : "Cerraste con"} ${money2(acumulado)}, ${pctN(ritmo)} de lo esperado a ${fase === "durante" ? "esta altura" : "la meta"}.`,
    detalle: fase === "durante" && ritmo !== null && meta !== null ? `A este ritmo cierras en ~${money2(ritmo * meta)}${ritmo < 1 ? `; faltan ~${money2(meta - acumulado)} para la meta` : ""}.` : void 0,
    accion: fase === "durante" && ritmo !== null && ritmo < 0.9 ? "Siguiente paso: reforzar lo que ya vende (anuncios Para escalar y un email de recordatorio) antes del d\xEDa pico." : void 0,
    respaldo: { contra: `La curva de la meta con la forma de ${referencia?.nombre ?? "un reparto lineal"}.`, ...conf, medicion: "Ritmo acumulado en cada actualizaci\xF3n." },
    que_es: "La venta acumulada del evento contra el camino que lleva a la meta.",
    como_se_lee: "Si la l\xEDnea real va por encima de la curva, vas camino a pasar la meta; si va por debajo, la diferencia es lo que falta recuperar."
  };
  const hoyD = fase === "durante" ? diario[dia_actual - 1] : null;
  const diarioL = fase === "antes" ? {
    senal: "estable",
    titular: referencia?.pico ? `El d\xEDa m\xE1s fuerte de ${referencia.nombre} fue el ${referencia.pico.fecha.slice(8, 10)}, con ${money2(referencia.pico.venta)}: la meta reparte m\xE1s venta a los d\xEDas del medio.` : "La meta se reparte en partes iguales por d\xEDa.",
    respaldo: { contra: `${referencia?.nombre ?? "Reparto lineal"}.`, confianza: "alta", confianza_motivo: "venta real del evento anterior", medicion: "Venta de cada d\xEDa contra lo esperado." },
    que_es: "Lo esperado para cada d\xEDa del evento (barras claras) y lo vendido (barras llenas).",
    como_se_lee: "Cada d\xEDa se compara contra su propia meta, no contra el promedio: los d\xEDas del pico deben vender m\xE1s."
  } : {
    senal: hoyD?.venta !== null && hoyD?.esperado ? hoyD.venta >= hoyD.esperado ? "potenciar" : "oportunidad" : "estable",
    titular: hoyD && hoyD.esperado ? `Hoy (${hoyD.fecha.slice(8, 10)}) llevas ${money2(hoyD.venta)} de ${money2(hoyD.esperado)} esperados para el d\xEDa.` : `Invertiste ${money2(gastoEv)} en el evento.`,
    detalle: gastoEv ? `Inversi\xF3n del evento: ${money2(gastoEv)} (retorno total ${acumulado && gastoEv ? `${(acumulado / gastoEv).toLocaleString("es-CL", { maximumFractionDigits: 1 })}x` : "\u2014"}).` : void 0,
    respaldo: { contra: "Lo esperado de cada d\xEDa seg\xFAn la curva de la meta.", ...conf, medicion: "Venta, inversi\xF3n y retorno de cada d\xEDa." },
    que_es: "Lo esperado para cada d\xEDa del evento (barras claras) y lo vendido (barras llenas).",
    como_se_lee: "Cada d\xEDa se compara contra su propia meta, no contra el promedio: los d\xEDas del pico deben vender m\xE1s."
  };
  const ventaHoy = [...horas.values()].reduce((a, x) => a + x.venta, 0);
  const ultimaHora = [...horas.keys()].sort((a, b) => b - a)[0];
  const refHasta = referencia_por_hora && ultimaHora !== void 0 ? referencia_por_hora.horas.filter((x) => x.hora <= ultimaHora).reduce((a, x) => a + x.venta, 0) : null;
  const horaL = {
    senal: refHasta ? ventaHoy >= refHasta ? "potenciar" : "oportunidad" : "estable",
    titular: fase !== "durante" ? "Durante el evento, este gr\xE1fico compara la venta de hoy hora a hora con el mismo d\xEDa del a\xF1o pasado." : refHasta ? `Hasta las ${ultimaHora}:00 llevas ${money2(ventaHoy)}; el mismo d\xEDa de ${referencia?.nombre} a esta hora llevaba ${money2(refHasta)}.` : `Hoy llevas ${money2(ventaHoy)}.`,
    respaldo: { contra: referencia_por_hora ? `El d\xEDa ${referencia_por_hora.fecha} de ${referencia?.nombre}, hora a hora.` : "Sin datos por hora del evento anterior.", ...conf, medicion: "Venta por hora del d\xEDa en curso." },
    que_es: "La venta de hoy por hora (barras) y la del d\xEDa equivalente del evento anterior (l\xEDnea).",
    como_se_lee: "Sirve para decidir en el d\xEDa: si a media tarde vas bajo el a\xF1o pasado, es momento de un email o de reforzar la pauta."
  };
  const prep = {
    senal: pendientes.length ? "oportunidad" : "potenciar",
    titular: `Preparaci\xF3n: ${listos} de ${verificables} tareas verificables listas${pendientes.length ? `; pendiente: ${pendientes.map((p) => p.tarea.toLowerCase()).join(", ")}` : ""}.`,
    detalle: "Las tareas manuales (descuentos, banner, campa\xF1as en pausa, email programado, stock) se marcan a mano en la lista.",
    respaldo: { contra: "Datos de la captura (flows, tracking, altas a la lista, meta configurada).", confianza: "alta", confianza_motivo: "verificado con los datos", medicion: "Estado de la lista en cada actualizaci\xF3n." },
    que_es: "Lo que tiene que estar listo antes de que empiece el evento.",
    como_se_lee: "Las marcas \u2713/pendiente las pone el sistema con los datos; las casillas las marcas t\xFA."
  };
  const veredicto = fase === "antes" ? { senal: prep.senal, titular: `${faltan === 0 ? `${ev.nombre} empieza hoy` : `Faltan ${faltan} ${faltan === 1 ? "d\xEDa" : "d\xEDas"} para ${ev.nombre}`}. Meta: ${money2(meta)}${crece !== null ? ` (${crece >= 0 ? "+" : "\u2212"}${pctN(Math.abs(crece))} sobre ${referencia.nombre})` : ""}.`, detalle: prep.titular } : { senal: acumuladoL.senal, titular: acumuladoL.titular, detalle: acumuladoL.detalle ?? diarioL.titular };
  return {
    evento: { nombre: ev.nombre, desde: ev.desde, hasta, dias: N, enlaces: (ev.enlaces ?? []).filter((e2) => /^https:\/\//.test(e2.url)) },
    fase,
    dias_para_inicio: faltan,
    dia_actual,
    meta,
    meta_fuente: ev.meta_venta ? "configurada" : referencia ? "referencia" : null,
    acumulado,
    pedidos,
    esperado_a_hoy,
    ritmo,
    proyeccion: ritmo !== null && meta !== null ? ritmo * meta : null,
    diario,
    hoy_por_hora: [...horas.entries()].sort(([a], [b]) => a - b).map(([hora, v]) => ({ hora, ...v })),
    referencia_por_hora,
    referencia,
    checklist,
    lecturas: { acumulado: acumuladoL, diario: diarioL, hora: horaL, preparacion: prep },
    veredicto
  };
}

// src/capture/plan.ts
function previousPeriod(date_from, date_to) {
  if (date_from.endsWith("-01") && date_from.slice(0, 7) === date_to.slice(0, 7)) {
    const d2 = /* @__PURE__ */ new Date(`${date_from}T12:00:00Z`);
    d2.setUTCMonth(d2.getUTCMonth() - 1);
    const ym = d2.toISOString().slice(0, 7);
    const ultimo = new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth() + 1, 0)).getUTCDate();
    const dia = Math.min(Number(date_to.slice(8, 10)), ultimo);
    return [`${ym}-01`, `${ym}-${String(dia).padStart(2, "0")}`];
  }
  const n = Math.round((Date.parse(`${date_to}T00:00:00Z`) - Date.parse(`${date_from}T00:00:00Z`)) / 864e5) + 1;
  return [addDays2(date_from, -n), addDays2(date_from, -1)];
}
function addDays2(isoDate, days) {
  const d2 = /* @__PURE__ */ new Date(`${isoDate}T12:00:00Z`);
  d2.setUTCDate(d2.getUTCDate() + days);
  return d2.toISOString().slice(0, 10);
}
function utcOffsetIso(timeZone, isoDate) {
  const d2 = /* @__PURE__ */ new Date(`${isoDate}T12:00:00Z`);
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(d2).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tzName.match(/GMT([+-]\d{2}):?(\d{2})?/);
  if (!m) return `${isoDate}T00:00:00+00:00`;
  const sign = m[1].startsWith("-") ? 1 : -1;
  const hh = Math.abs(Number(m[1]));
  const mm = Number(m[2] ?? 0);
  const utc = new Date(Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)), sign * hh, sign * mm));
  return utc.toISOString().replace(".000Z", "+00:00");
}
var slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function buildCapturePlan(config2, date_from, date_to) {
  const steps = [];
  const f = config2.fuentes;
  const since = `SINCE ${date_from} UNTIL ${date_to}`;
  for (const t of config2.tiendas.filter((x) => x.plataforma === "shopify")) {
    const cur = t.moneda;
    steps.push(
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-sales.json",
        normalize: { fn: "shopifyql", currency: cur },
        para: "Resumen \xB7 Ventas",
        args: { query: `FROM sales SHOW total_sales, net_sales, gross_sales, discounts, returns, orders, average_order_value, new_customers, returning_customers ${since}` }
      },
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-funnel-device.json",
        normalize: { fn: "shopifyql", currency: cur },
        para: "Conversi\xF3n y CRO \xB7 embudo",
        args: { query: `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate GROUP BY session_device_type ${since}` }
      },
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-products.json",
        top: 50,
        normalize: { fn: "shopifyql", currency: cur },
        para: "Ventas \xB7 productos",
        args: { query: `FROM sales SHOW total_sales, orders, discounts GROUP BY product_title ${since} ORDER BY total_sales DESC LIMIT 50` }
      }
    );
    const [pFrom, pTo] = previousPeriod(date_from, date_to);
    const sinceAnt = `SINCE ${pFrom} UNTIL ${pTo}`;
    steps.push(
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-sales-prev.json",
        serie: true,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "shopifyql", currency: cur },
        para: "Resumen \xB7 \xE1rbol del negocio (per\xEDodo de comparaci\xF3n)",
        args: { query: `FROM sales SHOW total_sales, net_sales, gross_sales, discounts, returns, orders, average_order_value, new_customers, returning_customers ${sinceAnt}` }
      },
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-funnel-prev.json",
        serie: true,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "shopifyql", currency: cur },
        para: "Resumen \xB7 embudo del per\xEDodo de comparaci\xF3n",
        args: { query: `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate GROUP BY session_device_type ${sinceAnt}` }
      },
      // Ventas (dashboard): venta y clientes por día, en ambos períodos, y los productos del período de comparación (Δ).
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-sales-daily.json",
        serie: true,
        normalize: { fn: "shopifyql", currency: cur },
        para: "Ventas \xB7 venta, pedidos y clientes por d\xEDa",
        args: { query: `FROM sales SHOW total_sales, gross_sales, discounts, orders, new_customers, returning_customers GROUP BY day ${since}` }
      },
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-sales-daily-prev.json",
        serie: true,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "shopifyql", currency: cur },
        para: "Ventas \xB7 la misma serie del per\xEDodo de comparaci\xF3n",
        args: { query: `FROM sales SHOW total_sales, gross_sales, discounts, orders, new_customers, returning_customers GROUP BY day ${sinceAnt}` }
      },
      {
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "shopify-products-prev.json",
        serie: true,
        top: 50,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "shopifyql", currency: cur },
        para: "Ventas \xB7 productos del per\xEDodo de comparaci\xF3n (\u0394)",
        args: { query: `FROM sales SHOW total_sales, orders, discounts GROUP BY product_title ${sinceAnt} ORDER BY total_sales DESC LIMIT 50` }
      }
    );
  }
  const gads = f.google_ads;
  for (const customer_id of gads?.cuentas ?? []) {
    const cur = gads?.moneda ?? config2.moneda_reporte;
    const period = `segments.date BETWEEN '${date_from}' AND '${date_to}'`;
    const q = (resource, fields, extra = [], limit = 200) => ({ customer_id, resource, fields, conditions: [period, ...extra], orderings: ["metrics.cost_micros DESC"], limit });
    const m = ["metrics.cost_micros", "metrics.impressions", "metrics.clicks", "metrics.conversions", "metrics.conversions_value"];
    steps.push(
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-campaigns.json",
        normalize: { fn: "gaql", resource: "campaign", currency: cur },
        para: "B\xFAsqueda paga \xB7 d\xF3nde se va la plata / cuota",
        args: q("campaign", ["campaign.name", "campaign.advertising_channel_type", ...m, "metrics.search_impression_share", "metrics.search_budget_lost_impression_share", "metrics.search_rank_lost_impression_share", "metrics.search_top_impression_share"], ["metrics.impressions > 0"])
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-keywords.json",
        top: 200,
        normalize: { fn: "gaql", resource: "keyword_view", currency: cur },
        para: "B\xFAsqueda paga \xB7 keywords",
        args: q("keyword_view", ["ad_group_criterion.keyword.text", "ad_group_criterion.keyword.match_type", "ad_group_criterion.quality_info.quality_score", "campaign.name", ...m, "metrics.search_impression_share", "metrics.search_rank_lost_impression_share"])
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-asset-groups.json",
        top: 200,
        normalize: { fn: "gaql", resource: "asset_group", currency: cur },
        para: "B\xFAsqueda paga \xB7 PMax por dentro",
        args: q("asset_group", ["asset_group.name", "campaign.name", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"])
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-products.json",
        top: 200,
        normalize: { fn: "gaql", resource: "shopping_performance_view", currency: cur },
        para: "B\xFAsqueda paga \xB7 productos",
        args: q("shopping_performance_view", ["segments.product_title", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"])
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-search-terms.json",
        top: 300,
        normalize: { fn: "gaql", resource: "search_term_view", currency: cur },
        para: "B\xFAsqueda paga \xB7 t\xE9rminos \u2192 negativas",
        args: q("search_term_view", ["search_term_view.search_term", "campaign.name", ...m], [], 300)
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: "google-ads-changes.json",
        normalize: { fn: "none" },
        para: "Bit\xE1cora autom\xE1tica (la API guarda ~30 d\xEDas: capturar diario)",
        args: {
          customer_id,
          resource: "change_event",
          fields: ["change_event.change_date_time", "change_event.change_resource_type", "change_event.resource_change_operation", "change_event.user_email", "campaign.name"],
          conditions: [`change_event.change_date_time >= '${date_from}'`, `change_event.change_date_time <= '${date_to} 23:59:59'`],
          orderings: ["change_event.change_date_time DESC"],
          limit: 500
        }
      }
    );
    const [pFrom, pTo] = previousPeriod(date_from, date_to);
    const sfx = gads.cuentas.length > 1 ? `-${customer_id}` : "";
    const cuenta = ["metrics.cost_micros", "metrics.impressions", "metrics.clicks", "metrics.conversions", "metrics.conversions_value", "metrics.search_impression_share", "metrics.search_budget_lost_impression_share", "metrics.search_rank_lost_impression_share"];
    const camp = ["campaign.name", "metrics.cost_micros", "metrics.impressions", "metrics.clicks", "metrics.conversions", "metrics.conversions_value"];
    const between = (a, b) => `segments.date BETWEEN '${a}' AND '${b}'`;
    steps.push(
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: `google-ads-daily${sfx}.json`,
        serie: true,
        normalize: { fn: "gaql", resource: "customer", currency: cur },
        para: "B\xFAsqueda paga \xB7 dashboard diario de la cuenta",
        args: { customer_id, resource: "customer", fields: ["segments.date", ...cuenta], conditions: [between(date_from, date_to)], orderings: ["segments.date"] }
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: `google-ads-campaigns-daily${sfx}.json`,
        serie: true,
        normalize: { fn: "gaql", resource: "campaign", currency: cur },
        para: "B\xFAsqueda paga \xB7 inversi\xF3n, conversiones y CPA diario por campa\xF1a",
        args: { customer_id, resource: "campaign", fields: ["segments.date", ...camp], conditions: [between(date_from, date_to), "metrics.impressions > 0"], orderings: ["segments.date"], limit: 2e3 }
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: `google-ads-prev-account${sfx}.json`,
        serie: true,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "gaql", resource: "customer", currency: cur },
        para: "B\xFAsqueda paga \xB7 per\xEDodo anterior (\u0394 de los indicadores)",
        args: { customer_id, resource: "customer", fields: cuenta, conditions: [between(pFrom, pTo)] }
      },
      {
        source: "google_ads",
        tool: "google_ads.search",
        save_as: `google-ads-prev-campaigns${sfx}.json`,
        serie: true,
        window: { date_from: pFrom, date_to: pTo },
        normalize: { fn: "gaql", resource: "campaign", currency: cur },
        para: "B\xFAsqueda paga \xB7 per\xEDodo anterior por campa\xF1a (\u0394 de la tabla)",
        args: { customer_id, resource: "campaign", fields: camp, conditions: [between(pFrom, pTo), "metrics.impressions > 0"], orderings: ["metrics.cost_micros DESC"], limit: 200 }
      }
    );
  }
  const ga4 = f.ga4;
  if (ga4?.propiedad) {
    const base = { property_id: ga4.propiedad, date_ranges: [{ start_date: date_from, end_date: date_to }], currency_code: config2.moneda_reporte };
    const cur = config2.moneda_reporte;
    steps.push(
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-totals.json",
        normalize: { fn: "ga4", currency: cur },
        para: "Resumen \xB7 captura de tracking",
        args: { ...base, dimensions: [], metrics: ["sessions", "newUsers", "engagementRate", "checkouts", "addToCarts", "ecommercePurchases", "purchaseRevenue"] }
      },
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-channels.json",
        normalize: { fn: "ga4", currency: cur },
        para: "Resumen \xB7 canales / CRO",
        args: { ...base, dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "engagementRate", "keyEvents:purchase", "purchaseRevenue", "sessionKeyEventRate:purchase"] }
      },
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-landing-device.json",
        top: 100,
        normalize: { fn: "ga4", currency: cur },
        para: "Conversi\xF3n y CRO \xB7 p\xE1ginas de entrada",
        args: { ...base, dimensions: ["landingPage", "deviceCategory"], metrics: ["sessions", "engagementRate", "keyEvents:purchase", "purchaseRevenue"], order_bys: [{ metric: { metric_name: "sessions" }, desc: true }], limit: 100 }
      },
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-source-medium.json",
        top: 100,
        normalize: { fn: "ga4", currency: cur },
        para: "Calidad de datos \xB7 UTMs sin normalizar (S-DATA-02)",
        args: { ...base, dimensions: ["sessionSourceMedium"], metrics: ["sessions", "keyEvents:purchase"], order_bys: [{ metric: { metric_name: "sessions" }, desc: true }], limit: 100 }
      }
    );
    const [gFrom, gTo] = previousPeriod(date_from, date_to);
    const diarias = ["sessions", "newUsers", "engagementRate", "screenPageViewsPerSession", "averageSessionDuration", "addToCarts", "checkouts", "ecommercePurchases", "purchaseRevenue"];
    steps.push(
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-daily.json",
        serie: true,
        normalize: { fn: "ga4", currency: cur },
        para: "Conversi\xF3n y CRO \xB7 tr\xE1fico y embudo d\xEDa a d\xEDa",
        args: { ...base, dimensions: ["date"], metrics: diarias, order_bys: [{ dimension: { dimension_name: "date" } }] }
      },
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-daily-prev.json",
        serie: true,
        window: { date_from: gFrom, date_to: gTo },
        normalize: { fn: "ga4", currency: cur },
        para: "Conversi\xF3n y CRO \xB7 mismo per\xEDodo de comparaci\xF3n (\u0394 y l\xEDnea punteada)",
        args: { ...base, date_ranges: [{ start_date: gFrom, end_date: gTo }], dimensions: ["date"], metrics: diarias, order_bys: [{ dimension: { dimension_name: "date" } }] }
      },
      {
        source: "ga4",
        tool: "ga4.run_report",
        save_as: "ga4-channel-daily.json",
        serie: true,
        normalize: { fn: "ga4", currency: cur },
        para: "Conversi\xF3n y CRO \xB7 tr\xE1fico diario por canal",
        args: { ...base, dimensions: ["date", "sessionDefaultChannelGroup"], metrics: ["sessions", "ecommercePurchases"], order_bys: [{ dimension: { dimension_name: "date" } }], limit: 2e3 }
      }
    );
  }
  const gsc = f.gsc;
  if (gsc?.propiedad) {
    const base = { site_url: gsc.propiedad, date_from, date_to };
    steps.push(
      { source: "gsc", tool: "gsc.gsc_performance_overview", save_as: "gsc-overview.json", normalize: { fn: "gsc_overview" }, para: "SEO \xB7 KPIs", args: base },
      { source: "gsc", tool: "gsc.gsc_query", save_as: "gsc-query-page.tsv.json", top: 1e3, normalize: { fn: "gsc_tsv" }, para: "SEO \xB7 marca/no-marca, canibalizaci\xF3n", args: { ...base, dimensions: "query,page", row_limit: 1e3 } },
      { source: "gsc", tool: "gsc.gsc_quick_wins", save_as: "gsc-quick-wins.json", normalize: { fn: "none" }, para: "SEO \xB7 oportunidades", args: { ...base, row_limit: 50 } },
      { source: "gsc", tool: "gsc.gsc_ctr_gaps", save_as: "gsc-ctr-gaps.json", normalize: { fn: "none" }, para: "SEO \xB7 brechas de CTR", args: { ...base, entity: "query", row_limit: 50 } }
    );
    const [sFrom, sTo] = previousPeriod(date_from, date_to);
    const prev = { site_url: gsc.propiedad, date_from: sFrom, date_to: sTo };
    steps.push(
      { source: "gsc", tool: "gsc.gsc_query", save_as: "gsc-daily.tsv.json", serie: true, normalize: { fn: "gsc_tsv" }, para: "SEO \xB7 impresiones, clics, CTR y posici\xF3n por d\xEDa", args: { ...base, dimensions: "date", row_limit: 100 } },
      { source: "gsc", tool: "gsc.gsc_query", save_as: "gsc-daily-prev.tsv.json", serie: true, window: { date_from: sFrom, date_to: sTo }, normalize: { fn: "gsc_tsv" }, para: "SEO \xB7 la misma serie del per\xEDodo de comparaci\xF3n", args: { ...prev, dimensions: "date", row_limit: 100 } },
      { source: "gsc", tool: "gsc.gsc_query", save_as: "gsc-queries.tsv.json", serie: true, top: 500, normalize: { fn: "gsc_tsv" }, para: "SEO \xB7 tabla de b\xFAsquedas (como Looker)", args: { ...base, dimensions: "query", row_limit: 500 } },
      { source: "gsc", tool: "gsc.gsc_query", save_as: "gsc-queries-prev.tsv.json", serie: true, top: 500, window: { date_from: sFrom, date_to: sTo }, normalize: { fn: "gsc_tsv" }, para: "SEO \xB7 b\xFAsquedas del per\xEDodo de comparaci\xF3n (\u0394)", args: { ...prev, dimensions: "query", row_limit: 500 } }
    );
  }
  const meta = f.meta;
  for (const acct of meta?.cuentas ?? []) {
    const base = { ad_account_id: `act_${acct}`, time_range: { since: date_from, until: date_to } };
    const [mFrom, mTo] = previousPeriod(date_from, date_to);
    const sfxM = meta.cuentas.length > 1 ? `-${acct}` : "";
    const diariosMeta = ["amount_spent", "impressions", "website_ctr", "cpm", "omni_purchase", "omni_purchase_values", "omni_landing_page_view", "omni_add_to_cart", "omni_initiated_checkout"];
    steps.push({
      source: "meta",
      tool: "meta.ads_get_ad_entities",
      save_as: `meta-account-prev${sfxM}.json`,
      serie: true,
      window: { date_from: mFrom, date_to: mTo },
      normalize: { fn: "meta", level: "account" },
      para: "Resumen y Meta \xB7 el per\xEDodo de comparaci\xF3n",
      args: { ad_account_id: `act_${acct}`, time_range: { since: mFrom, until: mTo }, level: "account", fields: ["amount_spent", "impressions", "reach", "frequency", "website_ctr", "cpm", "omni_purchase", "omni_purchase_values", "omni_landing_page_view", "omni_add_to_cart", "omni_initiated_checkout"] }
    });
    steps.push(
      {
        source: "meta",
        tool: "meta.ads_get_ad_entities",
        save_as: `meta-daily${sfxM}.json`,
        serie: true,
        normalize: { fn: "meta", level: "account" },
        para: "Meta \xB7 inversi\xF3n, compras, costo y clics por d\xEDa",
        args: { ad_account_id: `act_${acct}`, time_range: { since: date_from, until: date_to }, level: "account", time_increment: 1, fields: diariosMeta }
      },
      {
        source: "meta",
        tool: "meta.ads_get_ad_entities",
        save_as: `meta-daily-prev${sfxM}.json`,
        serie: true,
        window: { date_from: mFrom, date_to: mTo },
        normalize: { fn: "meta", level: "account" },
        para: "Meta \xB7 la misma serie del per\xEDodo de comparaci\xF3n",
        args: { ad_account_id: `act_${acct}`, time_range: { since: mFrom, until: mTo }, level: "account", time_increment: 1, fields: diariosMeta }
      }
    );
    steps.push(
      {
        source: "meta",
        tool: "meta.ads_get_ad_entities",
        save_as: `meta-account${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`,
        normalize: { fn: "meta", level: "account" },
        para: "Resumen \xB7 inversi\xF3n / conciliaci\xF3n",
        args: { ...base, level: "account", fields: ["amount_spent", "impressions", "reach", "frequency", "website_ctr", "cpm", "omni_purchase", "omni_purchase_values"] }
      },
      {
        source: "meta",
        tool: "meta.ads_get_ad_entities",
        save_as: `meta-ads${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`,
        top: 100,
        normalize: { fn: "meta", level: "ad" },
        para: "Creativos \xB7 galer\xEDa, fatiga, embudo, video",
        args: {
          ...base,
          level: "ad",
          sort: "amount_spent_descending",
          limit: 100,
          fields: ["amount_spent", "impressions", "reach", "frequency", "website_ctr", "cpm", "omni_purchase", "omni_purchase_values", "omni_add_to_cart", "omni_initiated_checkout", "omni_landing_page_view", "video_thruplay_watched_actions", "video_p25_watched_actions", "creative_id"]
        }
      },
      {
        source: "meta",
        tool: "meta.ads_get_creatives",
        save_as: `meta-creatives${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`,
        normalize: { fn: "none" },
        para: "Creativos \xB7 miniaturas de la galer\xEDa",
        args: { ad_account_id: `act_${acct}`, fields: ["id", "name", "thumbnail_url", "object_type"] },
        args_from: { file: `meta-ads${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`, campo: "creative_id", como: "creative_ids", max: 50 }
      },
      {
        source: "meta",
        tool: "meta.ads_get_opportunity_score",
        save_as: `meta-opportunity${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`,
        normalize: { fn: "none" },
        para: "Creativos \xB7 lo que Meta recomienda",
        args: { ad_account_id: `act_${acct}` }
      }
    );
  }
  const kl = f.klaviyo;
  if (kl?.metrica_compra) {
    const tz = config2.zona_horaria;
    const filter = [`greater-or-equal(datetime,${utcOffsetIso(tz, date_from)})`, `less-than(datetime,${utcOffsetIso(tz, addDays2(date_to, 1))})`];
    const body = (metric_id, measurements, by, interval) => JSON.stringify({ data: { type: "metric-aggregate", attributes: { metric_id, measurements, interval, by, filter, timezone: tz } } });
    const cur = config2.tiendas[0]?.moneda ?? config2.moneda_reporte;
    steps.push(
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-orders-by-flow.json",
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "flow", currency: cur, also: [{ metric: "pedidos_email", measurement: "count" }] },
        para: "Email \xB7 flows",
        args: { model: "claude", body: body(kl.metrica_compra, ["sum_value", "count"], ["$attributed_flow"], "month") }
      },
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-orders-by-message.json",
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "message", currency: cur, also: [{ metric: "pedidos_email", measurement: "count" }] },
        para: "Email \xB7 campa\xF1as",
        args: { model: "claude", body: body(kl.metrica_compra, ["sum_value", "count"], ["$attributed_message"], "month") }
      }
    );
    const [eFrom, eTo] = previousPeriod(date_from, date_to);
    const filterAnt = [`greater-or-equal(datetime,${utcOffsetIso(tz, eFrom)})`, `less-than(datetime,${utcOffsetIso(tz, addDays2(eTo, 1))})`];
    const bodyAnt = (metric_id, by) => JSON.stringify({ data: { type: "metric-aggregate", attributes: { metric_id, measurements: ["sum_value", "count"], interval: "month", by, filter: filterAnt, timezone: tz } } });
    const ped = [{ metric: "pedidos_email", measurement: "count" }];
    steps.push(
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-flows-daily.json",
        serie: true,
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "flow", currency: cur, perBucket: true, also: ped },
        para: "Email \xB7 venta de flows por d\xEDa",
        args: { model: "claude", body: body(kl.metrica_compra, ["sum_value", "count"], ["$attributed_flow"], "day") }
      },
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-messages-daily.json",
        serie: true,
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "message", currency: cur, perBucket: true, also: ped },
        para: "Email \xB7 venta de campa\xF1as por d\xEDa",
        args: { model: "claude", body: body(kl.metrica_compra, ["sum_value", "count"], ["$attributed_message"], "day") }
      },
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-flows-prev.json",
        serie: true,
        window: { date_from: eFrom, date_to: eTo },
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "flow", currency: cur, also: ped },
        para: "Email \xB7 flows del per\xEDodo de comparaci\xF3n",
        args: { model: "claude", body: bodyAnt(kl.metrica_compra, ["$attributed_flow"]) }
      },
      {
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-messages-prev.json",
        serie: true,
        window: { date_from: eFrom, date_to: eTo },
        normalize: { fn: "klaviyo", metric: "ingreso_email", measurement: "sum_value", level: "message", currency: cur, also: ped },
        para: "Email \xB7 campa\xF1as del per\xEDodo de comparaci\xF3n",
        args: { model: "claude", body: bodyAnt(kl.metrica_compra, ["$attributed_message"]) }
      },
      {
        source: "klaviyo",
        tool: "klaviyo.get_campaigns",
        save_as: "klaviyo-campaigns-prev.json",
        normalize: { fn: "none" },
        para: "Email \xB7 nombres de las campa\xF1as del per\xEDodo de comparaci\xF3n",
        args: { model: "claude", filter: `and(equals(messages.channel,'email'),greater-or-equal(scheduled_at,${eFrom}T00:00:00Z),less-than(scheduled_at,${date_from}T00:00:00Z))` }
      }
    );
    steps.push(
      { source: "klaviyo", tool: "klaviyo.get_flows", save_as: "klaviyo-flows.json", normalize: { fn: "none" }, para: "Email \xB7 nombres y estado de los flows", args: { model: "claude" } },
      {
        source: "klaviyo",
        tool: "klaviyo.get_campaigns",
        save_as: "klaviyo-campaigns.json",
        normalize: { fn: "none" },
        para: "Email \xB7 nombres de las campa\xF1as",
        args: { model: "claude", filter: `and(equals(messages.channel,'email'),greater-or-equal(scheduled_at,${date_from}T00:00:00Z))` }
      }
    );
    if (kl.metrica_alta) {
      steps.push({
        source: "klaviyo",
        tool: "klaviyo.query_metric_aggregates",
        save_as: "klaviyo-subscriptions-weekly.json",
        normalize: { fn: "klaviyo", metric: "altas_lista", measurement: "count", level: "list", perBucket: true },
        para: "Email \xB7 salud de la captura (S-EMAIL-01)",
        args: { model: "claude", body: body(kl.metrica_alta, ["count"], ["List"], "week") }
      });
    }
  }
  const comp = config2.competencia;
  for (const t of comp?.terminos ?? []) {
    steps.push({
      source: "meta",
      tool: "meta.ads_library_search",
      save_as: `meta-library-${slug(t)}.json`,
      normalize: { fn: "none" },
      top: 25,
      para: `Competencia \xB7 anunciantes activos por "${t}"`,
      args: { search_terms: t, countries: [comp.pais], ad_active_status: "ACTIVE", limit: 25 }
    });
  }
  const pageIds = config2.competidores.map((c) => c.pagina_meta).filter((x) => !!x && /^\d+$/.test(x));
  if (pageIds.length && comp) {
    steps.push({
      source: "meta",
      tool: "meta.ads_library_search",
      save_as: "meta-library-competidores.json",
      normalize: { fn: "none" },
      top: 50,
      para: "Competencia \xB7 anuncios activos de los competidores seguidos",
      args: { page_ids: pageIds, countries: [comp.pais], ad_active_status: "ACTIVE", limit: 50 }
    });
  }
  const ev = activeEvent(config2, date_to);
  const shop = config2.tiendas.find((x) => x.plataforma === "shopify");
  if (ev && shop) {
    const hastaEv = ev.hasta;
    const finVentana = date_to < hastaEv ? date_to : hastaEv;
    const q = (desde, hasta, by) => `FROM sales SHOW total_sales, orders GROUP BY ${by} SINCE ${desde} UNTIL ${hasta}`;
    if (ev.referencia)
      steps.push({
        source: "shopify",
        tool: "shopify.run-analytics-query",
        save_as: "wr-referencia-diaria.json",
        serie: true,
        normalize: { fn: "shopifyql", currency: shop.moneda },
        para: `War Room \xB7 ${ev.referencia.nombre} d\xEDa a d\xEDa (forma de la curva)`,
        args: { query: q(ev.referencia.desde, ev.referencia.hasta, "day") }
      });
    if (date_to >= ev.desde) {
      steps.push(
        {
          source: "shopify",
          tool: "shopify.run-analytics-query",
          save_as: "wr-evento-diario.json",
          serie: true,
          normalize: { fn: "shopifyql", currency: shop.moneda },
          para: `War Room \xB7 ${ev.nombre} d\xEDa a d\xEDa`,
          args: { query: q(ev.desde, finVentana, "day") }
        },
        {
          source: "shopify",
          tool: "shopify.run-analytics-query",
          save_as: "wr-hoy-por-hora.json",
          serie: true,
          normalize: { fn: "shopifyql", currency: shop.moneda },
          para: "War Room \xB7 hoy por hora",
          args: { query: q(date_to, date_to, "hour") }
        }
      );
      const finPrevio = addDays2(date_from, -1) < finVentana ? addDays2(date_from, -1) : finVentana;
      if (ev.desde <= finPrevio) for (const acct of f.meta?.cuentas ?? [])
        steps.push({
          source: "meta",
          tool: "meta.ads_get_ad_entities",
          save_as: `wr-meta-diario-${acct}.json`,
          serie: true,
          normalize: { fn: "meta", level: "account" },
          para: "War Room \xB7 inversi\xF3n Meta por d\xEDa",
          args: { ad_account_id: `act_${acct}`, level: "account", time_increment: 1, time_range: { since: ev.desde, until: finPrevio }, fields: ["amount_spent", "omni_purchase", "omni_purchase_values"] }
        });
      if (ev.referencia)
        steps.push({
          source: "shopify",
          tool: "shopify.run-analytics-query",
          save_as: "wr-referencia-horaria.json",
          serie: true,
          normalize: { fn: "shopifyql", currency: shop.moneda },
          para: `War Room \xB7 ${ev.referencia.nombre} hora a hora (comparar el d\xEDa en curso)`,
          args: { query: q(ev.referencia.desde, ev.referencia.hasta, "hour") }
        });
      const finGoogle = addDays2(date_from, -1) < finVentana ? addDays2(date_from, -1) : finVentana;
      if (ev.desde <= finGoogle) for (const customer_id of f.google_ads?.cuentas ?? [])
        steps.push({
          source: "google_ads",
          tool: "google_ads.search",
          save_as: `wr-google-diario-${customer_id}.json`,
          serie: true,
          normalize: { fn: "gaql", resource: "customer", currency: f.google_ads.moneda ?? config2.moneda_reporte },
          para: "War Room \xB7 inversi\xF3n Google por d\xEDa",
          args: { customer_id, resource: "customer", fields: ["segments.date", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"], conditions: [`segments.date BETWEEN '${ev.desde}' AND '${finGoogle}'`], orderings: ["segments.date ASC"] }
        });
    }
  }
  if (f.clarity) {
    const cFrom = addDays2(date_to, -2);
    steps.push({
      source: "clarity",
      tool: "clarity.query-analytics-dashboard",
      save_as: "clarity-device.json",
      normalize: { fn: "clarity_device" },
      para: "Conversi\xF3n y CRO \xB7 comportamiento",
      window: { date_from: cFrom, date_to },
      args: { query: `Rage clicks, dead clicks, excessive scrolling, quick backs and scroll depth by device from ${cFrom} to ${date_to}` }
    });
  }
  return steps;
}

// src/core/kpis.ts
var STORE_SOURCES = ["shopify", "tiendanube"];
var AD_SOURCES = ["meta", "google_ads"];
function sum(rows, config2, filter, rates = []) {
  const hit = rows.filter(filter);
  if (hit.length === 0) return null;
  return hit.reduce((acc, r) => acc + (r.currency ? toReport(config2, r.value, r.currency, r.date_to, rates) : r.value), 0);
}
var storeTotal = (metric) => (r) => STORE_SOURCES.includes(r.source) && r.metric === metric && r.level === "store";
function businessKpis(rows, config2, rates = []) {
  const ventas_total = sum(rows, config2, storeTotal("ventas_total"), rates);
  const ventas_brutas = sum(rows, config2, storeTotal("ventas_brutas"), rates);
  const descuentos = sum(rows, config2, storeTotal("descuentos"), rates);
  const pedidos = sum(rows, config2, storeTotal("pedidos"), rates);
  const incompleto = [];
  const gasto_por_fuente = {};
  for (const src of AD_SOURCES) {
    if (!config2.fuentes[src]) continue;
    const acct = sum(rows, config2, (r) => r.source === src && r.metric === "gasto" && r.level === "account", rates);
    const camp = acct === null ? sum(rows, config2, (r) => r.source === src && r.metric === "gasto" && r.level === "campaign", rates) : null;
    const g = acct ?? camp;
    if (g === null) incompleto.push(src);
    else gasto_por_fuente[src] = g;
  }
  const gastos = Object.values(gasto_por_fuente);
  const gasto_ads = gastos.length ? gastos.reduce((a, b) => a + b, 0) : null;
  const compras_ga4 = sum(rows, config2, (r) => r.source === "ga4" && r.metric === "compras_ga4" && r.level === "account", rates);
  const clientes_nuevos = sum(rows, config2, storeTotal("clientes_nuevos"), rates);
  return {
    ventas_total,
    ventas_brutas,
    descuentos,
    descuentos_pct: safeDiv(descuentos, ventas_brutas),
    pedidos,
    // Mismo criterio que Shopify: (bruta − descuentos) ÷ pedidos. Así el cliente ve el mismo número en ambos lados.
    aov: ventas_brutas !== null && descuentos !== null ? safeDiv(ventas_brutas - descuentos, pedidos) : null,
    clientes_nuevos,
    clientes_recurrentes: sum(rows, config2, storeTotal("clientes_recurrentes"), rates),
    gasto_ads,
    gasto_por_fuente,
    mer: incompleto.length ? null : safeDiv(ventas_total, gasto_ads),
    cac_nuevo: incompleto.length ? null : safeDiv(gasto_ads, clientes_nuevos),
    captura_tracking: safeDiv(compras_ga4, pedidos),
    incompleto
  };
}
function funnelByDevice(rows) {
  const metrics = ["sesiones", "sesiones_carrito", "sesiones_checkout", "sesiones_compra"];
  const pasos = ["visitas", "carrito", "checkout", "compra"];
  const devices = new Set(rows.filter((r) => r.source === "shopify" && r.level === "device" && r.metric === "sesiones").map((r) => r.entity_id));
  const out = {};
  for (const d2 of devices) {
    const vals = metrics.map((m) => rows.find((r) => r.source === "shopify" && r.level === "device" && r.entity_id === d2 && r.metric === m)?.value ?? null);
    if (vals.some((v2) => v2 === null)) continue;
    const v = vals;
    out[d2] = pasos.map((paso, i) => ({
      paso,
      valor: v[i],
      tasa_vs_anterior: i === 0 ? null : safeDiv(v[i], v[i - 1]),
      tasa_vs_inicio: i === 0 ? null : safeDiv(v[i], v[0])
    }));
  }
  return out;
}
function reconciliation(rows, config2, rates = []) {
  const k = businessKpis(rows, config2, rates);
  const platform = (src, level) => ({
    pedidos: sum(rows, config2, (r) => r.source === src && r.metric === "compras_plataforma" && r.level === level, rates),
    ingresos: sum(rows, config2, (r) => r.source === src && r.metric === "valor_compras_plataforma" && r.level === level, rates)
  });
  const ga4p = sum(rows, config2, (r) => r.source === "ga4" && r.metric === "compras_ga4" && r.level === "account", rates);
  const ga4i = sum(rows, config2, (r) => r.source === "ga4" && r.metric === "ingresos_ga4" && r.level === "account", rates);
  const meta = platform("meta", "account");
  const gads = platform("google_ads", "campaign");
  return [
    { fuente: "tienda", pedidos: k.pedidos, ingresos: k.ventas_total, vs_tienda_pedidos: null, nota: "Fuente de verdad" },
    { fuente: "ga4", pedidos: ga4p, ingresos: ga4i, vs_tienda_pedidos: safeDiv(ga4p, k.pedidos), nota: "\xDAltimo clic; mide la captura de tracking" },
    { fuente: "google_ads", pedidos: gads.pedidos, ingresos: gads.ingresos, vs_tienda_pedidos: safeDiv(gads.pedidos, k.pedidos), nota: "Seg\xFAn su atribuci\xF3n" },
    { fuente: "meta", pedidos: meta.pedidos, ingresos: meta.ingresos, vs_tienda_pedidos: safeDiv(meta.pedidos, k.pedidos), nota: "Seg\xFAn su atribuci\xF3n" }
  ];
}

// src/normalizers/index.ts
function row(ctx, source, metric, level, entity_id, value, extra = {}) {
  if (value === null) return null;
  return { client: ctx.client, source, metric, level, entity_id, date_from: ctx.date_from, date_to: ctx.date_to, value, ...extra };
}
var compact = (rows) => rows.filter((r) => r !== null);
function monthRange(v) {
  const ym = /^\d{6}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}` : v.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { date_from: `${ym}-01`, date_to: `${ym}-${String(last).padStart(2, "0")}` };
}
var clip = (r, ctx) => ({
  date_from: r.date_from < ctx.date_from ? ctx.date_from : r.date_from,
  date_to: r.date_to > ctx.date_to ? ctx.date_to : r.date_to
});
var SHOPIFY_SALES_MAP = {
  total_sales: { metric: "ventas_total" },
  net_sales: { metric: "ventas_netas" },
  gross_sales: { metric: "ventas_brutas" },
  discounts: { metric: "descuentos", abs: true },
  returns: { metric: "devoluciones", abs: true },
  orders: { metric: "pedidos" },
  average_order_value: { metric: "aov" },
  new_customers: { metric: "clientes_nuevos" },
  returning_customers: { metric: "clientes_recurrentes" },
  sessions: { metric: "sesiones" },
  sessions_with_cart_additions: { metric: "sesiones_carrito" },
  sessions_that_reached_checkout: { metric: "sesiones_checkout" },
  sessions_that_completed_checkout: { metric: "sesiones_compra" }
};
function normalizeShopifyQL(raw, ctx, currency) {
  const cols = raw.columns.map((c) => c.name);
  const timeCol = cols.find((c) => ["month", "day", "week", "hour"].includes(c));
  const groupCol = cols.find((c) => ["session_device_type", "product_title"].includes(c));
  const level = groupCol === "session_device_type" ? "device" : groupCol === "product_title" ? "product" : "store";
  const out = [];
  for (const r of raw.rows) {
    const entity = groupCol ? String(r[cols.indexOf(groupCol)] ?? "") : "";
    if (groupCol && entity === "") continue;
    const t = timeCol ? String(r[cols.indexOf(timeCol)] ?? "") : "";
    const rctx = timeCol === "month" ? { ...ctx, ...clip(monthRange(t), ctx) } : timeCol === "hour" ? ctx : timeCol ? { ...ctx, date_from: t.slice(0, 10), date_to: t.slice(0, 10) } : ctx;
    const hourDims = timeCol === "hour" ? { dims: { hora: t } } : {};
    cols.forEach((name, i) => {
      const map = SHOPIFY_SALES_MAP[name];
      if (!map) return;
      let v = toNumber(r[i]);
      if (v !== null && map.abs) v = Math.abs(v);
      const type = raw.columns[i]?.dataType;
      out.push(row(rctx, "shopify", map.metric, level, entity, v, { ...type === "MONEY" ? { currency } : {}, ...hourDims }));
    });
  }
  return compact(out);
}
var GAQL_METRICS = {
  "metrics.cost_micros": { metric: "gasto", micros: true, money: true },
  "metrics.impressions": { metric: "impresiones" },
  "metrics.clicks": { metric: "clics" },
  "metrics.conversions": { metric: "compras_plataforma" },
  "metrics.conversions_value": { metric: "valor_compras_plataforma", money: true },
  "metrics.search_impression_share": { metric: "cuota_impr" },
  "metrics.search_budget_lost_impression_share": { metric: "cuota_perdida_ppto" },
  "metrics.search_rank_lost_impression_share": { metric: "cuota_perdida_rank" },
  "metrics.search_top_impression_share": { metric: "cuota_superior" },
  "ad_group_criterion.quality_info.quality_score": { metric: "quality_score" }
};
var GAQL_ENTITY = {
  customer: { level: "account", id: () => "" },
  campaign: { level: "campaign", id: (r) => String(r["campaign.name"] ?? ""), dims: ["campaign.advertising_channel_type"] },
  keyword_view: {
    level: "keyword",
    id: (r) => `${r["ad_group_criterion.keyword.text"]}|${r["ad_group_criterion.keyword.match_type"]}`,
    dims: ["ad_group_criterion.keyword.match_type", "campaign.name"]
  },
  asset_group: { level: "asset_group", id: (r) => `${r["campaign.name"]}|${r["asset_group.name"]}`, dims: ["campaign.name"] },
  shopping_performance_view: { level: "product", id: (r) => String(r["segments.product_title"] ?? "") },
  search_term_view: { level: "search_term", id: (r) => String(r["search_term_view.search_term"] ?? ""), dims: ["campaign.name"] }
};
function normalizeGaql(raw, ctx, resource, currency) {
  const spec = GAQL_ENTITY[resource];
  const out = [];
  for (const r of raw.result) {
    const cost = fromMicros(r["metrics.cost_micros"]) ?? 0;
    const impr = toNumber(r["metrics.impressions"]) ?? 0;
    if (cost === 0 && impr === 0) continue;
    const id = spec.id(r);
    const month = r["segments.month"];
    const day = r["segments.date"];
    const rctx = month ? { ...ctx, ...clip(monthRange(String(month)), ctx) } : day ? { ...ctx, date_from: String(day), date_to: String(day) } : ctx;
    const name = String(r["asset_group.name"] ?? r["ad_group_criterion.keyword.text"] ?? r["segments.product_title"] ?? r["search_term_view.search_term"] ?? r["campaign.name"] ?? id);
    const dims = spec.dims ? Object.fromEntries(spec.dims.filter((d2) => r[d2] !== void 0).map((d2) => [d2.split(".").pop(), String(r[d2])])) : void 0;
    for (const [field, map] of Object.entries(GAQL_METRICS)) {
      if (!(field in r)) continue;
      const v = map.micros ? fromMicros(r[field]) : toNumber(r[field]);
      out.push(row(rctx, "google_ads", map.metric, spec.level, id, v, { entity_name: name, dims, ...map.money ? { currency } : {} }));
    }
  }
  return compact(out);
}
var GA4_MAP = {
  sessions: "sesiones",
  newUsers: "usuarios_nuevos",
  engagementRate: "engagement",
  "keyEvents:purchase": "compras_ga4",
  ecommercePurchases: "compras_ga4",
  purchaseRevenue: "ingresos_ga4",
  addToCarts: "carritos_ga4",
  checkouts: "checkouts_ga4",
  sessionKeyEventRate: "tasa_conversion",
  "sessionKeyEventRate:purchase": "tasa_conversion",
  screenPageViewsPerSession: "paginas_sesion",
  averageSessionDuration: "duracion_media"
};
var GA4_TIME = /* @__PURE__ */ new Set(["yearMonth", "date"]);
var GA4_LEVEL = {
  sessionDefaultChannelGroup: "channel",
  sessionSourceMedium: "source_medium",
  landingPage: "page",
  pagePath: "page",
  deviceCategory: "device",
  itemName: "product"
};
function normalizeGa4(raw, ctx, currency) {
  const dims = (raw.dimension_headers ?? []).map((d2) => d2.name);
  const timeIdx = dims.findIndex((d2) => GA4_TIME.has(d2));
  const entityDims = dims.filter((d2) => !GA4_TIME.has(d2));
  const level = entityDims.length === 0 ? "account" : GA4_LEVEL[entityDims[0]];
  if (!level) throw new Error(`GA4: dimensi\xF3n "${entityDims[0]}" sin nivel definido en GA4_LEVEL`);
  const out = [];
  for (const r of raw.rows) {
    const all = (r.dimension_values ?? []).map((d2) => d2.value);
    const t = timeIdx >= 0 ? all[timeIdx] : "";
    const day = (x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
    const rctx = !t ? ctx : dims[timeIdx] === "yearMonth" ? { ...ctx, ...clip(monthRange(t), ctx) } : { ...ctx, date_from: day(t), date_to: day(t) };
    const dv = all.filter((_, i) => i !== timeIdx);
    const entity = level === "account" ? "" : dv[0] ?? "";
    const extraDims = entityDims.length > 1 ? Object.fromEntries(entityDims.slice(1).map((d2, i) => [d2, dv[i + 1] ?? ""])) : void 0;
    raw.metric_headers.forEach((m, i) => {
      const metric = GA4_MAP[m.name];
      if (!metric) return;
      const v = toNumber(r.metric_values[i]?.value);
      out.push(row(rctx, "ga4", metric, level, entity, v, { dims: extraDims, ...metric === "ingresos_ga4" ? { currency } : {} }));
    });
  }
  return compact(out);
}
function normalizeGscTsv(raw, ctx) {
  const lines = raw.result.split("\n").filter((l) => l && !l.startsWith("#"));
  const header = lines.shift()?.split("	") ?? [];
  const metricCols = { clicks: "clics", impressions: "impresiones", ctr: "ctr", position: "posicion" };
  const hasDate = header.includes("date");
  const dimCols = header.filter((h) => !(h in metricCols) && h !== "date");
  const level = dimCols.length === 0 ? "account" : dimCols[0] === "page" ? "page" : dimCols[0] === "device" ? "device" : "query";
  const out = [];
  for (const line of lines) {
    const cells = line.split("	");
    const get = (h) => cells[header.indexOf(h)];
    const entity = dimCols.length ? get(dimCols[0]) ?? "" : "";
    const dims = dimCols.length > 1 ? Object.fromEntries(dimCols.slice(1).map((d3) => [d3, get(d3) ?? ""])) : void 0;
    const d2 = hasDate ? get("date") ?? "" : "";
    const rctx = d2 ? { ...ctx, date_from: d2.slice(0, 10), date_to: d2.slice(0, 10) } : ctx;
    for (const [col, metric] of Object.entries(metricCols)) {
      if (!header.includes(col)) continue;
      out.push(row(rctx, "gsc", metric, level, entity, toNumber(get(col)), { dims }));
    }
  }
  return compact(out);
}
function normalizeGscOverview(raw, ctx) {
  const c = raw.current;
  return compact([
    row(ctx, "gsc", "clics", "account", "", c.clicks),
    row(ctx, "gsc", "impresiones", "account", "", c.impressions),
    row(ctx, "gsc", "ctr", "account", "", c.ctr),
    row(ctx, "gsc", "posicion", "account", "", c.position)
  ]);
}
function normalizeMetaEntities(raw, ctx, level) {
  const list = typeof raw.ad_entities === "string" ? JSON.parse(raw.ad_entities) : raw.ad_entities;
  const out = [];
  for (const e of list) {
    const id = level === "account" ? "" : String(e.id ?? "");
    const rctx = e.date_start ? { ...ctx, date_from: String(e.date_start), date_to: String(e.date_stop ?? e.date_start) } : ctx;
    const extra = { entity_name: String(e.name ?? ""), ...e.creative_id ? { dims: { creative_id: String(e.creative_id) } } : {} };
    const spent = fromMetaMoney(e.amount_spent);
    out.push(row(rctx, "meta", "gasto", level, id, spent?.amount ?? null, { ...extra, currency: spent?.currency }));
    out.push(row(rctx, "meta", "compras_plataforma", level, id, toNumber(e.omni_purchase), extra));
    const val = fromMetaMoney(e.omni_purchase_values);
    out.push(row(rctx, "meta", "valor_compras_plataforma", level, id, val?.amount ?? null, { ...extra, currency: val?.currency }));
    out.push(row(rctx, "meta", "impresiones", level, id, toNumber(e.impressions), extra));
    out.push(row(rctx, "meta", "alcance", level, id, toNumber(e.reach), extra));
    out.push(row(rctx, "meta", "frecuencia", level, id, toNumber(e.frequency), extra));
    const ctrLink = toNumber(e.website_ctr);
    out.push(row(rctx, "meta", "ctr", level, id, ctrLink !== null ? ctrLink / 100 : toNumber(e.ctr), extra));
    const cpm = fromMetaMoney(e.cpm);
    out.push(row(rctx, "meta", "cpm", level, id, cpm?.amount ?? null, { ...extra, currency: cpm?.currency }));
    out.push(row(rctx, "meta", "vistas_landing", level, id, toNumber(e.omni_landing_page_view), extra));
    out.push(row(rctx, "meta", "carritos_plataforma", level, id, toNumber(e.omni_add_to_cart), extra));
    out.push(row(rctx, "meta", "checkouts_plataforma", level, id, toNumber(e.omni_initiated_checkout), extra));
    out.push(row(rctx, "meta", "thruplay", level, id, toNumber(e.video_thruplay_watched_actions), extra));
    out.push(row(rctx, "meta", "video_p25", level, id, toNumber(e.video_p25_watched_actions), extra));
    out.push(row(rctx, "meta", "video_3s", level, id, toNumber(e["3_second_video_plays"]), extra));
  }
  return compact(out);
}
function normalizeKlaviyoAggregate(raw, ctx, opts) {
  const body = "result" in raw ? raw.result : raw;
  const { dates, data } = body.data.attributes;
  const money2 = opts.currency ? { currency: opts.currency } : {};
  const out = [];
  for (const d2 of data) {
    const entity = d2.dimensions[0] ?? "";
    const metric = entity === "" ? `${opts.metric}_no_atribuido` : opts.metric;
    const level = entity === "" ? "account" : opts.level;
    const series = d2.measurements[opts.measurement] ?? [];
    if (opts.perBucket) {
      series.forEach((v, i) => {
        const from = dates[i].slice(0, 10);
        const to = dates[i + 1] ? addDays3(dates[i + 1].slice(0, 10), -1) : ctx.date_to;
        out.push(row({ ...ctx, date_from: from, date_to: to }, "klaviyo", metric, level, entity, Number.isFinite(v) ? v : null, money2));
      });
    } else {
      const total = series.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      out.push(row(ctx, "klaviyo", metric, level, entity, total, money2));
    }
  }
  return compact(out);
}
function addDays3(isoDate, days) {
  const d2 = /* @__PURE__ */ new Date(`${isoDate}T12:00:00Z`);
  d2.setUTCDate(d2.getUTCDate() + days);
  return d2.toISOString().slice(0, 10);
}
var CLARITY_MAP = {
  AvgRageClicks: { metric: "rage_clicks" },
  AvgDeadClicks: { metric: "dead_clicks" },
  AvgQuickBacks: { metric: "quick_backs" },
  AvgScrollDepthPercent: { metric: "scroll_medio", pct: true }
};
function normalizeClarityByDevice(raw, ctx) {
  const out = [];
  for (const d2 of raw.data) {
    const device = String(d2.Device ?? "").toLowerCase().replace("pc", "desktop");
    for (const [k, map] of Object.entries(CLARITY_MAP)) {
      const v = toNumber(d2[k]);
      out.push(row(ctx, "clarity", map.metric, "device", device, v === null ? null : map.pct ? v / 100 : v));
    }
  }
  return compact(out);
}

// src/capture/ingest.ts
function truncation(step, raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.pagination?.next_cursor) {
    const list = typeof raw.ad_entities === "string" ? JSON.parse(raw.ad_entities) : raw.ad_entities;
    return { received: Array.isArray(list) ? list.length : 0 };
  }
  if (typeof raw.result === "string" && /has_more=true/.test(raw.result)) {
    const m = raw.result.match(/rows=(\d+)/);
    return { received: m ? Number(m[1]) : 0 };
  }
  if (Array.isArray(raw.result) && typeof step.args.limit === "number" && raw.result.length >= step.args.limit) return { received: raw.result.length };
  if (Array.isArray(raw.rows) && typeof raw.row_count === "number" && raw.row_count > raw.rows.length) return { received: raw.rows.length, total: raw.row_count };
  const next = raw.result?.links?.next ?? raw.links?.next;
  if (next) return { received: -1 };
  return null;
}
function normalizeStep(step, raw, ctx) {
  const n = step.normalize;
  switch (n.fn) {
    case "shopifyql":
      return normalizeShopifyQL(raw, ctx, n.currency);
    case "gaql":
      return normalizeGaql(raw, ctx, n.resource, n.currency);
    case "ga4":
      return normalizeGa4(raw, ctx, n.currency);
    case "gsc_overview":
      return normalizeGscOverview(raw, ctx);
    case "gsc_tsv":
      return normalizeGscTsv(raw, ctx);
    case "meta":
      return normalizeMetaEntities(raw, ctx, n.level);
    case "klaviyo":
      return [
        ...normalizeKlaviyoAggregate(raw, ctx, n),
        ...(n.also ?? []).flatMap((a) => normalizeKlaviyoAggregate(raw, ctx, { ...n, metric: a.metric, measurement: a.measurement, currency: void 0 }))
      ];
    case "clarity_device":
      return normalizeClarityByDevice(raw, ctx);
    case "none":
      return [];
  }
}
function ingest(config2, plan, read, date_from, date_to, capturedAt, rates = []) {
  const rows = [];
  const series = [];
  const missing = [];
  const errors = /* @__PURE__ */ new Map();
  const notes = /* @__PURE__ */ new Map();
  const note = (src, msg) => notes.set(src, [...notes.get(src) ?? [], msg]);
  const ok = /* @__PURE__ */ new Set();
  for (const step of plan) {
    const raw = read(step.save_as);
    if (raw === void 0) {
      missing.push(step.save_as);
      errors.set(step.source, [...errors.get(step.source) ?? [], `falta ${step.save_as}`]);
      continue;
    }
    const ctx = { client: config2.cliente, date_from: step.window?.date_from ?? date_from, date_to: step.window?.date_to ?? date_to };
    const cut = truncation(step, raw);
    if (cut) {
      const de = cut.total ? ` de ${cut.total}` : "";
      if (step.top) note(step.source, `${step.save_as}: top ${cut.received}${de} (ranking intencional)`);
      else errors.set(step.source, [...errors.get(step.source) ?? [], `${step.save_as}: respuesta INCOMPLETA (${cut.received}${de} filas); falta paginar`]);
    }
    try {
      (step.serie ? series : rows).push(...normalizeStep(step, raw, ctx));
      ok.add(step.source);
    } catch (e) {
      errors.set(step.source, [...errors.get(step.source) ?? [], `${step.save_as}: ${e.message}`]);
    }
  }
  const sources = [...new Set(plan.map((s) => s.source))];
  const health = sources.map((source) => {
    const err = errors.get(source);
    return {
      client: config2.cliente,
      source,
      last_success: ok.has(source) ? capturedAt : null,
      data_until: ok.has(source) ? date_to : null,
      error: err ? err.join(" \xB7 ") : null,
      ...notes.get(source) ? { notes: notes.get(source) } : {}
    };
  });
  return {
    rows,
    series,
    kpis: businessKpis(rows, config2, rates),
    funnel: funnelByDevice(rows),
    reconciliation: reconciliation(rows, config2, rates),
    health,
    missing
  };
}

// src/capture/raw.ts
function toRaw(content) {
  let v = content;
  try {
    v = JSON.parse(content);
  } catch {
  }
  if (Array.isArray(v) && v.every((b) => b && typeof b === "object" && b.type === "text")) v = v.map((b) => b.text).join("");
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return { result: v };
    }
  }
  return v;
}

// src/capture/history.ts
function monthsBack(until, months) {
  const d2 = /* @__PURE__ */ new Date(`${until.slice(0, 7)}-01T12:00:00Z`);
  d2.setUTCMonth(d2.getUTCMonth() - (months - 1));
  return d2.toISOString().slice(0, 10);
}
function buildHistoryPlan(config2, until, months = 13) {
  const from = monthsBack(until, months);
  const f = config2.fuentes;
  const steps = [];
  for (const t of config2.tiendas.filter((x) => x.plataforma === "shopify")) {
    steps.push({
      source: "shopify",
      tool: "shopify.run-analytics-query",
      save_as: "history-shopify-monthly.json",
      normalize: { fn: "shopifyql", currency: t.moneda },
      para: "Historia \xB7 ventas mensuales",
      args: { query: `FROM sales SHOW total_sales, gross_sales, discounts, orders, new_customers, returning_customers GROUP BY month SINCE ${from} UNTIL ${until}` }
    });
  }
  const gads = f.google_ads;
  for (const customer_id of gads?.cuentas ?? []) {
    steps.push({
      source: "google_ads",
      tool: "google_ads.search",
      save_as: `history-google-ads-monthly${gads.cuentas.length > 1 ? `-${customer_id}` : ""}.json`,
      normalize: { fn: "gaql", resource: "customer", currency: gads?.moneda ?? config2.moneda_reporte },
      para: "Historia \xB7 inversi\xF3n Google mensual",
      args: {
        customer_id,
        resource: "customer",
        fields: ["segments.month", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value", "metrics.clicks", "metrics.impressions"],
        conditions: [`segments.date BETWEEN '${from}' AND '${until}'`],
        orderings: ["segments.month ASC"]
      }
    });
  }
  const ga4 = f.ga4;
  if (ga4?.propiedad) {
    steps.push({
      source: "ga4",
      tool: "ga4.run_report",
      save_as: "history-ga4-monthly.json",
      normalize: { fn: "ga4", currency: config2.moneda_reporte },
      para: "Historia \xB7 tr\xE1fico y captura de tracking",
      args: {
        property_id: ga4.propiedad,
        date_ranges: [{ start_date: from, end_date: until }],
        dimensions: ["yearMonth"],
        metrics: ["sessions", "ecommercePurchases", "purchaseRevenue", "engagementRate"],
        currency_code: config2.moneda_reporte,
        order_bys: [{ dimension: { dimension_name: "yearMonth" } }]
      }
    });
  }
  const meta = f.meta;
  for (const acct of meta?.cuentas ?? []) {
    steps.push({
      source: "meta",
      tool: "meta.ads_get_ad_entities",
      save_as: `history-meta-monthly${meta.cuentas.length > 1 ? `-${acct}` : ""}.json`,
      normalize: { fn: "meta", level: "account" },
      para: "Historia \xB7 inversi\xF3n Meta mensual",
      args: { ad_account_id: `act_${acct}`, level: "account", time_increment: "monthly", time_range: { since: from, until }, fields: ["amount_spent", "impressions", "omni_purchase", "omni_purchase_values"] }
    });
  }
  return steps;
}

// src/core/series.ts
var lastDay = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
function monthlySeries(rows, config2, rates = []) {
  const months = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.date_from.slice(0, 7) !== r.date_to.slice(0, 7)) continue;
    const k = r.date_from.slice(0, 7);
    months.set(k, [...months.get(k) ?? [], r]);
  }
  const conv = (r) => r.currency ? toReport(config2, r.value, r.currency, r.date_to, rates) : r.value;
  const get = (list, f) => {
    const hit = list.filter(f);
    return hit.length ? hit.reduce((a, r) => a + conv(r), 0) : null;
  };
  const store = (m) => (r) => (r.source === "shopify" || r.source === "tiendanube") && r.level === "store" && r.metric === m;
  return [...months.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([mes, list]) => {
    const date_to = list.reduce((mx, r) => r.date_to > mx ? r.date_to : mx, "");
    const ventas = get(list, store("ventas_total"));
    const pedidos = get(list, store("pedidos"));
    const brutas = get(list, store("ventas_brutas"));
    const desc = get(list, store("descuentos"));
    const meta = config2.fuentes.meta ? get(list, (r) => r.source === "meta" && r.level === "account" && r.metric === "gasto") : null;
    const google = config2.fuentes.google_ads ? get(list, (r) => r.source === "google_ads" && r.level === "account" && r.metric === "gasto") : null;
    const faltaGasto = config2.fuentes.meta && meta === null || config2.fuentes.google_ads && google === null;
    const gasto = faltaGasto ? null : (meta ?? 0) + (google ?? 0);
    const comprasGa4 = get(list, (r) => r.source === "ga4" && r.level === "account" && r.metric === "compras_ga4");
    return {
      mes,
      date_from: `${mes}-01`,
      date_to,
      parcial: date_to < lastDay(mes),
      ventas_total: ventas,
      pedidos,
      clientes_nuevos: get(list, store("clientes_nuevos")),
      clientes_recurrentes: get(list, store("clientes_recurrentes")),
      descuentos_pct: safeDiv(desc, brutas),
      gasto_meta: meta,
      gasto_google: google,
      gasto_ads: gasto,
      mer: safeDiv(ventas, gasto),
      compras_ga4: comprasGa4,
      captura_tracking: safeDiv(comprasGa4, pedidos),
      sesiones_ga4: get(list, (r) => r.source === "ga4" && r.level === "account" && r.metric === "sesiones"),
      engagement_ga4: list.find((r) => r.source === "ga4" && r.level === "account" && r.metric === "engagement")?.value ?? null
    };
  });
}
function yearOverYear(series, mes, metrics) {
  const [y, m] = mes.split("-");
  const prevKey = `${Number(y) - 1}-${m}`;
  const cur = series.find((p) => p.mes === mes);
  const prev = series.find((p) => p.mes === prevKey);
  const ratios = /* @__PURE__ */ new Set(["mer", "captura_tracking", "descuentos_pct", "engagement_ga4"]);
  return metrics.map((metric) => {
    const a = cur ? cur[metric] : null;
    const b = prev ? prev[metric] : null;
    const partialMismatch = !!cur && !!prev && cur.parcial !== prev.parcial;
    const comparable = !!cur && !!prev && (ratios.has(metric) || !partialMismatch);
    return {
      metric,
      actual: a,
      anterior: b,
      variacion: comparable && a !== null && b !== null && b !== 0 ? a / b - 1 : null,
      comparable,
      ...partialMismatch && !ratios.has(metric) ? { nota: `Mes en curso parcial (hasta ${cur.date_to}) vs. ${prevKey} completo: capturar el mismo rango del a\xF1o anterior` } : {}
    };
  });
}
function bestMonth(series) {
  return series.filter((p) => p.ventas_total !== null).sort((a, b) => b.ventas_total - a.ventas_total)[0] ?? null;
}
function seriesAnomalies(series) {
  const out = [];
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const ses = series.filter((p) => p.sesiones_ga4 !== null && p.engagement_ga4 !== null);
  const mSes = median(ses.map((p) => p.sesiones_ga4));
  const mEng = median(ses.map((p) => p.engagement_ga4));
  const bots = ses.filter((p) => p.sesiones_ga4 > 3 * mSes && p.engagement_ga4 < 0.5 * mEng);
  if (bots.length) {
    out.push({
      tipo: "trafico_anomalo",
      meses: bots.map((p) => p.mes),
      detalle: bots.map((p) => `${p.mes}: ${p.sesiones_ga4.toLocaleString("es-CL")} sesiones con ${Math.round(p.engagement_ga4 * 100)}% de interacci\xF3n`).join(" \xB7 ") + ` (mediana: ${mSes.toLocaleString("es-CL")} sesiones, ${Math.round(mEng * 100)}%). Las m\xE9tricas por sesi\xF3n de esos meses no son confiables.`
    });
  }
  const cap = series.filter((p) => p.captura_tracking !== null);
  const bajos = cap.filter((p) => p.captura_tracking < 0.85);
  if (cap.length >= 6 && bajos.length / cap.length >= 0.75) {
    const prom = cap.reduce((a, p) => a + p.captura_tracking, 0) / cap.length;
    out.push({
      tipo: "captura_estructural",
      meses: bajos.map((p) => p.mes),
      detalle: `La anal\xEDtica registra en promedio ${Math.round(prom * 100)}% de los pedidos en ${cap.length} meses: es una brecha estructural del tracking, no un problema reciente.`
    });
  }
  return out;
}

// src/core/gads.ts
function nombresCortos(nombres) {
  const partes = nombres.map((n) => n.split("|").map((p) => p.trim()).filter(Boolean));
  const comunes = nombres.length > 1 ? new Set((partes[0] ?? []).filter((p) => partes.every((x) => x.includes(p)))) : /* @__PURE__ */ new Set();
  return Object.fromEntries(nombres.map((n, i) => {
    const resto = partes[i].filter((p) => !comunes.has(p));
    return [n, (resto.length ? resto : partes[i]).join(" \xB7 ").replace(/_+/g, " ").trim() || n];
  }));
}
function deCada(p) {
  const q = Math.round(p * 4);
  if (q > 0 && Math.abs(p - q / 4) <= 0.06) return q === 2 ? "la mitad" : `${q} de cada 4`;
  return `${Math.round(p * 10)} de cada 10`;
}
var empty = () => ({ gasto: 0, impresiones: 0, clics: 0, conversiones: 0, valor: 0, eleg: 0, ppto: 0, rank: 0, conCuota: false });
var div = (a, b) => b > 0 ? a / b : null;
function totales(a) {
  return {
    gasto: a.gasto,
    impresiones: a.impresiones,
    clics: a.clics,
    conversiones: a.conversiones,
    valor: a.valor,
    ctr: div(a.clics, a.impresiones),
    cpc: div(a.gasto, a.clics),
    cpa: div(a.gasto, a.conversiones),
    roas: div(a.valor, a.gasto),
    tasa_conv: div(a.conversiones, a.clics),
    // La cuota de impresiones se pondera por impresiones elegibles (impresiones ÷ cuota), como la calcula Google.
    cuota_impr: a.conCuota ? div(a.impresiones, a.eleg) : null,
    cuota_perdida_ppto: a.conCuota ? div(a.ppto, a.eleg) : null,
    cuota_perdida_rank: a.conCuota ? div(a.rank, a.eleg) : null
  };
}
function acumular(rows, key, conv) {
  const porFila = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = `${key(r)}\0${r.date_from}\0${r.date_to}`;
    if (!porFila.has(k)) porFila.set(k, /* @__PURE__ */ new Map());
    porFila.get(k).set(r.metric, r.currency ? conv(r) : r.value ?? 0);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, m] of porFila) {
    const g = k.split("\0")[0];
    if (!out.has(g)) out.set(g, empty());
    const a = out.get(g);
    const impr = m.get("impresiones") ?? 0;
    a.gasto += m.get("gasto") ?? 0;
    a.impresiones += impr;
    a.clics += m.get("clics") ?? 0;
    a.conversiones += m.get("compras_plataforma") ?? 0;
    a.valor += m.get("valor_compras_plataforma") ?? 0;
    const cuota = m.get("cuota_impr");
    if (cuota && cuota > 0 && impr > 0) {
      const eleg = impr / cuota;
      a.eleg += eleg;
      a.ppto += (m.get("cuota_perdida_ppto") ?? 0) * eleg;
      a.rank += (m.get("cuota_perdida_rank") ?? 0) * eleg;
      a.conCuota = true;
    }
  }
  return out;
}
var pct = (v, d2 = 0) => v === null ? "\u2014" : `${(v * 100).toLocaleString("es-CL", { maximumFractionDigits: d2 })}%`;
var money = (v, cur) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${v.toLocaleString("es-CL", { maximumFractionDigits: 2 })} ${cur}`;
var num = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
var fecha = (iso) => `${Number(iso.slice(8, 10))}-${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(iso.slice(5, 7)) - 1]}`;
var cambio2 = (a, b) => a === null || b === null || b === 0 ? null : a / b - 1;
var mitades = (dias, f) => {
  const h = Math.floor(dias.length / 2);
  const avg = (xs) => xs.length ? xs.reduce((s, d2) => s + f(d2), 0) / xs.length : 0;
  return [avg(dias.slice(0, h)), avg(dias.slice(h))];
};
function gadsDashboard(config2, series, desde, hasta, anterior, escenarios = [], economia) {
  const g = series.filter((r) => r.source === "google_ads");
  const conv = (r) => toReport(config2, r.value ?? 0, r.currency, r.date_to);
  const cur = config2.moneda_reporte;
  const diaria = (r) => r.date_from === r.date_to && r.date_from >= desde && r.date_from <= hasta;
  const cuentaDia = g.filter((r) => r.level === "account" && diaria(r));
  if (!cuentaDia.length) return null;
  const porDia = acumular(cuentaDia, (r) => r.date_from, conv);
  const dias = [...porDia.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([f, a]) => ({ fecha: f, ...totales(a) }));
  const actual = totales([...acumular(cuentaDia, () => "", conv).values()][0]);
  const esAnterior = (r) => !!anterior && r.date_from === anterior[0] && r.date_to === anterior[1];
  const antCuenta = g.filter((r) => r.level === "account" && esAnterior(r));
  const ant = antCuenta.length ? totales([...acumular(antCuenta, () => "", conv).values()][0]) : null;
  const campDia = g.filter((r) => r.level === "campaign" && diaria(r));
  const campAct = acumular(campDia, (r) => r.entity_id, conv);
  const campAnt = acumular(g.filter((r) => r.level === "campaign" && esAnterior(r)), (r) => r.entity_id, conv);
  const campanas = [...campAct.entries()].map(([nombre, a]) => ({ nombre, actual: totales(a), anterior: campAnt.has(nombre) ? totales(campAnt.get(nombre)) : null, peso_gasto: actual.gasto ? a.gasto / actual.gasto : 0 })).sort((a, b) => b.actual.gasto - a.actual.gasto);
  const campanas_diario = {};
  for (const [k, a] of acumular(campDia, (r) => `${r.entity_id}${r.date_from}`, conv)) {
    const [nombre, f] = k.split("");
    (campanas_diario[nombre] ??= []).push({ fecha: f, gasto: a.gasto, clics: a.clics, impresiones: a.impresiones, conversiones: a.conversiones, valor: a.valor });
  }
  for (const v of Object.values(campanas_diario)) v.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const esc = (ids) => escenarios.find((e) => ids.includes(e.scenario))?.verdict;
  const nombres = nombresCortos(campanas.map((c) => c.nombre));
  const mes = nombreComparacion(anterior);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const vsMes = mes === "el per\xEDodo anterior" ? "antes" : mes;
  const obj = config2.umbrales.cpa_objetivo ?? null;
  const pctAbs = (v) => pct(v === null ? null : Math.abs(v));
  const cada1002 = (v) => v === null ? "\u2014" : num(v * 100, 1);
  const contraMes = `Mismos d\xEDas de ${mes}`;
  const dG = cambio2(actual.gasto, ant?.gasto ?? null), dC = cambio2(actual.clics, ant?.clics ?? null);
  const dEfi = cambio2(actual.gasto ? actual.clics / actual.gasto : null, ant?.gasto ? ant.clics / ant.gasto : null);
  const [g1, g2] = mitades(dias, (d2) => d2.gasto);
  const [c1, c2] = mitades(dias, (d2) => d2.clics);
  const cpcMitad = c1 > 0 && c2 > 0 ? cambio2(g2 / c2, g1 / c1) : null;
  const mitadDia = dias[Math.floor(dias.length / 2)]?.fecha;
  const visitas = (v) => v === null ? "" : v >= 0.7 && v <= 1.3 ? "casi el doble de visitas" : `${pctAbs(v)} ${v >= 0 ? "m\xE1s" : "menos"} visitas`;
  const inversionTxt = dG === null ? "" : Math.abs(dG) <= 0.05 ? `con la misma inversi\xF3n que ${enMes}` : `con ${pctAbs(dG)} ${dG > 0 ? "m\xE1s" : "menos"} inversi\xF3n que ${enMes}`;
  const senEfi = senalPorCambio(dEfi, "sube");
  const costoClics = {
    senal: senEfi,
    titular: dC === null ? `Google trajo ${num(actual.clics)} visitas con ${money(actual.gasto, cur)} de inversi\xF3n.` : senEfi === "potenciar" ? `El tr\xE1fico desde Google rindi\xF3 m\xE1s: ${inversionTxt} llegaron ${visitas(dC)} (${num(actual.clics)} vs. ${num(ant.clics)}).` : senEfi === "oportunidad" ? `Cada visita desde Google est\xE1 costando m\xE1s que ${enMes}: ${inversionTxt} llegaron ${num(actual.clics)} visitas (${num(ant.clics)} ${enMes}).` : `Google trajo ${num(actual.clics)} visitas ${inversionTxt}, en l\xEDnea con ${mes}.`,
    detalle: cpcMitad !== null && Math.abs(cpcMitad) > 0.15 ? `En la segunda mitad del mes el costo por visita ${cpcMitad > 0 ? "subi\xF3" : "baj\xF3"} ${pctAbs(cpcMitad)}.` : void 0,
    accion: cpcMitad !== null && cpcMitad > 0.15 && mitadDia ? `Siguiente paso: revisar qu\xE9 cambi\xF3 desde el ${fecha(mitadDia)} (presupuestos, pujas o campa\xF1as nuevas).` : void 0,
    respaldo: { contra: contraMes, ...confianza(actual.clics, "visitas"), medicion: "Visitas por cada $1.000 invertidos en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto invertiste cada d\xEDa (barras) y cu\xE1ntas visitas trajo esa inversi\xF3n (l\xEDnea).",
    como_se_lee: "Si las dos suben juntas, est\xE1s comprando m\xE1s tr\xE1fico. Si la inversi\xF3n sube y las visitas no, cada visita se est\xE1 encareciendo."
  };
  const diasCero = dias.filter((d2) => d2.gasto > 0 && d2.conversiones === 0);
  const dConv = cambio2(actual.conversiones, ant?.conversiones ?? null);
  const comparaVentas = dConv === null ? "" : Math.abs(dConv) <= 0.05 ? `, igual que ${enMes},` : ` (${dConv > 0 ? "+" : "\u2212"}${pctAbs(dConv)} vs. ${vsMes})`;
  const maxPedido = economia?.costo_pedido_maximo ?? null;
  const senCpa = actual.cpa === null ? "estable" : obj && actual.cpa <= obj ? "potenciar" : "oportunidad";
  const cercaMeta = obj && actual.cpa !== null && actual.cpa > obj && actual.cpa <= obj * 1.15;
  const convCpa = {
    senal: senCpa,
    titular: `Google trajo ${num(actual.conversiones, 0)} ventas${comparaVentas} a ${money(actual.cpa, cur)} cada una${obj ? senCpa === "potenciar" ? `, bajo tu meta de ${money(obj, cur)}` : cercaMeta ? `, cerca de tu meta de ${money(obj, cur)}` : ` (tu meta: ${money(obj, cur)})` : ""}.`,
    detalle: diasCero.length >= 2 ? `${diasCero.length} d\xEDas (${diasCero.map((d2) => Number(d2.fecha.slice(8, 10))).join(", ").replace(/, (\d+)$/, " y $1")}) no registraron ventas atribuidas; es habitual en campa\xF1as que alimentan compras posteriores.` : void 0,
    accion: senCpa === "oportunidad" && obj && actual.cpa !== null ? `Siguiente paso: bajar ~${money(actual.cpa - obj, cur)} por venta para llegar a la meta; la palanca m\xE1s directa est\xE1 en la tabla de campa\xF1as.` : senCpa === "potenciar" ? "Siguiente paso: hay espacio para invertir m\xE1s manteniendo el costo por venta." : void 0,
    respaldo: {
      contra: [obj ? `Tu meta de ${money(obj, cur)} por venta` : null, maxPedido ? `el m\xE1ximo para no perder (${money(maxPedido, cur)}, ver Resumen)` : null, mes === "el per\xEDodo anterior" ? "el per\xEDodo anterior" : mes].filter(Boolean).join(", ") + ".",
      ...confianza(actual.conversiones, "ventas atribuidas", 300, 50),
      medicion: "Costo por venta de Google en la pr\xF3xima lectura, con la misma comparaci\xF3n."
    },
    que_es: "Cu\xE1ntas ventas registr\xF3 Google cada d\xEDa (barras) y cu\xE1nto cost\xF3 cada una (l\xEDnea).",
    como_se_lee: "Lo que importa es que el costo por venta se mantenga bajo tu meta. Un pico aislado suele ser un d\xEDa con pocas ventas; mira la tendencia."
  };
  const dCpc = cambio2(actual.cpc, ant?.cpc ?? null), dTc = cambio2(actual.tasa_conv, ant?.tasa_conv ?? null);
  const baseCpc = {
    respaldo: { contra: contraMes, ...confianza(actual.clics, "visitas"), escenario: esc(["S-GADS-03"]), medicion: "Costo por visita y % de visitas de Google que compran, en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto pagas en promedio por cada visita (costo por clic) y cu\xE1ntas de cada 100 personas que ven el anuncio hacen clic.",
    como_se_lee: "Visitas baratas y m\xE1s clics = anuncios que interesan. Si la visita se abarata pero compra menos gente, la palanca est\xE1 en la p\xE1gina, no en el anuncio."
  };
  const cpcCtr = dCpc !== null && dTc !== null && dCpc < -0.1 && dTc < -0.1 ? {
    ...baseCpc,
    senal: "oportunidad",
    titular: `Las visitas desde Google salen ${pctAbs(dCpc)} m\xE1s baratas que ${enMes} (${money(actual.cpc, cur)} cada una). La oportunidad est\xE1 en que compren: ${cada1002(actual.tasa_conv)} de cada 100 visitas compran (${enMes}, ${cada1002(ant.tasa_conv)}).`,
    accion: "Siguiente paso: revisar la p\xE1gina a la que llegan desde Google (precio, stock y velocidad en el celular)."
  } : dCpc !== null && dCpc > 0.1 ? {
    ...baseCpc,
    senal: "oportunidad",
    titular: `Cada visita desde Google cuesta ${money(actual.cpc, cur)}, ${pctAbs(dCpc)} m\xE1s que ${enMes}.`,
    detalle: actual.ctr !== null ? `De cada 100 personas que ven tu anuncio, ${num(actual.ctr * 100, 1)} hacen clic.` : void 0,
    accion: "Siguiente paso: revisar las palabras m\xE1s caras y la calidad de los anuncios."
  } : {
    ...baseCpc,
    senal: dCpc !== null && dCpc < -0.1 ? "potenciar" : "estable",
    titular: `Cada visita desde Google cuesta ${money(actual.cpc, cur)}${dCpc !== null ? ` (${dCpc >= 0 ? "+" : "\u2212"}${pctAbs(dCpc)} vs. ${vsMes})` : ""} y de cada 100 personas que ven tu anuncio, ${num((actual.ctr ?? 0) * 100, 1)} hacen clic.`
  };
  const vistos = actual.cuota_impr === null ? null : Math.round(actual.cuota_impr * 100);
  const porRank = Math.round((actual.cuota_perdida_rank ?? 0) * 100), porPpto = Math.round((actual.cuota_perdida_ppto ?? 0) * 100);
  const brandSinPlata = esc(["S-GADS-01"]);
  const cuota = {
    senal: vistos === null ? "estable" : vistos < 70 ? "oportunidad" : "potenciar",
    titular: vistos === null ? "Google no inform\xF3 en cu\xE1ntas b\xFAsquedas apareciste (solo aplica a campa\xF1as de b\xFAsqueda)." : vistos < 70 ? `Hay espacio para aparecer en muchas m\xE1s b\xFAsquedas: hoy apareces en ${vistos} de cada 100.` : `Apareces en ${vistos} de cada 100 b\xFAsquedas donde podr\xEDas estar.`,
    detalle: vistos === null ? void 0 : `La palanca principal es la relevancia de anuncios y p\xE1ginas (${porRank} de cada 100)${porPpto ? ` y, en segundo lugar, el presupuesto (${porPpto})` : ""}.`,
    accion: vistos === null ? void 0 : brandSinPlata ? "Siguiente paso: reforzar el presupuesto de la campa\xF1a que vende al menor costo y hoy se queda sin presupuesto (ver Detectado)." : porRank > porPpto ? "Siguiente paso: mejorar anuncios y p\xE1ginas de destino para competir mejor." : "Siguiente paso: subir presupuesto donde cada venta cuesta menos que tu meta.",
    respaldo: { contra: "Todas las b\xFAsquedas donde pod\xEDas aparecer (dato de Google).", escenario: brandSinPlata, ...confianza(actual.impresiones, "impresiones", 2e4, 3e3), medicion: "Cuota de impresiones y ventas de esa campa\xF1a a 14 d\xEDas." },
    que_es: "De todas las b\xFAsquedas donde podr\xEDas aparecer, en cu\xE1ntas apareciste y por qu\xE9 no apareciste en el resto.",
    como_se_lee: "Sin aparecer por presupuesto = se acab\xF3 la plata del d\xEDa (se resuelve invirtiendo). Sin aparecer por competencia = el anuncio o la puja no alcanzaron (se resuelve con calidad o puja)."
  };
  const dRoas = cambio2(actual.roas, ant?.roas ?? null);
  const signo = cur === "CLP" ? "$" : "";
  const roasValor = {
    senal: senalPorCambio(dRoas, "sube", 0.05),
    titular: `Por cada ${signo}1 en Google, Google registra ${signo}${num(actual.roas, 1)} de venta${ant?.roas ? ` (${enMes}, ${signo}${num(ant.roas, 1)})` : ""}.`,
    accion: "La venta real total, con todos los canales, est\xE1 en el Resumen.",
    respaldo: { contra: contraMes, ...confianza(actual.conversiones, "ventas atribuidas", 300, 50), medicion: "Retorno por peso de Google en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto vendi\xF3 Google seg\xFAn su propia medici\xF3n (barras) y cu\xE1ntas veces recuperaste lo invertido (l\xEDnea).",
    como_se_lee: "4x = por cada $1 invertido, Google registra $4 de venta. Es la mirada de Google: puede incluir ventas que tambi\xE9n tocaron otros canales."
  };
  const top = campanas[0];
  const conCpa = campanas.filter((c) => c.actual.cpa !== null && c.actual.conversiones >= 3);
  const mejor = conCpa.reduce((m, c) => !m || c.actual.cpa < m.actual.cpa ? c : m, void 0);
  const veces = top?.actual.cpa && actual.cpa ? top.actual.cpa / actual.cpa : null;
  const dc = top ? deCada(top.peso_gasto) : "";
  const campLect = top ? {
    senal: veces !== null && veces >= 1.5 && mejor && mejor !== top ? "oportunidad" : "estable",
    titular: `${nombres[top.nombre]} lleva ${dc} pesos de la inversi\xF3n${top.actual.cpa !== null ? ` y vende a ${money(top.actual.cpa, cur)} por venta` : ""}.`,
    detalle: mejor && mejor !== top ? `${nombres[mejor.nombre]} es la que vende al menor costo: ${money(mejor.actual.cpa, cur)} por venta.` : void 0,
    accion: veces !== null && veces >= 1.5 && mejor && mejor !== top ? `Siguiente paso: probar m\xE1s presupuesto en ${nombres[mejor.nombre]} y medir en 14 d\xEDas si las ventas se sostienen.` : void 0,
    respaldo: { contra: `Costo por venta promedio de la cuenta (${money(actual.cpa, cur)}).`, escenario: esc(["S-GADS-04"]), ...confianza(actual.conversiones, "ventas atribuidas", 300, 50), medicion: "Costo por venta y ventas de cada campa\xF1a a 14 d\xEDas." },
    que_es: "La inversi\xF3n, las ventas o el costo por venta de cada campa\xF1a, d\xEDa a d\xEDa.",
    como_se_lee: "Sirve para ver qu\xE9 campa\xF1a explica un pico o una ca\xEDda del total."
  } : { senal: "estable", titular: "Sin datos por campa\xF1a.", respaldo: { contra: contraMes, confianza: "baja", confianza_motivo: "sin campa\xF1as", medicion: "\u2014" }, que_es: "", como_se_lee: "" };
  const lecturas = { costo_clics: costoClics, cuota, cpc_ctr: cpcCtr, conv_cpa: convCpa, roas_valor: roasValor, campanas_diario: campLect };
  const historia = [cpcCtr, cuota, campLect].find((l) => l.senal === "oportunidad");
  const veredicto = { senal: convCpa.senal, titular: convCpa.titular, detalle: historia ? historia.titular : costoClics.titular };
  return { desde, hasta, anterior_desde: anterior?.[0] ?? null, anterior_hasta: anterior?.[1] ?? null, dias, actual, anterior: ant, campanas, campanas_diario, lecturas, veredicto, nombres };
}

// src/core/arbol.ts
var div2 = (a, b) => a === null || a === void 0 || !b ? null : a / b;
var totalFunnel = (f) => {
  const t = { visitas: 0, carrito: 0, checkout: 0, compra: 0 };
  for (const pasos of Object.values(f)) for (const p of pasos) t[p.paso] += p.valor;
  return t;
};
var pct2 = (v, d2 = 0) => v === null ? "\u2014" : `${(v * 100).toLocaleString("es-CL", { maximumFractionDigits: d2 })}%`;
var conSigno = (v) => v === null ? "" : `${v >= 0 ? "+" : "\u2212"}${pct2(Math.abs(v))}`;
function arbolNegocio(input) {
  const { config: config2, kpis: k } = input;
  const cur = config2.moneda_reporte;
  const money2 = (v) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${v.toLocaleString("es-CL", { maximumFractionDigits: 0 })} ${cur}`;
  const esc = (id) => input.escenarios?.find((e) => e.scenario === id)?.verdict;
  const ant = input.anterior;
  const prevRows = ant ? input.series.filter((r) => r.date_from === ant[0] && r.date_to === ant[1]) : [];
  const kp = prevRows.some((r) => r.level === "store") ? businessKpis(prevRows, config2) : null;
  const fp = kp ? totalFunnel(funnelByDevice(prevRows)) : null;
  const fa = totalFunnel(input.funnel);
  const comp = nombreComparacion(ant);
  const cogs = config2.costos.cogs_pct_default ?? null;
  const com = config2.costos.comision_pct ?? 0;
  const envio = config2.costos.envio_por_pedido ?? 0;
  const neta = (x) => x && x.ventas_brutas !== null && x.descuentos !== null ? x.ventas_brutas - x.descuentos : null;
  const margenAntesPauta = (x) => {
    const n = neta(x);
    return n === null || cogs === null ? null : n * (1 - cogs - com) - envio * (x.pedidos ?? 0);
  };
  const contrib = (x) => {
    const m = margenAntesPauta(x);
    return m === null || x?.gasto_ads === null || x?.gasto_ads === void 0 ? null : m - x.gasto_ads;
  };
  const costoPedidoMax = div2(margenAntesPauta(k), k.pedidos);
  const retornoMin = div2(k.ventas_total, margenAntesPauta(k));
  const supuestos = [
    cogs === null ? "Falta el costo de producto: la contribuci\xF3n no se puede calcular." : `Costo de producto ${pct2(cogs)} de la venta neta${config2.costos.validado ? "" : " (estimado, falta validarlo)"}.`,
    ...config2.costos.comision_pct === void 0 ? ["Comisi\xF3n de la pasarela de pago sin configurar (se asume 0)."] : [],
    ...config2.costos.envio_por_pedido === void 0 ? ["Costo de env\xEDo absorbido por la tienda sin configurar (se asume 0)."] : []
  ];
  const nodo = (id, nombre, valor, anterior, formato, mejor, referencia, extra = {}) => {
    const delta = cambio(valor, anterior);
    return { id, nombre, valor, anterior, delta, formato, mejor, senal: mejor === "neutro" ? "estable" : senalPorCambio(delta, mejor), referencia, ...extra };
  };
  const costoPedido = div2(k.gasto_ads, k.pedidos), costoPedidoAnt = div2(kp?.gasto_ads, kp?.pedidos);
  const convA = div2(fa.compra, fa.visitas), convP = fp ? div2(fp.compra, fp.visitas) : null;
  const ticketA = div2(neta(k), k.pedidos), ticketP = kp ? div2(neta(kp), kp.pedidos) : null;
  const recA = div2(k.clientes_recurrentes, (k.clientes_nuevos ?? 0) + (k.clientes_recurrentes ?? 0));
  const recP = kp ? div2(kp.clientes_recurrentes, (kp.clientes_nuevos ?? 0) + (kp.clientes_recurrentes ?? 0)) : null;
  const devices = input.funnel;
  const convDev = (d2) => {
    const p = devices[d2];
    if (!p) return null;
    const v = p.find((x) => x.paso === "visitas")?.valor ?? 0;
    return div2(p.find((x) => x.paso === "compra")?.valor ?? 0, v);
  };
  const nodos = {};
  const add = (n) => nodos[n.id] = n;
  add(nodo("contribucion", "Lo que queda (contribuci\xF3n)", contrib(k), contrib(kp), "money", "sube", "Venta menos descuentos, costo de producto, env\xEDos, comisiones e inversi\xF3n", { hijos: ["venta", "inversion", "retorno"], pagina: "ventas" }));
  add(nodo("venta", "Venta total", k.ventas_total, kp?.ventas_total ?? null, "money", "sube", `vs. ${comp} (mismo n\xFAmero que Shopify)`, { hijos: ["visitas", "conversion", "ticket"], pagina: "ventas" }));
  add(nodo("inversion", "Inversi\xF3n en publicidad", k.gasto_ads, kp?.gasto_ads ?? null, "money", "neutro", `vs. ${comp}`, { hijos: ["costo_pedido"], pagina: "meta" }));
  const nRet = add(nodo("retorno", "Retorno total por peso", k.mer, kp?.mer ?? null, "x", "sube", retornoMin !== null ? `M\xEDnimo para no perder: ${retornoMin.toLocaleString("es-CL", { maximumFractionDigits: 1 })}x` : `vs. ${comp}`, { pagina: "resumen" }));
  if (retornoMin !== null && k.mer !== null && k.mer >= retornoMin * 1.5 && nRet.senal === "estable") nRet.senal = "potenciar";
  const nCp = add(nodo("costo_pedido", "Costo por pedido (toda la publicidad)", costoPedido, costoPedidoAnt, "money", "baja", costoPedidoMax !== null ? `M\xE1ximo para no perder: ${money2(costoPedidoMax)} por pedido` : `vs. ${comp}`, { pagina: "google_ads" }));
  if (costoPedidoMax !== null && costoPedido !== null && costoPedido > costoPedidoMax) nCp.senal = "oportunidad";
  add(nodo("visitas", "Visitas a la tienda", fa.visitas, fp?.visitas ?? null, "num", "sube", `vs. ${comp}`, { hijos: ["email"], pagina: "cro" }));
  add(nodo("conversion", "% que compra", convA, convP, "pct", "sube", `Celular ${pct2(convDev("mobile"), 1)} \xB7 escritorio ${pct2(convDev("desktop"), 1)}`, { hijos: ["carrito", "checkout", "pago"], pagina: "cro" }));
  add(nodo("ticket", "Ticket promedio", ticketA, ticketP, "money", "sube", `vs. ${comp}`, { hijos: ["descuentos", "recurrentes"], pagina: "ventas" }));
  add(nodo("carrito", "Agrega al carrito", div2(fa.carrito, fa.visitas), fp ? div2(fp.carrito, fp.visitas) : null, "pct", "sube", "de cada 100 visitas", { pagina: "cro" }));
  add(nodo("checkout", "Llega a pagar", div2(fa.checkout, fa.carrito), fp ? div2(fp.checkout, fp.carrito) : null, "pct", "sube", "de quienes agregan al carrito", { pagina: "cro" }));
  const nPago = add(nodo("pago", "Completa el pago", div2(fa.compra, fa.checkout), fp ? div2(fp.compra, fp.checkout) : null, "pct", "sube", "de quienes llegan a pagar", { pagina: "cro" }));
  if (esc("S-CRO-02")) nPago.senal = "oportunidad";
  add(nodo("descuentos", "Descuentos sobre la venta", k.descuentos_pct, kp?.descuentos_pct ?? null, "pct", "baja", `vs. ${comp}`, { pagina: "ventas" }));
  add(nodo("recurrentes", "Clientes que vuelven", recA, recP, "pct", "sube", `vs. ${comp}`, { pagina: "email" }));
  add(nodo("email", "Venta que trae el email", input.emailPeso ?? null, null, "pct", "sube", "del total de la venta", { pagina: "email" }));
  const descomposicion = kp ? { venta: cambio(k.ventas_total, kp.ventas_total), visitas: cambio(fa.visitas, fp?.visitas), conversion: cambio(convA, convP), ticket: cambio(ticketA, ticketP) } : null;
  const dV = descomposicion?.venta ?? null;
  const movVenta = dV === null ? "" : Math.abs(dV) < 0.03 ? `, igual que ${comp}` : ` (${conSigno(dV)} vs. ${comp})`;
  const partes = [];
  if (descomposicion) {
    const { visitas: dS, conversion: dC, ticket: dT } = descomposicion;
    if (dS !== null && Math.abs(dS) >= 0.03) partes.push(`llegaron ${pct2(Math.abs(dS))} ${dS > 0 ? "m\xE1s" : "menos"} visitas`);
    if (dC !== null && Math.abs(dC) >= 0.03 && convA !== null && convP !== null)
      partes.push(`compr\xF3 ${dC > 0 ? "una proporci\xF3n mayor" : "una proporci\xF3n menor"} (${(convA * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })} de cada 100 visitas vs. ${(convP * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })})`);
    if (dT !== null && Math.abs(dT) >= 0.03) partes.push(`el ticket promedio ${dT > 0 ? "subi\xF3" : "baj\xF3"} ${pct2(Math.abs(dT))}`);
  }
  const explicacion = partes.length ? `${partes[0][0].toUpperCase()}${partes[0].slice(1)}${partes.length > 1 ? `${partes.length > 2 ? ", " + partes.slice(1, -1).join(", ") : ""} y ${partes[partes.length - 1]}` : ""}.` : "";
  const cada1002 = (v) => v === null ? "\u2014" : (v * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 });
  const accionDe = (n) => {
    switch (n.id) {
      case "conversion":
        return `La oportunidad m\xE1s grande est\xE1 en que compre m\xE1s gente: en celular compran ${cada1002(convDev("mobile"))} de cada 100 visitas y en escritorio ${cada1002(convDev("desktop"))}. Detalle en Conversi\xF3n y CRO.`;
      case "pago":
        return `La oportunidad est\xE1 en el \xFAltimo paso: de cada 100 personas que llegan a pagar, ${cada1002(n.valor)} completan la compra. Detalle en Conversi\xF3n y CRO.`;
      case "carrito":
        return `La oportunidad est\xE1 en la ficha de producto: ${cada1002(n.valor)} de cada 100 visitas agregan al carrito.`;
      case "costo_pedido":
        return "La oportunidad est\xE1 en el costo de conseguir cada pedido: revisar qu\xE9 campa\xF1as lo est\xE1n subiendo.";
      case "recurrentes":
        return "La oportunidad est\xE1 en que los clientes vuelvan: revisar flows de recompra en Email.";
      default:
        return `La oportunidad est\xE1 en ${n.nombre.toLowerCase()}.`;
    }
  };
  const oportunidades = Object.values(nodos).filter((n) => n.senal === "oportunidad");
  const potenciar = Object.values(nodos).filter((n) => n.senal === "potenciar");
  const c = contrib(k);
  const veredicto = {
    senal: oportunidades.length > potenciar.length ? "oportunidad" : potenciar.length ? "potenciar" : "estable",
    titular: `Vendiste ${money2(k.ventas_total)}${movVenta}${c !== null ? ` y quedaron ~${money2(c)} despu\xE9s de producto e inversi\xF3n` : ""}.`,
    detalle: explicacion || void 0,
    accion: oportunidades[0] ? accionDe(oportunidades[0]) : void 0,
    respaldo: {
      contra: `Mismos d\xEDas de ${comp}${costoPedidoMax !== null ? ` y la econom\xEDa del negocio (m\xE1ximo ${money2(costoPedidoMax)} por pedido)` : ""}.`,
      ...confianza(k.pedidos, "pedidos", 300, 60),
      medicion: "Venta neta y contribuci\xF3n del pr\xF3ximo corte, con la misma comparaci\xF3n."
    },
    que_es: "El resumen del negocio: cu\xE1nto vendiste, cu\xE1nto qued\xF3 y qu\xE9 palanca explica el cambio.",
    como_se_lee: "La venta es visitas \xD7 % que compra \xD7 ticket. Si la venta cambi\xF3, mira cu\xE1l de las tres la movi\xF3."
  };
  const fmtNodo = (n) => n.delta === null ? n.nombre : `${n.nombre}: ${conSigno(n.delta)} vs. ${comp}`;
  const bloques = {
    potenciar: potenciar.slice(0, 3).map(fmtNodo),
    optimizar: oportunidades.slice(0, 3).map(fmtNodo),
    mirar: Object.values(nodos).filter((n) => n.senal === "estable" && n.valor !== null && n.mejor !== "neutro").slice(0, 3).map((n) => n.nombre)
  };
  return {
    comparacion: ant ? { desde: ant[0], hasta: ant[1], nombre: comp } : null,
    nodos,
    economia: { cogs_pct: cogs, cogs_validado: config2.costos.validado, comision_pct: com, envio_por_pedido: envio, costo_pedido_maximo: costoPedidoMax, retorno_minimo: retornoMin, supuestos },
    descomposicion,
    veredicto,
    bloques
  };
}

// src/core/cro.ts
var nuevo = () => ({ sesiones: 0, usuarios_nuevos: 0, carritos: 0, checkouts: 0, compras: 0, ingresos: 0, inter: 0, pags: 0, dur: 0 });
var div3 = (a, b) => b > 0 ? a / b : null;
var tot = (a) => ({
  sesiones: a.sesiones,
  usuarios_nuevos: a.usuarios_nuevos,
  carritos: a.carritos,
  checkouts: a.checkouts,
  compras: a.compras,
  ingresos: a.ingresos,
  interaccion: div3(a.inter, a.sesiones),
  paginas_sesion: div3(a.pags, a.sesiones),
  duracion: div3(a.dur, a.sesiones),
  tasa_carrito: div3(a.carritos, a.sesiones),
  tasa_checkout: div3(a.checkouts, a.sesiones),
  tasa_compra: div3(a.compras, a.sesiones)
});
function juntar(rows, key, conv) {
  const porFila = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = `${key(r)}\0${r.date_from}\0${r.entity_id}`;
    if (!porFila.has(k)) porFila.set(k, /* @__PURE__ */ new Map());
    porFila.get(k).set(r.metric, r.currency ? conv(r) : r.value ?? 0);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, m] of porFila) {
    const g = k.split("\0")[0];
    if (!out.has(g)) out.set(g, nuevo());
    const a = out.get(g), s = m.get("sesiones") ?? 0;
    a.sesiones += s;
    a.usuarios_nuevos += m.get("usuarios_nuevos") ?? 0;
    a.carritos += m.get("carritos_ga4") ?? 0;
    a.checkouts += m.get("checkouts_ga4") ?? 0;
    a.compras += m.get("compras_ga4") ?? 0;
    a.ingresos += m.get("ingresos_ga4") ?? 0;
    a.inter += (m.get("engagement") ?? 0) * s;
    a.pags += (m.get("paginas_sesion") ?? 0) * s;
    a.dur += (m.get("duracion_media") ?? 0) * s;
  }
  return out;
}
var DIAS = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
var plural = (d2) => d2.endsWith("s") ? d2 : `${d2}s`;
var n0 = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
var pct3 = (v) => v === null ? "\u2014" : `${Math.round(Math.abs(v) * 100)}%`;
var cada100 = (v) => v === null ? "\u2014" : n0(v * 100, 1);
var fTotal = (f, d2, paso) => f[d2]?.find((x) => x.paso === paso)?.valor ?? 0;
function croDashboard(input) {
  const { config: config2, desde, hasta, anterior: ant } = input;
  const cur = config2.moneda_reporte;
  const conv = (r) => toReport(config2, r.value ?? 0, r.currency, r.date_to);
  const esc = (id) => input.escenarios?.find((e) => e.scenario === id)?.verdict;
  const ga = input.series.filter((r) => r.source === "ga4" && r.date_from === r.date_to);
  const enRango = (a, b) => (r) => r.date_from >= a && r.date_from <= b;
  const cuentaAct = ga.filter((r) => r.level === "account" && enRango(desde, hasta)(r));
  if (!cuentaAct.length) return null;
  const cuentaAnt = ant ? ga.filter((r) => r.level === "account" && enRango(ant[0], ant[1])(r)) : [];
  const porDia = (rows) => [...juntar(rows, (r) => r.date_from, conv).entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([fecha2, a]) => ({ fecha: fecha2, ...tot(a) }));
  const dias = porDia(cuentaAct), dias_anterior = porDia(cuentaAnt);
  const actual = tot([...juntar(cuentaAct, () => "", conv).values()][0]);
  const anterior = cuentaAnt.length ? tot([...juntar(cuentaAnt, () => "", conv).values()][0]) : null;
  const mes = nombreComparacion(ant);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const contraMes = `Mismos d\xEDas de ${mes}`;
  const prom = (ds, w, k) => {
    const xs = ds.filter((d2) => (/* @__PURE__ */ new Date(`${d2.fecha}T12:00:00Z`)).getUTCDay() === w);
    return xs.length ? xs.reduce((s, d2) => s + d2[k], 0) / xs.length : null;
  };
  const semana = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ dia: w, nombre: DIAS[w], sesiones: prom(dias, w, "sesiones") ?? 0, compras: prom(dias, w, "compras") ?? 0, sesiones_ant: dias_anterior.length ? prom(dias_anterior, w, "sesiones") : null }));
  const canalRows = ga.filter((r) => r.level === "channel" && enRango(desde, hasta)(r));
  const canales_diario = {};
  for (const [k, a] of juntar(canalRows, (r) => `${r.entity_id}${r.date_from}`, conv)) {
    const [canal, fecha2] = k.split("");
    (canales_diario[canal] ??= []).push({ fecha: fecha2, sesiones: a.sesiones, compras: a.compras });
  }
  for (const v of Object.values(canales_diario)) v.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const totCanal = [...juntar(canalRows, (r) => r.entity_id, conv).entries()].map(([canal, a]) => ({ canal, sesiones: a.sesiones, compras: a.compras, tasa: div3(a.compras, a.sesiones), peso: 0 }));
  const sesCanales = totCanal.reduce((s, c) => s + c.sesiones, 0);
  for (const c of totCanal) c.peso = sesCanales ? c.sesiones / sesCanales : 0;
  const canales = totCanal.sort((a, b) => b.sesiones - a.sesiones);
  const prevFunnel = ant ? funnelByDevice(input.series.filter((r) => r.date_from === ant[0] && r.date_to === ant[1])) : {};
  const totalVis = Object.keys(input.funnel).reduce((s, d2) => s + fTotal(input.funnel, d2, "visitas"), 0);
  const dispositivos = Object.keys(input.funnel).map((d2) => {
    const visitas = fTotal(input.funnel, d2, "visitas"), compra = fTotal(input.funnel, d2, "compra");
    const vPrev = fTotal(prevFunnel, d2, "visitas");
    return { dispositivo: d2, visitas, carrito: fTotal(input.funnel, d2, "carrito"), checkout: fTotal(input.funnel, d2, "checkout"), compra, conversion: div3(compra, visitas), conversion_ant: vPrev ? div3(fTotal(prevFunnel, d2, "compra"), vPrev) : null, peso: totalVis ? visitas / totalVis : 0 };
  }).filter((x) => x.visitas >= 50).sort((a, b) => b.visitas - a.visitas);
  const dSes = cambio(actual.sesiones, anterior?.sesiones), dInter = cambio(actual.interaccion, anterior?.interaccion);
  const trafico = {
    senal: senalPorCambio(dSes, "sube"),
    titular: dSes === null ? `Llegaron ${n0(actual.sesiones)} visitas.` : Math.abs(dSes) < 0.03 ? `Llegaron ${n0(actual.sesiones)} visitas, igual que ${enMes}.` : `Llegaron ${n0(actual.sesiones)} visitas, ${pct3(dSes)} ${dSes > 0 ? "m\xE1s" : "menos"} que ${enMes}.`,
    detalle: actual.interaccion !== null ? `${cada100(actual.interaccion)} de cada 100 visitas interact\xFAan con la tienda${anterior?.interaccion ? ` (${enMes}, ${cada100(anterior.interaccion)})` : ""}.` : void 0,
    accion: dSes !== null && dSes > 0.1 && dInter !== null && dInter < -0.1 ? "Siguiente paso: revisar qu\xE9 canal trae el tr\xE1fico nuevo (gr\xE1fico de canales): m\xE1s visitas con menos interacci\xF3n suele ser p\xFAblico menos listo para comprar." : void 0,
    respaldo: { contra: `${contraMes} (l\xEDnea punteada)`, ...confianza(actual.sesiones, "visitas"), medicion: "Visitas e interacci\xF3n en la pr\xF3xima lectura." },
    que_es: "Las visitas a la tienda cada d\xEDa (l\xEDnea llena) y las del mismo per\xEDodo de comparaci\xF3n (l\xEDnea punteada).",
    como_se_lee: "Si la l\xEDnea llena va por encima de la punteada, est\xE1s recibiendo m\xE1s visitas que antes. Los picos suelen coincidir con env\xEDos de email, lanzamientos o campa\xF1as."
  };
  const pasos = [
    { n: "agregan al carrito", de: "De cada 100 visitas", a: actual.tasa_carrito, p: anterior?.tasa_carrito ?? null },
    { n: "inician el pago", de: "De quienes agregan al carrito", a: div3(actual.checkouts, actual.carritos), p: anterior ? div3(anterior.checkouts, anterior.carritos) : null },
    { n: "compran", de: "De quienes inician el pago", a: div3(actual.compras, actual.checkouts), p: anterior ? div3(anterior.compras, anterior.checkouts) : null }
  ];
  const peorPaso = pasos.map((x) => ({ ...x, d: cambio(x.a, x.p) })).filter((x) => x.d !== null).sort((x, y) => x.d - y.d)[0];
  const dTasa = cambio(actual.tasa_compra, anterior?.tasa_compra);
  const embudo = {
    senal: senalPorCambio(dTasa, "sube"),
    titular: `De cada 100 visitas, ${cada100(actual.tasa_carrito)} agregan al carrito, ${cada100(actual.tasa_checkout)} inician el pago y ${cada100(actual.tasa_compra)} compran.`,
    detalle: peorPaso && peorPaso.d < -0.1 ? `El paso que m\xE1s cambi\xF3: ${peorPaso.de.toLowerCase()}, ${cada100(peorPaso.a)} de cada 100 ${peorPaso.n} (${enMes}, ${cada100(peorPaso.p)}).` : void 0,
    accion: peorPaso && peorPaso.d < -0.1 ? peorPaso.n === "compran" ? "Siguiente paso: revisar el pago (medios de pago, costo de env\xEDo visible y errores en el celular)." : peorPaso.n === "inician el pago" ? "Siguiente paso: revisar el carrito (costo de env\xEDo, cupones, llamado a pagar)." : "Siguiente paso: revisar la ficha de producto (precio visible, fotos, prueba social)." : void 0,
    respaldo: { contra: `${contraMes}. GA4 registra ${input.captura === null ? "\u2014" : `${Math.round(input.captura * 100)}%`} de los pedidos reales: por eso se leen proporciones, no totales.`, ...confianza(actual.sesiones, "visitas"), medicion: "Las mismas tres proporciones en la pr\xF3xima lectura." },
    que_es: "El recorrido de compra seg\xFAn Google Analytics: cu\xE1ntas visitas agregan al carrito, inician el pago y compran.",
    como_se_lee: "El paso donde m\xE1s gente se queda es donde est\xE1 la palanca. Las cifras absolutas de GA4 son menores que las de la tienda porque no registra todos los pedidos."
  };
  const mejorDia = [...semana].sort((a, b) => b.compras - a.compras)[0];
  const peorDia = [...semana].sort((a, b) => a.compras - b.compras)[0];
  const semanaL = {
    senal: "estable",
    titular: `Los ${plural(mejorDia.nombre)} son tu mejor d\xEDa: ${n0(mejorDia.sesiones)} visitas y ${n0(mejorDia.compras, 1)} compras en promedio.`,
    detalle: `Los ${plural(peorDia.nombre)} son el d\xEDa m\xE1s bajo (${n0(peorDia.compras, 1)} compras en promedio).`,
    accion: `Siguiente paso: concentrar lanzamientos y env\xEDos de email los ${plural(mejorDia.nombre)} y usar los ${plural(peorDia.nombre)} para probar ofertas.`,
    respaldo: { contra: "Promedio de cada d\xEDa de la semana en el per\xEDodo (compras seg\xFAn GA4).", ...confianza(actual.compras, "compras registradas", 300, 60), medicion: "Promedio por d\xEDa de la semana en la pr\xF3xima lectura." },
    que_es: "Visitas promedio de cada d\xEDa de la semana, este per\xEDodo y el de comparaci\xF3n.",
    como_se_lee: "Muestra el ritmo semanal del negocio: qu\xE9 d\xEDas la gente visita y compra m\xE1s."
  };
  const top = canales[0], conv0 = actual.tasa_compra;
  const mejorCanal = canales.filter((c) => c.sesiones >= Math.max(200, actual.sesiones * 0.03) && c.tasa !== null).sort((a, b) => b.tasa - a.tasa)[0];
  const canalesL = top ? {
    senal: top.tasa !== null && conv0 && top.tasa < conv0 * 0.6 ? "oportunidad" : "estable",
    titular: `${top.canal} trae ${Math.round(top.peso * 10)} de cada 10 visitas y convierte ${cada100(top.tasa)} de cada 100.`,
    detalle: `${mejorCanal && mejorCanal !== top ? `${mejorCanal.canal} es el que mejor convierte: ${cada100(mejorCanal.tasa)} de cada 100 visitas. ` : ""}GA4 cuenta la venta al \xFAltimo canal antes de comprar: las redes suelen abrir compras que se cierran por b\xFAsqueda, directo o email.`,
    accion: mejorCanal && mejorCanal !== top ? `Siguiente paso: potenciar ${mejorCanal.canal}, que trae p\xFAblico listo para comprar, y leer las redes junto a su propia medici\xF3n (p\xE1gina de Meta).` : void 0,
    respaldo: { contra: `Promedio de la tienda: ${cada100(conv0)} de cada 100 visitas compran (GA4, \xFAltimo clic).`, ...confianza(actual.sesiones, "visitas"), medicion: "Visitas y compras por canal en la pr\xF3xima lectura." },
    que_es: "Las visitas diarias de cada canal (publicidad en redes, b\xFAsqueda pagada, org\xE1nico, email, directo\u2026).",
    como_se_lee: "Un canal con muchas visitas y pocas compras est\xE1 atrayendo p\xFAblico todav\xEDa lejos de comprar; uno con pocas visitas y muchas compras es para potenciar."
  } : { senal: "estable", titular: "Sin datos por canal.", respaldo: { contra: contraMes, confianza: "baja", confianza_motivo: "sin canales", medicion: "\u2014" }, que_es: "", como_se_lee: "" };
  const mob = dispositivos.find((x) => x.dispositivo === "mobile"), desk = dispositivos.find((x) => x.dispositivo === "desktop");
  const brecha = mob && desk && mob.conversion !== null && desk.conversion !== null ? desk.conversion - mob.conversion : null;
  const extraPedidos = brecha !== null && brecha > 0 && mob ? mob.visitas * brecha * 0.5 : null;
  const extraVenta = extraPedidos !== null && input.ticket ? extraPedidos * input.ticket : null;
  const money2 = (v) => cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${Math.round(v).toLocaleString("es-CL")} ${cur}`;
  const dispL = mob && desk ? {
    senal: brecha !== null && mob.conversion !== null && desk.conversion && mob.conversion < desk.conversion * 0.6 ? "oportunidad" : "estable",
    titular: `${Math.round(mob.peso * 10)} de cada 10 visitas llegan desde el celular, donde compran ${cada100(mob.conversion)} de cada 100; en escritorio compran ${cada100(desk.conversion)}.`,
    detalle: esc("S-CRO-02") ? `${esc("S-CRO-02")}.` : void 0,
    accion: brecha !== null && brecha > 0 ? "Siguiente paso: revisar la compra en el celular de punta a punta (velocidad, medios de pago, costo de env\xEDo visible)." : void 0,
    respaldo: {
      contra: "Tu propio escritorio: misma tienda, mismos productos y mismos precios (la comparaci\xF3n m\xE1s justa).",
      escenario: esc("S-CRO-01"),
      impacto: extraPedidos !== null ? `Si el celular cerrara la mitad de la brecha: ~${n0(extraPedidos)} pedidos m\xE1s${extraVenta !== null ? ` (~${money2(extraVenta)})` : ""} en un per\xEDodo como este.` : void 0,
      ...confianza(mob.visitas, "visitas desde el celular"),
      medicion: "% que compra en el celular a 14 y 28 d\xEDas."
    },
    que_es: "El recorrido de compra real (datos de la tienda) separado por dispositivo.",
    como_se_lee: "Si el celular trae la mayor\xEDa de las visitas pero convierte mucho menos que el escritorio, ah\xED est\xE1 la palanca m\xE1s grande de la tienda."
  } : { senal: "estable", titular: "Sin datos por dispositivo.", respaldo: { contra: "\u2014", confianza: "baja", confianza_motivo: "sin datos", medicion: "\u2014" }, que_es: "", como_se_lee: "" };
  const convTienda = div3(dispositivos.reduce((s, d2) => s + d2.compra, 0), dispositivos.reduce((s, d2) => s + d2.visitas, 0));
  const convTiendaAnt = (() => {
    const v = Object.keys(prevFunnel).reduce((s, d2) => s + fTotal(prevFunnel, d2, "visitas"), 0);
    return v ? div3(Object.keys(prevFunnel).reduce((s, d2) => s + fTotal(prevFunnel, d2, "compra"), 0), v) : null;
  })();
  const dConvT = cambio(convTienda, convTiendaAnt);
  const veredicto = {
    senal: senalPorCambio(dConvT, "sube"),
    titular: `De cada 100 visitas a la tienda compraron ${cada100(convTienda)}${convTiendaAnt !== null ? ` (${enMes}, ${cada100(convTiendaAnt)})` : ""}.`,
    detalle: dispL.senal === "oportunidad" ? dispL.titular : embudo.titular
  };
  return {
    desde,
    hasta,
    anterior_desde: ant?.[0] ?? null,
    anterior_hasta: ant?.[1] ?? null,
    dias,
    dias_anterior,
    actual,
    anterior,
    semana,
    canales,
    canales_diario,
    dispositivos,
    captura_ga4: input.captura,
    lecturas: { trafico, embudo, semana: semanaL, canales: canalesL, dispositivos: dispL },
    veredicto
  };
}

// src/core/seodash.ts
var tot2 = (a) => ({ clics: a.clics, impresiones: a.impresiones, ctr: a.impresiones ? a.clics / a.impresiones : null, posicion: a.impresiones ? a.posPond / a.impresiones : null });
function juntar2(rows, key) {
  const porFila = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = `${key(r)}\0${r.date_from}\0${r.entity_id}`;
    if (!porFila.has(k)) porFila.set(k, /* @__PURE__ */ new Map());
    porFila.get(k).set(r.metric, r.value ?? 0);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, m] of porFila) {
    const g = k.split("\0")[0];
    if (!out.has(g)) out.set(g, { clics: 0, impresiones: 0, posPond: 0 });
    const a = out.get(g), imp = m.get("impresiones") ?? 0;
    a.clics += m.get("clics") ?? 0;
    a.impresiones += imp;
    a.posPond += (m.get("posicion") ?? 0) * imp;
  }
  return out;
}
var n02 = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
var pct4 = (v) => v === null ? "\u2014" : `${Math.round(Math.abs(v) * 100)}%`;
function seoDashboard(input) {
  const { config: config2, desde, hasta, anterior: ant } = input;
  const g = input.series.filter((r) => r.source === "gsc");
  const diaria = (a, b) => (r) => r.level === "account" && r.date_from === r.date_to && r.date_from >= a && r.date_from <= b;
  const porDia = (rows) => [...juntar2(rows, (r) => r.date_from).entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([fecha2, a]) => ({ fecha: fecha2, ...tot2(a) }));
  const actRows = g.filter(diaria(desde, hasta));
  if (!actRows.length) return null;
  const antRows = ant ? g.filter(diaria(ant[0], ant[1])) : [];
  const dias = porDia(actRows), dias_anterior = porDia(antRows);
  const actual = tot2([...juntar2(actRows, () => "").values()][0]);
  const anterior = antRows.length ? tot2([...juntar2(antRows, () => "").values()][0]) : null;
  const marcaT = config2.terminos_marca.map((t) => t.toLowerCase());
  const esMarca = (q) => marcaT.some((t) => q.toLowerCase().includes(t));
  const qAct = juntar2(g.filter((r) => r.level === "query" && r.date_from === desde && r.date_to === hasta && !r.dims), (r) => r.entity_id);
  const qAnt = ant ? juntar2(g.filter((r) => r.level === "query" && r.date_from === ant[0] && r.date_to === ant[1] && !r.dims), (r) => r.entity_id) : /* @__PURE__ */ new Map();
  const consultas = [...qAct.entries()].map(([consulta, a]) => ({ consulta, marca: esMarca(consulta), actual: tot2(a), anterior: qAnt.has(consulta) ? tot2(qAnt.get(consulta)) : null })).sort((a, b) => b.actual.impresiones - a.actual.impresiones);
  const clicsMarca = consultas.filter((c) => c.marca).reduce((s, c) => s + c.actual.clics, 0);
  const impMarca = consultas.filter((c) => c.marca).reduce((s, c) => s + c.actual.impresiones, 0);
  const clicsQ = consultas.reduce((s, c) => s + c.actual.clics, 0);
  const marca = { clics: clicsMarca, impresiones: impMarca, peso_clics: clicsQ ? clicsMarca / clicsQ : null };
  const mes = nombreComparacion(ant);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const contra = `Mismos d\xEDas de ${mes} (l\xEDnea punteada)`;
  const esc = (id) => input.escenarios?.find((e) => e.scenario === id);
  const dImp = cambio(actual.impresiones, anterior?.impresiones);
  const dPos = actual.posicion !== null && anterior?.posicion ? actual.posicion - anterior.posicion : null;
  const impPos = {
    senal: senalPorCambio(dImp, "sube"),
    titular: `Apareciste ${n02(actual.impresiones)} veces en Google${dImp !== null ? ` (${dImp >= 0 ? "+" : "\u2212"}${pct4(dImp)} vs. ${mes === "el per\xEDodo anterior" ? "antes" : mes})` : ""}, en la posici\xF3n ${n02(actual.posicion, 1)} en promedio.`,
    detalle: dPos !== null && Math.abs(dPos) >= 0.3 ? `${dPos < 0 ? "Subiste" : "Bajaste"} ${n02(Math.abs(dPos), 1)} lugares en promedio${dPos > 0 && dImp !== null && dImp > 0.1 ? ": suele pasar cuando apareces en b\xFAsquedas nuevas, donde todav\xEDa est\xE1s m\xE1s abajo" : ""}.` : void 0,
    respaldo: { contra, ...confianza(actual.impresiones, "impresiones", 2e4, 3e3), medicion: "Impresiones y posici\xF3n promedio en la pr\xF3xima lectura." },
    que_es: "Cu\xE1ntas veces apareci\xF3 tu tienda en los resultados de Google (barras) y en qu\xE9 posici\xF3n promedio (l\xEDnea; m\xE1s arriba en el gr\xE1fico = mejor lugar).",
    como_se_lee: "Posici\xF3n 1 es el primer resultado. M\xE1s impresiones con posici\xF3n estable = m\xE1s alcance. Si la posici\xF3n empeora mientras crecen las impresiones, suele ser por b\xFAsquedas nuevas donde reci\xE9n apareces."
  };
  const dClics = cambio(actual.clics, anterior?.clics), dCtr = cambio(actual.ctr, anterior?.ctr);
  const seo01 = esc("S-SEO-01");
  const clicsCtr = {
    senal: senalPorCambio(dClics, "sube"),
    titular: `Entraron ${n02(actual.clics)} personas desde Google sin pagar${dClics !== null ? ` (${dClics >= 0 ? "+" : "\u2212"}${pct4(dClics)} vs. ${mes === "el per\xEDodo anterior" ? "antes" : mes})` : ""}. De cada 100 que te ven, ${n02((actual.ctr ?? 0) * 100, 1)} hacen clic.`,
    detalle: dImp !== null && dCtr !== null && dImp > 0.1 && dCtr < -0.05 ? "Apareces en m\xE1s b\xFAsquedas nuevas, que todav\xEDa hacen menos clic: es lo normal cuando se ampl\xEDa el alcance." : void 0,
    accion: dCtr !== null && dCtr < -0.1 ? "Siguiente paso: mejorar t\xEDtulos y descripciones de las p\xE1ginas con m\xE1s impresiones para ganar m\xE1s clics." : void 0,
    respaldo: { contra, escenario: seo01?.verdict, ...confianza(actual.clics, "clics", 1e3, 150), medicion: "Clics y % que hace clic en la pr\xF3xima lectura." },
    que_es: "Cu\xE1ntas personas entraron a tu tienda desde Google org\xE1nico (barras) y qu\xE9 porcentaje de quienes te vieron hizo clic (l\xEDnea).",
    como_se_lee: "Los clics org\xE1nicos son visitas que no pagas. El % que hace clic depende de la posici\xF3n y de qu\xE9 tan atractivos son tu t\xEDtulo y descripci\xF3n."
  };
  const seo02 = esc("S-SEO-02");
  const sinMarca = consultas.filter((c) => !c.marca);
  const topNo = sinMarca[0];
  const crecio = sinMarca.filter((c) => c.actual.impresiones >= 500).map((c) => ({ c, d: c.actual.impresiones - (c.anterior?.impresiones ?? 0) })).sort((a, b) => b.d - a.d)[0];
  const minus = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const busq = {
    senal: seo02 ? "oportunidad" : "estable",
    titular: marca.peso_clics !== null ? `${Math.round(marca.peso_clics * 10)} de cada 10 clics vienen de gente que ya te conoce (busca tu marca).` : "Sin datos de b\xFAsquedas.",
    detalle: [
      topNo ? `La b\xFAsqueda sin marca con m\xE1s alcance es "${topNo.consulta}": ${n02(topNo.actual.impresiones)} impresiones en la posici\xF3n ${n02(topNo.actual.posicion, 1)}.` : "",
      crecio && crecio.c !== topNo && crecio.d > 0 ? `La que m\xE1s creci\xF3: "${crecio.c.consulta}" (de ${n02(crecio.c.anterior?.impresiones ?? 0)} a ${n02(crecio.c.actual.impresiones)} impresiones).` : ""
    ].filter(Boolean).join(" ") || void 0,
    accion: seo02 ? `Siguiente paso: ${minus(seo02.action ?? "reforzar esa p\xE1gina para llegar al top 3")}` : topNo ? `Siguiente paso: reforzar la p\xE1gina de "${topNo.consulta}" (contenido, enlaces internos) para subir al top 3.` : void 0,
    respaldo: { contra: `Mismos d\xEDas de ${mes}, b\xFAsqueda por b\xFAsqueda (sobre las b\xFAsquedas que Google muestra; oculta las an\xF3nimas).`, impacto: seo02?.verdict, ...confianza(actual.impresiones, "impresiones", 2e4, 3e3), medicion: "Posici\xF3n y clics de esa b\xFAsqueda a 28 d\xEDas (el SEO se mueve lento)." },
    que_es: "Las b\xFAsquedas por las que apareces, con su cambio vs. la comparaci\xF3n.",
    como_se_lee: "Las b\xFAsquedas de marca muestran cu\xE1nta gente ya te conoce; las sin marca muestran cu\xE1nto te encuentra gente nueva. Las sin marca cerca del top 3 son las de m\xE1s potencial."
  };
  const veredicto = {
    senal: senalPorCambio(dClics, "sube"),
    titular: clicsCtr.titular.split(". De cada")[0] + ".",
    detalle: seo02 ? `La oportunidad m\xE1s grande sin marca: ${seo02.verdict}.` : impPos.titular
  };
  return { desde, hasta, anterior_desde: ant?.[0] ?? null, anterior_hasta: ant?.[1] ?? null, dias, dias_anterior, actual, anterior, consultas, marca, lecturas: { impresiones_posicion: impPos, clics_ctr: clicsCtr, busquedas: busq }, veredicto };
}

// src/core/verdicts.ts
function adVerdict(config2, gasto, compras) {
  const u = config2.umbrales;
  if (compras === null) return "otro objetivo";
  if (gasto < (u.piso_gasto ?? 0)) return "aprendizaje";
  if (compras === 0) return gasto >= 2 * (u.cpa_techo ?? Infinity) ? "cortar" : "aprendizaje";
  const cpa = gasto / compras;
  if (u.cpa_objetivo && cpa <= u.cpa_objetivo) return "ganador";
  if (u.cpa_eficiencia && cpa <= u.cpa_eficiencia) return "eficiente";
  if (u.cpa_techo && cpa <= u.cpa_techo) return "vigilar";
  return u.cpa_techo ? "cortar" : "vigilar";
}
var META_REC_LECTURA = {
  budget_limited: "Subir presupuesto solo en conjuntos cuyo costo por compra est\xE9 bajo tu objetivo (ver galer\xEDa). M\xE1s presupuesto no arregla un anuncio que no vende.",
  scale_good_campaign: "Coincide con escalar ganadores; hazlo de a 20\u201330% para no reiniciar el aprendizaje.",
  fragmentation: "Consolidar conjuntos parecidos reduce la frecuencia: coincide con la saturaci\xF3n que detecta el motor.",
  value_optimization_goal: "Probar en una campa\xF1a, no en toda la cuenta: optimizar por valor puede bajar el volumen de compras.",
  reels_pc_recommendation: "Aplica si tienes video vertical 9:16 con audio; si no, no cambia nada.",
  product_set_boosting: "Bajo riesgo: deja que el cat\xE1logo muestre productos relacionados."
};

// src/core/metadash.ts
var ETIQUETA = {
  ganador: { t: "Para escalar", s: "potenciar" },
  eficiente: { t: "Rinde", s: "estable" },
  vigilar: { t: "En observaci\xF3n", s: "oportunidad" },
  cortar: { t: "Revisar", s: "oportunidad" },
  aprendizaje: { t: "Aprendiendo", s: "estable" },
  "otro objetivo": { t: "Otro objetivo", s: "estable" }
};
var div4 = (a, b) => b > 0 ? a / b : null;
function juntar3(rows, key, conv) {
  const porFila = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = `${key(r)}\0${r.date_from}\0${r.entity_id}`;
    if (!porFila.has(k)) porFila.set(k, /* @__PURE__ */ new Map());
    porFila.get(k).set(r.metric, r.currency ? conv(r) : r.value ?? 0);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, m] of porFila) {
    const g = k.split("\0")[0];
    if (!out.has(g)) out.set(g, { gasto: 0, compras: 0, valor: 0, impresiones: 0, ctrPond: 0, vistas: 0, carritos: 0, checkouts: 0 });
    const a = out.get(g), imp = m.get("impresiones") ?? 0;
    a.gasto += m.get("gasto") ?? 0;
    a.compras += m.get("compras_plataforma") ?? 0;
    a.valor += m.get("valor_compras_plataforma") ?? 0;
    a.impresiones += imp;
    a.ctrPond += (m.get("ctr") ?? 0) * imp;
    a.vistas += m.get("vistas_landing") ?? 0;
    a.carritos += m.get("carritos_plataforma") ?? 0;
    a.checkouts += m.get("checkouts_plataforma") ?? 0;
  }
  return out;
}
var tot3 = (a) => ({
  gasto: a.gasto,
  compras: a.compras,
  valor: a.valor,
  impresiones: a.impresiones,
  clics_ponderados: a.ctrPond,
  vistas: a.vistas,
  carritos: a.carritos,
  checkouts: a.checkouts,
  ctr: div4(a.ctrPond, a.impresiones),
  cpm: a.impresiones ? a.gasto / a.impresiones * 1e3 : null,
  cpa: div4(a.gasto, a.compras),
  roas: div4(a.valor, a.gasto)
});
var n03 = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
var pct5 = (v) => v === null ? "\u2014" : `${Math.round(Math.abs(v) * 100)}%`;
function metaDashboard(input) {
  const { config: config2, desde, hasta, anterior: ant } = input;
  const cur = config2.moneda_reporte;
  const money2 = (v) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${v.toLocaleString("es-CL", { maximumFractionDigits: 2 })} ${cur}`;
  const conv = (r) => toReport(config2, r.value ?? 0, r.currency, r.date_to);
  const m = input.series.filter((r) => r.source === "meta" && r.level === "account");
  const diaria = (a, b) => (r) => r.date_from === r.date_to && r.date_from >= a && r.date_from <= b;
  const act = m.filter(diaria(desde, hasta));
  if (!act.length) return null;
  const antD = ant ? m.filter(diaria(ant[0], ant[1])) : [];
  const porDia = (rows) => [...juntar3(rows, (r) => r.date_from, conv).entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([fecha2, a]) => ({ fecha: fecha2, ...tot3(a) }));
  const dias = porDia(act), dias_anterior = porDia(antD);
  const actual = tot3([...juntar3(act, () => "", conv).values()][0]);
  const anterior = antD.length ? tot3([...juntar3(antD, () => "", conv).values()][0]) : null;
  const cuenta = (rows, metric) => rows.find((r) => r.source === "meta" && r.level === "account" && r.metric === metric)?.value ?? null;
  const alcance = cuenta(input.rows, "alcance"), frecuencia = cuenta(input.rows, "frecuencia");
  const frecuencia_ant = ant ? cuenta(m.filter((r) => r.date_from === ant[0] && r.date_to === ant[1]), "frecuencia") : null;
  const embudo = [
    { paso: "Ven el anuncio", actual: actual.impresiones, anterior: anterior?.impresiones ?? null },
    { paso: "Llegan a la p\xE1gina", actual: actual.vistas, anterior: anterior?.vistas ?? null },
    { paso: "Agregan al carrito", actual: actual.carritos, anterior: anterior?.carritos ?? null },
    { paso: "Inician el pago", actual: actual.checkouts, anterior: anterior?.checkouts ?? null },
    { paso: "Compran", actual: actual.compras, anterior: anterior?.compras ?? null }
  ];
  const thumbs = /* @__PURE__ */ new Map();
  const cr = input.creativos?.ad_creatives ?? [];
  for (const c of cr) if (c.id) thumbs.set(String(c.id), { url: c.thumbnail_url ?? null, tipo: c.object_type ?? null });
  const patron = config2.nomenclatura_creativos?.patron ? new RegExp(config2.nomenclatura_creativos.patron) : null;
  const adRows = input.rows.filter((r) => r.source === "meta" && r.level === "ad");
  const porAd = /* @__PURE__ */ new Map();
  for (const r of adRows) porAd.set(r.entity_id, [...porAd.get(r.entity_id) ?? [], r]);
  const anuncios = [...porAd.entries()].map(([id, rs]) => {
    const v = (metric) => {
      const r = rs.find((x) => x.metric === metric);
      return r ? r.currency ? conv(r) : r.value : null;
    };
    const gasto = v("gasto") ?? 0, compras = rs.some((x) => x.metric === "compras_plataforma") ? v("compras_plataforma") : null, valor = v("valor_compras_plataforma") ?? 0;
    const nombre = rs[0].entity_name ?? id, creativeId = rs.find((x) => x.dims?.creative_id)?.dims?.creative_id;
    const th = creativeId ? thumbs.get(creativeId) : void 0;
    const tipoM = patron ? nombre.match(patron) : null;
    const veredicto2 = adVerdict(config2, gasto, compras);
    const imp = v("impresiones") ?? 0, p25 = v("video_p25");
    return {
      id,
      nombre,
      tipo: tipoM?.[1] ?? null,
      miniatura: th?.url ?? null,
      formato: th?.tipo ?? null,
      gasto,
      compras,
      cpa: compras ? gasto / compras : null,
      roas: gasto ? valor / gasto : null,
      ctr: v("ctr"),
      frecuencia: v("frecuencia"),
      retencion: p25 !== null && imp ? p25 / imp : null,
      veredicto: veredicto2,
      etiqueta: ETIQUETA[veredicto2].t,
      senal: ETIQUETA[veredicto2].s
    };
  }).filter((x) => x.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  const porTipo = /* @__PURE__ */ new Map();
  for (const a of anuncios) {
    if (!a.tipo) continue;
    const t = porTipo.get(a.tipo) ?? { anuncios: 0, gasto: 0, compras: 0 };
    t.anuncios++;
    t.gasto += a.gasto;
    t.compras += a.compras ?? 0;
    porTipo.set(a.tipo, t);
  }
  const tipos = [...porTipo.entries()].map(([tipo, t]) => ({ tipo, ...t, cpa: div4(t.gasto, t.compras) })).sort((a, b) => b.gasto - a.gasto);
  const mes = nombreComparacion(ant);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const vsMes = mes === "el per\xEDodo anterior" ? "antes" : mes;
  const contra = `Mismos d\xEDas de ${mes}`;
  const obj = config2.umbrales.cpa_objetivo ?? null;
  const signo = (v) => v === null ? "" : ` (${v >= 0 ? "+" : "\u2212"}${pct5(v)} vs. ${vsMes})`;
  const dG = cambio(actual.gasto, anterior?.gasto), dC = cambio(actual.compras, anterior?.compras);
  const dEfi = cambio(div4(actual.compras, actual.gasto), anterior ? div4(anterior.compras, anterior.gasto) : null);
  const peso = input.pedidosTienda ? actual.compras / input.pedidosTienda : null;
  const invCompras = {
    senal: senalPorCambio(dEfi, "sube"),
    titular: `Invertiste ${money2(actual.gasto)} en Meta${signo(dG)} y Meta registr\xF3 ${n03(actual.compras)} compras${signo(dC)}.`,
    detalle: dEfi !== null && Math.abs(dEfi) >= 0.1 ? `Cada peso trajo ${dEfi > 0 ? "m\xE1s" : "menos"} compras que ${enMes} (${pct5(dEfi)} ${dEfi > 0 ? "m\xE1s" : "menos"}).` : void 0,
    respaldo: { contra: `${contra} (l\xEDnea punteada).`, ...confianza(actual.compras, "compras atribuidas", 300, 60), medicion: "Compras por cada $100.000 invertidos en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto invertiste en Meta cada d\xEDa (barras) y cu\xE1ntas compras registr\xF3 Meta (l\xEDnea).",
    como_se_lee: "Si las barras suben y la l\xEDnea no, cada compra se est\xE1 encareciendo. Meta registra con su propia medici\xF3n (ver respaldo del costo por compra)."
  };
  const dCpa = cambio(actual.cpa, anterior?.cpa);
  const cercaMeta = obj !== null && actual.cpa !== null && actual.cpa <= obj * 1.15;
  const semCpa = actual.cpa === null ? "estable" : obj && actual.cpa <= obj ? "potenciar" : dCpa !== null && dCpa <= -0.1 && cercaMeta ? "potenciar" : "oportunidad";
  const costo = {
    senal: semCpa,
    titular: dCpa !== null && dCpa <= -0.1 ? `Cada compra atribuida a Meta cost\xF3 ${money2(actual.cpa)}, ${pct5(dCpa)} menos que ${enMes} (${money2(anterior.cpa)})${obj ? actual.cpa <= obj ? `, bajo tu meta de ${money2(obj)}` : cercaMeta ? `, y ya cerca de tu meta de ${money2(obj)}` : `; tu meta es ${money2(obj)}` : ""}.` : `Cada compra atribuida a Meta cost\xF3 ${money2(actual.cpa)}${obj ? actual.cpa !== null && actual.cpa <= obj ? `, bajo tu meta de ${money2(obj)}` : ` (tu meta: ${money2(obj)})` : ""}${dCpa !== null ? `; ${enMes}, ${money2(anterior.cpa)}` : ""}.`,
    detalle: peso !== null ? `Meta se atribuye ${Math.round(peso * 10)} de cada 10 pedidos de la tienda (con su propia medici\xF3n, que cuenta a quien vio o hizo clic en un anuncio).` : void 0,
    accion: obj && actual.cpa !== null && actual.cpa > obj ? "Siguiente paso: mover inversi\xF3n hacia los anuncios que ya venden bajo la meta (filtro Para escalar en la galer\xEDa)." : semCpa === "potenciar" ? "Siguiente paso: hay espacio para escalar la inversi\xF3n en los anuncios marcados Para escalar." : void 0,
    respaldo: { contra: [obj ? `Tu meta de ${money2(obj)} por compra` : null, input.costoPedidoMax ? `el m\xE1ximo para no perder (${money2(input.costoPedidoMax)}, ver Resumen)` : null, contra].filter(Boolean).join(", ") + ".", ...confianza(actual.compras, "compras atribuidas", 300, 60), medicion: "Costo por compra de Meta en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto cost\xF3 cada compra que Meta registr\xF3, d\xEDa a d\xEDa, frente a tu meta.",
    como_se_lee: "Por debajo de la l\xEDnea de la meta, cada peso rinde. Los d\xEDas con pocas compras hacen picos; mira la tendencia."
  };
  const dCpm = cambio(actual.cpm, anterior?.cpm), dCtr = cambio(actual.ctr, anterior?.ctr);
  const cpmCtr = {
    senal: dCtr !== null && dCtr < -0.1 ? "oportunidad" : dCpm !== null && dCpm > 0.15 ? "oportunidad" : senalPorCambio(dCtr, "sube"),
    titular: `Llegar a 1.000 personas cuesta ${money2(actual.cpm)}${signo(dCpm)}; de cada 100 que ven un anuncio, ${n03((actual.ctr ?? 0) * 100, 2)} hacen clic${signo(dCtr)}.`,
    detalle: frecuencia !== null ? `Cada persona vio tus anuncios ${n03(frecuencia, 1)} veces en promedio${frecuencia_ant !== null ? ` (${enMes}, ${n03(frecuencia_ant, 1)})` : ""}.` : void 0,
    accion: dCtr !== null && dCtr < -0.1 ? "Siguiente paso: renovar creativos: menos clics con la misma audiencia suele ser desgaste de las piezas." : dCpm !== null && dCpm > 0.15 ? "Siguiente paso: la subasta est\xE1 m\xE1s cara; sumar creativos nuevos ayuda a bajar el costo de llegar." : void 0,
    respaldo: { contra: `${contra}.`, ...confianza(actual.impresiones, "impresiones", 2e5, 3e4), medicion: "Costo por mil y % de clics en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto cuesta mostrar tus anuncios a 1.000 personas (l\xEDnea) y qu\xE9 porcentaje hace clic (l\xEDnea).",
    como_se_lee: "El costo por mil depende de la competencia en la subasta; el % de clics, de qu\xE9 tan atractivo es el creativo. Si baja el clic con la misma frecuencia, las piezas se est\xE1n gastando."
  };
  const tasas = embudo.slice(1).map((e, i) => ({ paso: e.paso, a: div4(e.actual, embudo[i].actual), p: e.anterior !== null && embudo[i].anterior ? div4(e.anterior, embudo[i].anterior) : null }));
  const peor = tasas.map((t) => ({ ...t, d: cambio(t.a, t.p) })).filter((t) => t.d !== null && t.paso !== "Llegan a la p\xE1gina").sort((a, b) => a.d - b.d)[0];
  const emb = {
    senal: peor && peor.d < -0.1 ? "oportunidad" : "estable",
    titular: `De quienes llegan a la p\xE1gina desde Meta, ${n03((div4(actual.carritos, actual.vistas) ?? 0) * 100, 1)} de cada 100 agregan al carrito y ${n03((div4(actual.compras, actual.vistas) ?? 0) * 100, 1)} compran.`,
    detalle: peor && peor.d < -0.1 ? `El paso que m\xE1s cambi\xF3: "${peor.paso.toLowerCase()}" (${pct5(peor.d)} menos que ${enMes}).` : void 0,
    accion: peor && peor.d < -0.1 ? "Siguiente paso: revisar que la p\xE1gina a la que llega cada anuncio contin\xFAe su promesa (mismo producto, oferta y mensaje)." : void 0,
    respaldo: { contra: `${contra}; embudo seg\xFAn la medici\xF3n de Meta.`, ...confianza(actual.vistas, "visitas a la p\xE1gina", 3e3, 500), medicion: "Las mismas proporciones en la pr\xF3xima lectura." },
    que_es: "El recorrido desde que alguien ve un anuncio hasta que compra, seg\xFAn Meta.",
    como_se_lee: "Si mucha gente llega pero poca agrega al carrito, la p\xE1gina no contin\xFAa lo que prometi\xF3 el anuncio."
  };
  const escalar = anuncios.filter((a) => a.veredicto === "ganador");
  const comprasEsc = escalar.reduce((s, a) => s + (a.compras ?? 0), 0);
  const mejor = [...anuncios].filter((a) => a.compras && a.compras >= 5 && a.cpa !== null).sort((a, b) => a.cpa - b.cpa)[0];
  const tipoMejor = tipos.filter((t) => t.compras >= 5 && t.cpa !== null).sort((a, b) => a.cpa - b.cpa)[0];
  const revisar = anuncios.filter((a) => a.veredicto === "cortar");
  const creat = {
    senal: escalar.length ? "potenciar" : "oportunidad",
    titular: escalar.length ? `${escalar.length} ${escalar.length === 1 ? "anuncio est\xE1" : "anuncios est\xE1n"} para escalar: venden bajo tu meta y juntan ${n03(comprasEsc)} de las ${n03(actual.compras)} compras.` : "Ning\xFAn anuncio vende todav\xEDa bajo tu meta de costo por compra.",
    detalle: [
      mejor ? `El que mejor rinde es "${mejor.nombre}" (${money2(mejor.cpa)} por compra).` : "",
      tipoMejor && tipos.length > 1 ? `Por tipo de pieza, ${tipoMejor.tipo} vende al menor costo (${money2(tipoMejor.cpa)}).` : "",
      revisar.length ? revisar.length === 1 ? "1 anuncio conviene revisarlo: gasta sin llegar a la meta." : `${revisar.length} anuncios conviene revisarlos: gastan sin llegar a la meta.` : ""
    ].filter(Boolean).join(" ") || void 0,
    accion: mejor ? `Siguiente paso: producir la pr\xF3xima ronda de contenido con el formato y el \xE1ngulo de "${mejor.nombre}": el creativo es la palanca que m\xE1s mueve los resultados.` : "Siguiente paso: probar nuevos \xE1ngulos y formatos: el creativo es la palanca que m\xE1s mueve los resultados.",
    respaldo: { contra: obj ? `Tu meta de ${money2(obj)} por compra; los anuncios con menos de ${money2(config2.umbrales.piso_gasto ?? 0)} invertidos se marcan Aprendiendo.` : "Costo por compra de cada anuncio.", ...confianza(actual.compras, "compras atribuidas", 300, 60), medicion: "Costo por compra de cada anuncio a 14 d\xEDas." },
    que_es: "Cada anuncio con su miniatura, inversi\xF3n, compras, costo por compra y su se\xF1al.",
    como_se_lee: "Para escalar = vende bajo tu meta. Rinde = cerca de la meta. En observaci\xF3n y Revisar = lejos de la meta. Aprendiendo = todav\xEDa sin inversi\xF3n suficiente para juzgar."
  };
  const veredicto = { senal: semCpa, titular: costo.titular, detalle: creat.titular };
  return {
    desde,
    hasta,
    anterior_desde: ant?.[0] ?? null,
    anterior_hasta: ant?.[1] ?? null,
    dias,
    dias_anterior,
    actual,
    anterior,
    alcance,
    frecuencia,
    frecuencia_ant,
    embudo,
    anuncios: anuncios.slice(0, 40),
    tipos,
    peso_atribuido: peso,
    lecturas: { inversion_compras: invCompras, costo_compra: costo, cpm_ctr: cpmCtr, embudo: emb, creativos: creat },
    veredicto
  };
}

// src/core/ventasdash.ts
var METS = ["ventas_total", "ventas_brutas", "descuentos", "pedidos", "clientes_nuevos", "clientes_recurrentes"];
var n04 = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
var pct6 = (v) => v === null ? "\u2014" : `${Math.round(Math.abs(v) * 100)}%`;
var DIAS2 = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
function ventasDashboard(input) {
  const { config: config2, desde, hasta, anterior: ant, kpis: k, kpisAnt: kp } = input;
  const cur = config2.moneda_reporte;
  const money2 = (v) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${v.toLocaleString("es-CL", { maximumFractionDigits: 0 })} ${cur}`;
  const conv = (r) => r.currency ? toReport(config2, r.value ?? 0, r.currency, r.date_to) : r.value ?? 0;
  const store = input.series.filter((r) => (r.source === "shopify" || r.source === "tiendanube") && r.level === "store" && r.date_from === r.date_to && !r.dims?.hora);
  const porDia = (a, b) => {
    const m = /* @__PURE__ */ new Map();
    for (const r of store.filter((x) => x.date_from >= a && x.date_from <= b && METS.includes(x.metric))) {
      const o = m.get(r.date_from) ?? {};
      o[r.metric] = (o[r.metric] ?? 0) + conv(r);
      m.set(r.date_from, o);
    }
    return [...m.entries()].sort(([x], [y]) => x < y ? -1 : 1).map(([fecha2, o]) => ({
      fecha: fecha2,
      venta: o.ventas_total ?? 0,
      bruta: o.ventas_brutas ?? 0,
      descuentos: o.descuentos ?? 0,
      pedidos: o.pedidos ?? 0,
      nuevos: o.clientes_nuevos ?? 0,
      recurrentes: o.clientes_recurrentes ?? 0
    }));
  };
  const dias = porDia(desde, hasta);
  if (!dias.length) return null;
  const dias_anterior = ant ? porDia(ant[0], ant[1]) : [];
  const mes = nombreComparacion(ant);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const vsMes = mes === "el per\xEDodo anterior" ? "antes" : mes;
  const contra = `Mismos d\xEDas de ${mes}`;
  const bruta = k.ventas_brutas ?? 0, desc = k.descuentos ?? 0, neta = bruta - desc;
  const cogsPct = config2.costos.cogs_pct_default ?? null, com = config2.costos.comision_pct ?? 0, envio = (config2.costos.envio_por_pedido ?? 0) * (k.pedidos ?? 0);
  const inv = k.gasto_ads ?? 0;
  const cascada = [
    { paso: "Venta bruta", valor: bruta, tipo: "base" },
    { paso: "Descuentos", valor: desc, tipo: "resta" },
    { paso: "Venta neta", valor: neta, tipo: "total" },
    ...cogsPct !== null ? [{ paso: "Costo de producto", valor: neta * cogsPct, tipo: "resta" }] : [],
    ...com ? [{ paso: "Comisiones", valor: neta * com, tipo: "resta" }] : [],
    ...envio ? [{ paso: "Env\xEDos", valor: envio, tipo: "resta" }] : [],
    { paso: "Publicidad", valor: inv, tipo: "resta" },
    ...cogsPct !== null ? [{ paso: "Lo que queda", valor: neta * (1 - cogsPct - com) - envio - inv, tipo: "total" }] : []
  ];
  const queda = cogsPct !== null ? neta * (1 - cogsPct - com) - envio - inv : null;
  const cascada_supuesto = cogsPct === null ? "Falta el costo de producto para calcular lo que queda." : config2.costos.validado ? null : `Costo de producto ${Math.round(cogsPct * 100)}% (estimado, falta validarlo).`;
  const prodRows = (a, b, s) => {
    const m = /* @__PURE__ */ new Map();
    for (const r of s.filter((x) => x.source === "shopify" && x.level === "product" && x.date_from === a && x.date_to === b)) {
      const o = m.get(r.entity_id) ?? { venta: 0, pedidos: 0 };
      if (r.metric === "ventas_total") o.venta += conv(r);
      if (r.metric === "pedidos") o.pedidos += r.value ?? 0;
      m.set(r.entity_id, o);
    }
    return m;
  };
  const pAct = prodRows(desde, hasta, input.rows), pAnt = ant ? prodRows(ant[0], ant[1], input.series) : /* @__PURE__ */ new Map();
  const totalP = [...pAct.values()].reduce((s, x) => s + x.venta, 0);
  const productos = [...pAct.entries()].map(([nombre, x]) => ({ nombre, venta: x.venta, pedidos: x.pedidos, peso: totalP ? x.venta / totalP : 0, venta_ant: pAnt.get(nombre)?.venta ?? null })).filter((x) => x.venta > 0).sort((a, b) => b.venta - a.venta);
  const dV = cambio(k.ventas_total, kp?.ventas_total), dP = cambio(k.pedidos, kp?.pedidos);
  const mejor = dias.reduce((m, d2) => d2.venta > m.venta ? d2 : m, dias[0]);
  const diaria = {
    senal: senalPorCambio(dV, "sube"),
    titular: `Vendiste ${money2(k.ventas_total)}${dV !== null ? ` (${dV >= 0 ? "+" : "\u2212"}${pct6(dV)} vs. ${vsMes})` : ""} en ${n04(k.pedidos)} pedidos${dP === null ? "" : Math.abs(dP) < 0.01 ? ` (igual que ${enMes})` : ` (${dP >= 0 ? "+" : "\u2212"}${pct6(dP)})`}.`,
    detalle: `El mejor d\xEDa fue el ${DIAS2[(/* @__PURE__ */ new Date(`${mejor.fecha}T12:00:00Z`)).getUTCDay()]} ${Number(mejor.fecha.slice(8, 10))} con ${money2(mejor.venta)}.`,
    respaldo: { contra: `${contra} (l\xEDnea punteada). Venta total de la tienda (el mismo n\xFAmero que muestra Shopify).`, ...confianza(k.pedidos, "pedidos", 300, 60), medicion: "Venta y pedidos en la pr\xF3xima lectura." },
    que_es: "La venta de cada d\xEDa (barras) y la del mismo d\xEDa del per\xEDodo de comparaci\xF3n (l\xEDnea punteada).",
    como_se_lee: "Los picos suelen coincidir con env\xEDos de email, lanzamientos o campa\xF1as. Compara la forma de las dos curvas, no solo el total."
  };
  const dDesc = kp?.descuentos_pct !== void 0 && kp?.descuentos_pct !== null && k.descuentos_pct !== null ? k.descuentos_pct - kp.descuentos_pct : null;
  const cascadaL = {
    senal: dDesc !== null && dDesc > 0.03 ? "oportunidad" : queda !== null && queda > 0 ? "potenciar" : "estable",
    titular: queda !== null && bruta ? `De cada $100 que vendes (antes de descuentos), quedan ~$${Math.round(queda / bruta * 100)} despu\xE9s de descuentos, producto y publicidad.` : `Los descuentos fueron ${pct6(k.descuentos_pct)} de la venta bruta.`,
    detalle: `Los descuentos fueron ${pct6(k.descuentos_pct)} de la venta bruta${kp?.descuentos_pct != null ? ` (${enMes}, ${pct6(kp.descuentos_pct)})` : ""}.`,
    accion: dDesc !== null && dDesc > 0.03 ? "Siguiente paso: revisar qu\xE9 descuentos se usaron m\xE1s (cupones, packs, env\xEDo gratis): subir el descuento sin subir los pedidos achica lo que queda." : void 0,
    respaldo: { contra: `Econom\xEDa del negocio${cascada_supuesto ? `. ${cascada_supuesto}` : ""}`, ...confianza(k.pedidos, "pedidos", 300, 60), medicion: "Lo que queda por cada $100 en la pr\xF3xima lectura." },
    que_es: "C\xF3mo se reparte la venta: descuentos, costo de producto, publicidad y lo que queda.",
    como_se_lee: "Cada barra que baja es un costo; la \xFAltima es lo que queda para el negocio. Es la forma m\xE1s directa de ver si crecer est\xE1 dejando plata."
  };
  const nA = dias.reduce((s, d2) => s + d2.nuevos, 0), rA = dias.reduce((s, d2) => s + d2.recurrentes, 0);
  const nP = dias_anterior.reduce((s, d2) => s + d2.nuevos, 0), rP = dias_anterior.reduce((s, d2) => s + d2.recurrentes, 0);
  const pesoR = nA + rA ? rA / (nA + rA) : null, pesoRP = nP + rP ? rP / (nP + rP) : null;
  const dN = cambio(nA, nP || null);
  const clientes = {
    senal: senalPorCambio(dN, "sube"),
    titular: `Compraron ${n04(nA)} clientes nuevos${dN !== null ? ` (${dN >= 0 ? "+" : "\u2212"}${pct6(dN)} vs. ${vsMes})` : ""} y ${n04(rA)} que ya hab\xEDan comprado.`,
    detalle: pesoR !== null ? `${Math.round(pesoR * 10)} de cada 10 compradores ya eran clientes${pesoRP !== null ? ` (${enMes}, ${Math.round(pesoRP * 10)})` : ""}.` : void 0,
    accion: pesoR !== null && pesoR < 0.3 ? "Siguiente paso: activar la recompra (flows de reposici\xF3n y post-compra en Email): hoy casi toda la venta depende de conseguir clientes nuevos." : void 0,
    respaldo: { contra: `${contra}.`, ...confianza(nA + rA, "compradores", 300, 60), medicion: "Clientes nuevos y peso de los que vuelven en la pr\xF3xima lectura." },
    que_es: "Cu\xE1ntos compradores de cada d\xEDa eran nuevos y cu\xE1ntos ya hab\xEDan comprado antes.",
    como_se_lee: "Los nuevos muestran cu\xE1nto est\xE1 creciendo la base; los que vuelven, qu\xE9 tan fiel es. Un negocio sano sube los dos."
  };
  const top = productos[0];
  const crecio = productos.filter((p) => p.venta_ant !== null && p.venta >= totalP * 0.02).map((p) => ({ p, d: cambio(p.venta, p.venta_ant) })).filter((x) => x.d !== null).sort((a, b) => b.d - a.d)[0];
  const nuevo2 = productos.find((p) => p.venta_ant === null && p.venta >= totalP * 0.03);
  const prods = top ? {
    senal: crecio && crecio.d > 0.2 ? "potenciar" : "estable",
    titular: `"${top.nombre}" es tu producto que m\xE1s vende: ${Math.round(top.peso * 100)}% de la venta.`,
    detalle: [
      crecio && crecio.d > 0.2 ? `El que m\xE1s creci\xF3: "${crecio.p.nombre}" (+${pct6(crecio.d)} vs. ${vsMes}).` : "",
      nuevo2 ? `Nuevo en el ranking: "${nuevo2.nombre}" (${money2(nuevo2.venta)}).` : ""
    ].filter(Boolean).join(" ") || void 0,
    accion: crecio && crecio.d > 0.2 ? `Siguiente paso: darle m\xE1s espacio a "${crecio.p.nombre}" en la pauta y en el email, y producir contenido de ese producto.` : void 0,
    respaldo: { contra: `${contra}, producto por producto (50 m\xE1s vendidos).`, ...confianza(k.pedidos, "pedidos", 300, 60), medicion: "Venta por producto en la pr\xF3xima lectura." },
    que_es: "Los productos que m\xE1s venden, con su cambio frente a la comparaci\xF3n.",
    como_se_lee: "Mira qu\xE9 productos crecen para darles m\xE1s espacio, y si uno solo concentra demasiado la venta (dependencia)."
  } : { senal: "estable", titular: "Sin datos de productos.", respaldo: { contra, confianza: "baja", confianza_motivo: "sin datos", medicion: "\u2014" }, que_es: "", como_se_lee: "" };
  const veredicto = { senal: diaria.senal, titular: diaria.titular, detalle: cascadaL.titular };
  return { desde, hasta, anterior_desde: ant?.[0] ?? null, anterior_hasta: ant?.[1] ?? null, dias, dias_anterior, cascada, cascada_supuesto, productos: productos.slice(0, 30), lecturas: { diaria, cascada: cascadaL, clientes, productos: prods }, veredicto };
}

// src/core/emaildash.ts
var pct7 = (v) => v === null ? "\u2014" : `${Math.round(Math.abs(v) * 100)}%`;
var n05 = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
function emailDashboard(input) {
  const { config: config2, desde, hasta, anterior: ant, block } = input;
  const cur = config2.moneda_reporte;
  const money2 = (v) => v === null ? "\u2014" : cur === "CLP" ? `$${Math.round(v).toLocaleString("es-CL")}` : `${v.toLocaleString("es-CL", { maximumFractionDigits: 0 })} ${cur}`;
  const val = (r) => r.currency ? toReport(config2, r.value ?? 0, r.currency, r.date_to) : r.value ?? 0;
  const k = input.series.filter((r) => r.source === "klaviyo" && (r.level === "flow" || r.level === "message"));
  const campIds = new Set((input.campanasActuales?.data ?? []).map((c) => c.id));
  const campIdsAnt = new Set((input.campanasAnt?.data ?? []).map((c) => c.id));
  const esCamp = (r, ids) => r.level === "message" && ids.has(r.entity_id);
  const diarias = k.filter((r) => r.date_from === r.date_to && r.date_from >= desde && r.date_from <= hasta);
  if (!diarias.length) return null;
  const m = /* @__PURE__ */ new Map();
  for (const r of diarias) {
    const d2 = m.get(r.date_from) ?? { fecha: r.date_from, flows: 0, campanas: 0, pedidos: 0, venta_tienda: null };
    if (r.metric === "ingreso_email") {
      if (r.level === "flow") d2.flows += val(r);
      else if (esCamp(r, campIds)) d2.campanas += val(r);
    }
    if (r.metric === "pedidos_email" && (r.level === "flow" || esCamp(r, campIds))) d2.pedidos += r.value ?? 0;
    m.set(r.date_from, d2);
  }
  for (const v of input.ventaDiaria ?? []) {
    const d2 = m.get(v.fecha);
    if (d2) d2.venta_tienda = v.venta;
  }
  const dias = [...m.values()].sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const sumD = (f) => dias.reduce((s, d2) => s + f(d2), 0);
  const actual = { flows: sumD((d2) => d2.flows), campanas: sumD((d2) => d2.campanas), total: 0, pedidos: sumD((d2) => d2.pedidos), peso: null };
  actual.total = actual.flows + actual.campanas;
  actual.peso = input.ventaTienda ? actual.total / input.ventaTienda : null;
  let anterior = null;
  const flowsAnt = /* @__PURE__ */ new Map();
  if (ant) {
    const rs = k.filter((r) => r.date_from === ant[0] && r.date_to === ant[1]);
    if (rs.length) {
      const a = { flows: 0, campanas: 0, total: 0, pedidos: 0, peso: null };
      for (const r of rs) {
        if (r.metric === "ingreso_email") {
          if (r.level === "flow") {
            a.flows += val(r);
            flowsAnt.set(r.entity_id, (flowsAnt.get(r.entity_id) ?? 0) + val(r));
          } else if (esCamp(r, campIdsAnt)) a.campanas += val(r);
        }
        if (r.metric === "pedidos_email" && (r.level === "flow" || esCamp(r, campIdsAnt))) a.pedidos += r.value ?? 0;
      }
      a.total = a.flows + a.campanas;
      a.peso = input.ventaTiendaAnt ? a.total / input.ventaTiendaAnt : null;
      anterior = a;
    }
  }
  const flows = block.flows.filter((f) => f.ingreso > 0 || f.estado === "live").map((f) => ({ ...f, ingreso_ant: ant ? flowsAnt.get(f.id) ?? 0 : null }));
  const altas = (() => {
    const s = /* @__PURE__ */ new Map();
    for (const l of block.altas) for (const w of l.semanas) s.set(w.desde, (s.get(w.desde) ?? 0) + w.altas);
    return [...s.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([semana, altas2]) => ({ semana, altas: altas2, parcial: false }));
  })();
  const mes = nombreComparacion(ant);
  const enMes = mes === "el per\xEDodo anterior" ? mes : `en ${mes}`;
  const vsMes = mes === "el per\xEDodo anterior" ? "antes" : mes;
  const contra = `Mismos d\xEDas de ${mes}`;
  const esc = (id) => input.escenarios?.find((e) => e.scenario === id);
  const dT = cambio(actual.total, anterior?.total);
  const pico = dias.reduce((x, d2) => d2.campanas > x.campanas ? d2 : x, dias[0]);
  const diaria = {
    senal: senalPorCambio(dT, "sube"),
    titular: `El email trajo ${money2(actual.total)}${dT !== null ? ` (${dT >= 0 ? "+" : "\u2212"}${pct7(dT)} vs. ${vsMes})` : ""}: ${actual.peso !== null ? `${n05(actual.peso * 100, 0)} de cada 100 pesos` : "parte"} de la venta de la tienda.`,
    detalle: `${actual.total ? Math.round(actual.flows / actual.total * 100) : 0}% vino de flows autom\xE1ticos y ${actual.total ? Math.round(actual.campanas / actual.total * 100) : 0}% de campa\xF1as.${pico.campanas > 0 ? ` El d\xEDa que m\xE1s vendieron las campa\xF1as fue el ${Number(pico.fecha.slice(8, 10))} (${money2(pico.campanas)}).` : ""}`,
    respaldo: { contra: `${contra}. Venta atribuida por Klaviyo (quien abri\xF3 o hizo clic en un email antes de comprar).`, ...confianza(actual.pedidos, "pedidos atribuidos", 150, 30), medicion: "Venta por email y su peso sobre la venta de la tienda en la pr\xF3xima lectura." },
    que_es: "Cu\xE1nto vendi\xF3 el email cada d\xEDa: flows autom\xE1ticos y campa\xF1as (barras apiladas), frente a la venta total de la tienda (l\xEDnea).",
    como_se_lee: "Los flows venden solos todos los d\xEDas; las campa\xF1as hacen picos el d\xEDa del env\xEDo. Un email sano aporta entre 20 y 30 de cada 100 pesos de la venta."
  };
  const topF = flows[0];
  const faltan = block.checklist.filter((c) => c.estado !== "activo");
  const e02 = esc("S-EMAIL-02") ?? esc("S-EMAIL-03");
  const flowsL = {
    senal: faltan.length ? "oportunidad" : "potenciar",
    titular: topF ? `"${topF.nombre}" es el flow que m\xE1s vende: ${money2(topF.ingreso)}${topF.ingreso_ant ? ` (${enMes}, ${money2(topF.ingreso_ant)})` : ""}.` : "Sin flows con venta en el per\xEDodo.",
    detalle: faltan.length ? `${faltan.length === 1 ? "Un flow clave" : `${faltan.length} flows clave`} sin activar: ${faltan.map((c) => `${c.nombre.toLowerCase()}${c.estado === "borrador" ? " (est\xE1 en borrador)" : ""}`).join(", ")}.` : "Los 5 flows clave est\xE1n activos.",
    accion: faltan.length ? `Siguiente paso: activar ${faltan[0].nombre.toLowerCase()}: es venta que llega sola, sin inversi\xF3n extra.` : void 0,
    respaldo: { contra: `${contra}, flow por flow. Checklist de los 5 flows que toda tienda deber\xEDa tener.`, escenario: e02?.verdict, ...confianza(actual.pedidos, "pedidos atribuidos", 150, 30), medicion: "Venta de flows a 28 d\xEDas de activar el flow." },
    que_es: "Cu\xE1nto vendi\xF3 cada flow autom\xE1tico, con su cambio, y qu\xE9 flows clave faltan.",
    como_se_lee: "Los flows (bienvenida, carrito, navegaci\xF3n, postcompra, recompra) venden todos los d\xEDas sin trabajo extra: son lo primero a tener completo."
  };
  const campAct = block.campanas;
  const mejorC = campAct[0];
  const dC = cambio(actual.campanas, anterior?.campanas);
  const campL = {
    senal: senalPorCambio(dC, "sube"),
    titular: campAct.length ? `Las campa\xF1as vendieron ${money2(actual.campanas)} en ${campAct.length} env\xEDos${dC !== null ? ` (${dC >= 0 ? "+" : "\u2212"}${pct7(dC)} vs. ${vsMes})` : ""}.` : "Sin campa\xF1as con venta atribuida en el per\xEDodo.",
    detalle: mejorC ? `La que m\xE1s vendi\xF3: "${mejorC.nombre}" (${money2(mejorC.ingreso)}, ${n05(mejorC.pedidos)} pedidos).` : void 0,
    accion: mejorC ? `Siguiente paso: repetir el \xE1ngulo y la oferta de "${mejorC.nombre}" en la pr\xF3xima campa\xF1a (el contenido es la palanca).` : void 0,
    respaldo: { contra: `${contra}.`, ...confianza(actual.pedidos, "pedidos atribuidos", 150, 30), medicion: "Venta por campa\xF1a en la pr\xF3xima lectura." },
    que_es: "Las campa\xF1as enviadas en el per\xEDodo y cu\xE1nto vendi\xF3 cada una.",
    como_se_lee: "Compara qu\xE9 asuntos, ofertas o temas vendieron m\xE1s para repetir lo que funciona."
  };
  const fin = (w) => {
    const d2 = /* @__PURE__ */ new Date(`${w}T12:00:00Z`);
    d2.setUTCDate(d2.getUTCDate() + 6);
    return d2.toISOString().slice(0, 10);
  };
  for (const w of altas) w.parcial = fin(w.semana) > hasta;
  const completas = altas.filter((w) => !w.parcial);
  const ult = completas.slice(-1)[0], prom = completas.length > 1 ? completas.slice(0, -1).reduce((s, w) => s + w.altas, 0) / (completas.length - 1) : null;
  const e01 = esc("S-EMAIL-01");
  const listaL = {
    senal: e01 ? "oportunidad" : ult && prom !== null ? senalPorCambio(cambio(ult.altas, prom), "sube", 0.2) : "estable",
    titular: altas.length ? `Se sumaron ${n05(altas.reduce((s, w) => s + w.altas, 0))} personas a tus listas en ${altas.length} semanas.` : "Sin datos de altas a la lista.",
    detalle: ult && prom !== null ? `La \xFAltima semana completa entraron ${n05(ult.altas)} (el promedio de las anteriores fue ${n05(prom)}).` : void 0,
    accion: e01 ? `Siguiente paso: ${e01.action ? e01.action.charAt(0).toLowerCase() + e01.action.slice(1) : "revisar el formulario de captura de la tienda"}` : void 0,
    respaldo: { contra: "Promedio de las semanas anteriores.", escenario: e01?.verdict, ...confianza(altas.reduce((s, w) => s + w.altas, 0), "altas", 500, 100), medicion: "Altas por semana." },
    que_es: "Cu\xE1ntas personas se suman cada semana a tus listas de email.",
    como_se_lee: "La lista es el activo que el email convierte en venta: si deja de crecer, las campa\xF1as llegan cada vez a los mismos."
  };
  const veredicto = { senal: diaria.senal, titular: diaria.titular, detalle: faltan.length ? flowsL.detalle : campL.titular };
  return {
    desde,
    hasta,
    anterior_desde: ant?.[0] ?? null,
    anterior_hasta: ant?.[1] ?? null,
    dias,
    actual,
    anterior,
    flows,
    campanas: campAct.slice(0, 15),
    checklist: block.checklist,
    altas,
    lecturas: { diaria, flows: flowsL, campanas: campL, lista: listaL },
    veredicto
  };
}

// src/core/compdash.ts
function parse(raw) {
  const r = raw?.results;
  const o = typeof r === "string" ? JSON.parse(r) : r;
  return { total: o?.estimated_total_count ?? null, ads: o?.ads ?? [] };
}
var n06 = (v) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: 0 });
function compDashboard(input) {
  const { config: config2, capturado } = input;
  const cfg = config2.competencia;
  if (!cfg || !input.raws.length) return null;
  const monedas = /* @__PURE__ */ new Set([config2.moneda_reporte, ...config2.tiendas.map((t) => t.moneda), "USD"]);
  const marca = config2.marca_reporte.nombre.toLowerCase();
  const excluir = new Set((cfg.excluir_paginas ?? []).map(String));
  const seguidos = new Set(config2.competidores.flatMap((c) => [c.nombre.toLowerCase(), ...c.pagina_meta ? [String(c.pagina_meta).toLowerCase()] : []]));
  const ahora = Date.parse(capturado) / 1e3;
  const dias = (a) => a.ad_delivery_start_time ? Math.max(0, Math.floor((ahora - a.ad_delivery_start_time) / 86400)) : null;
  let total = null, descartados = 0;
  const vistos = /* @__PURE__ */ new Set();
  const ads = [];
  for (const raw of [...input.raws, ...input.rawCompetidores !== void 0 ? [input.rawCompetidores] : []]) {
    const p = parse(raw);
    if (raw !== input.rawCompetidores) total = (total ?? 0) + (p.total ?? 0);
    for (const a of p.ads) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      if (a.currency && !monedas.has(a.currency)) {
        descartados++;
        continue;
      }
      ads.push(a);
    }
  }
  const esPropia = (a) => excluir.has(String(a.page_id)) || a.page_name.toLowerCase().includes(marca);
  const porPagina = /* @__PURE__ */ new Map();
  for (const a of ads) porPagina.set(String(a.page_id), [...porPagina.get(String(a.page_id)) ?? [], a]);
  const anunciantes = [...porPagina.entries()].map(([page_id, xs]) => {
    const ds = xs.map(dias).filter((d2) => d2 !== null);
    const ordenados = [...xs].sort((a, b) => (dias(b) ?? 0) - (dias(a) ?? 0));
    return {
      pagina: xs[0].page_name,
      page_id,
      anuncios: xs.length,
      veteranos: ds.filter((d2) => d2 >= 30).length,
      mas_antiguo_dias: ds.length ? Math.max(...ds) : null,
      nuevos_7d: ds.filter((d2) => d2 <= 7).length,
      titulos: [...new Set(xs.map((a) => (a.ad_creative_link_title ?? "").trim()).filter((t) => t && !/^[|\s]+$/.test(t)))].slice(0, 4),
      ejemplos: ordenados.filter((a) => a.ad_snapshot_url).slice(0, 3).map((a) => ({ url: a.ad_snapshot_url, titulo: (a.ad_creative_link_title ?? "").trim(), dias: dias(a) })),
      propia: esPropia(xs[0]),
      seguido: seguidos.has(page_id) || seguidos.has(xs[0].page_name.toLowerCase())
    };
  }).sort((a, b) => Number(b.seguido) - Number(a.seguido) || b.veteranos - a.veteranos || b.anuncios - a.anuncios);
  const propia = anunciantes.find((a) => a.propia) ?? null;
  const otros = anunciantes.filter((a) => !a.propia);
  const tramos = [{ t: "Menos de 7 d\xEDas", f: (d2) => d2 < 7 }, { t: "7 a 30 d\xEDas", f: (d2) => d2 >= 7 && d2 < 30 }, { t: "30 a 90 d\xEDas", f: (d2) => d2 >= 30 && d2 < 90 }, { t: "M\xE1s de 90 d\xEDas", f: (d2) => d2 >= 90 }];
  const dsOtros = ads.filter((a) => !esPropia(a)).map(dias).filter((d2) => d2 !== null);
  const antiguedad = tramos.map((x) => ({ tramo: x.t, anuncios: dsOtros.filter(x.f).length }));
  const vet = otros.filter((a) => a.veteranos > 0).sort((a, b) => b.veteranos - a.veteranos);
  const term = cfg.terminos.map((t) => `"${t}"`).join(", ");
  const conf = confianza(ads.length, "anuncios le\xEDdos", 50, 15);
  const contra = `Anuncios activos en ${cfg.pais} para ${term} en la Biblioteca de anuncios de Meta (muestra de hasta 50 por b\xFAsqueda; se descartaron ${descartados} de otras monedas).`;
  const panorama = {
    senal: "estable",
    titular: `${otros.length} ${otros.length === 1 ? "anunciante" : "anunciantes"} de tu categor\xEDa tienen anuncios activos ahora${total ? ` (Meta estima ~${n06(total)} anuncios en total para ${term})` : ""}.`,
    detalle: otros[0] ? `El que m\xE1s piezas mantiene es ${otros.sort((a, b) => b.anuncios - a.anuncios)[0].pagina} (${otros[0].anuncios}).` : void 0,
    respaldo: { contra, ...conf, medicion: "Anunciantes y anuncios activos en la pr\xF3xima lectura." },
    que_es: "Qui\xE9n anuncia en Meta en tu categor\xEDa en este momento y cu\xE1ntas piezas mantiene activas.",
    como_se_lee: "Muchos anunciantes = categor\xEDa disputada (la subasta se encarece). Un competidor que sube fuerte la cantidad de piezas suele estar lanzando algo."
  };
  const sesgoNuevos = dsOtros.length > 0 && dsOtros.every((d2) => d2 < 7);
  const veteranos = sesgoNuevos && !config2.competidores.length ? {
    senal: "oportunidad",
    titular: "La b\xFAsqueda por categor\xEDa muestra solo los anuncios m\xE1s nuevos (todos de esta semana): as\xED no se ve qu\xE9 piezas le funcionan a cada competidor.",
    detalle: "Esa se\xF1al aparece al seguir a un competidor por su p\xE1gina: ah\xED se ven todos sus anuncios activos y cu\xE1ntos d\xEDas lleva cada uno.",
    accion: "Siguiente paso: elegir 3 a 5 competidores reales (su p\xE1gina de Facebook) para seguir sus anuncios uno por uno.",
    respaldo: { contra, ...conf, medicion: "Antig\xFCedad de los anuncios de cada competidor seguido." },
    que_es: "Cu\xE1ntos d\xEDas lleva activo cada anuncio de la competencia.",
    como_se_lee: "Nadie mantiene 30 o 90 d\xEDas un anuncio que pierde plata: los anuncios veteranos son las referencias m\xE1s valiosas de la categor\xEDa."
  } : {
    senal: vet.length ? "oportunidad" : "estable",
    titular: vet.length ? `${vet.length} ${vet.length === 1 ? "competidor mantiene" : "competidores mantienen"} anuncios activos hace m\xE1s de 30 d\xEDas: son piezas que les est\xE1n funcionando.` : "Ning\xFAn competidor mantiene anuncios activos por m\xE1s de 30 d\xEDas en esta muestra.",
    detalle: vet[0] ? `${vet[0].pagina} tiene ${vet[0].veteranos} as\xED; el m\xE1s antiguo lleva ${n06(vet[0].mas_antiguo_dias)} d\xEDas.` : (() => {
      const o = [...otros].filter((a) => a.mas_antiguo_dias !== null).sort((a, b) => (b.mas_antiguo_dias ?? 0) - (a.mas_antiguo_dias ?? 0))[0];
      return o ? `El anuncio activo m\xE1s antiguo es de ${o.pagina} y lleva ${n06(o.mas_antiguo_dias)} d\xEDas: la categor\xEDa est\xE1 renovando piezas seguido antes del Cyber.` : void 0;
    })(),
    accion: vet[0] ? `Siguiente paso: revisar esas piezas (bot\xF3n "Ver anuncio") para entender qu\xE9 \xE1ngulo y oferta sostienen, y usarlo como referencia para tu pr\xF3xima ronda de contenido.` : void 0,
    respaldo: { contra, ...conf, medicion: "Antig\xFCedad de los anuncios de la competencia en la pr\xF3xima lectura." },
    que_es: "Cu\xE1ntos d\xEDas lleva activo cada anuncio de la competencia.",
    como_se_lee: "Nadie mantiene 30 o 90 d\xEDas un anuncio que pierde plata: los anuncios veteranos son las referencias m\xE1s valiosas de la categor\xEDa."
  };
  const tu = {
    senal: propia ? "estable" : "oportunidad",
    titular: propia ? `T\xFA tienes ${propia.anuncios} ${propia.anuncios === 1 ? "anuncio activo" : "anuncios activos"} en esta b\xFAsqueda${propia.nuevos_7d ? propia.anuncios === 1 ? ", lanzado esta semana" : `, ${propia.nuevos_7d} de ellos lanzados esta semana` : ""}.` : `Tu marca no aparece en la b\xFAsqueda de ${term}.`,
    detalle: config2.competidores.length ? void 0 : "Todav\xEDa no hay competidores configurados para seguir de cerca.",
    respaldo: { contra, ...conf, medicion: "Tus anuncios activos en la categor\xEDa." },
    que_es: "Tu presencia en la misma b\xFAsqueda que la competencia.",
    como_se_lee: "Sirve para dimensionar tu volumen de piezas frente al de la categor\xEDa."
  };
  const veredicto = { senal: veteranos.senal, titular: panorama.titular, detalle: veteranos.titular };
  return {
    terminos: cfg.terminos,
    pais: cfg.pais,
    capturado,
    total_estimado: total,
    anuncios: ads.length,
    descartados_otra_moneda: descartados,
    anunciantes: anunciantes.slice(0, 20),
    antiguedad,
    propia,
    lecturas: { panorama, veteranos, tu_marca: tu },
    veredicto
  };
}

// src/core/seo.ts
function parseTsv(raw) {
  const text = raw?.result;
  if (typeof text !== "string") return [];
  const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
  const head = lines.shift()?.split("	") ?? [];
  return lines.map((l) => Object.fromEntries(l.split("	").map((v, i) => [head[i] ?? `c${i}`, toNumber(v) ?? v])));
}
var agg = (rs) => {
  const clics = rs.reduce((a, r) => a + r.clics, 0);
  const impresiones = rs.reduce((a, r) => a + r.impresiones, 0);
  return { clics, impresiones, ctr: impresiones ? clics / impresiones : null, posicion: impresiones ? rs.reduce((a, r) => a + r.posicion * r.impresiones, 0) / impresiones : null };
};
function seoBlock(config2, rows, raws) {
  const byKey = /* @__PURE__ */ new Map();
  for (const r of rows.filter((x) => x.source === "gsc" && x.level === "query")) {
    const k = `${r.entity_id}|${r.dims?.page ?? ""}`;
    const o = byKey.get(k) ?? { consulta: r.entity_id, pagina: r.dims?.page ?? "", clics: 0, impresiones: 0, posicion: 0 };
    if (r.metric === "clics") o.clics = r.value;
    if (r.metric === "impresiones") o.impresiones = r.value;
    if (r.metric === "posicion") o.posicion = r.value;
    byKey.set(k, o);
  }
  const qp = [...byKey.values()];
  const marca = config2.terminos_marca.map((t) => t.toLowerCase());
  const isBrand = (q) => marca.some((t) => q.toLowerCase().includes(t));
  const temasCfg = config2.temas_seo ?? {};
  const temas = Object.entries(temasCfg).map(([tema, palabras]) => ({
    tema,
    ...agg(qp.filter((r) => palabras.some((p) => r.consulta.toLowerCase().includes(p.toLowerCase()))))
  })).filter((t) => t.impresiones > 0).sort((a, b) => b.impresiones - a.impresiones);
  const porConsulta = /* @__PURE__ */ new Map();
  for (const r of qp) porConsulta.set(r.consulta, [...porConsulta.get(r.consulta) ?? [], r]);
  const canibalizacion = [...porConsulta.entries()].map(([consulta, ps]) => {
    const tot4 = ps.reduce((a, p) => a + p.impresiones, 0);
    const fuertes = ps.filter((p) => tot4 && p.impresiones / tot4 >= 0.1);
    return { consulta, tot: tot4, paginas: fuertes.sort((a, b) => b.clics - a.clics).map((p) => ({ pagina: p.pagina, clics: p.clics, posicion: p.posicion })) };
  }).filter((c) => c.paginas.length >= 2).sort((a, b) => b.tot - a.tot).slice(0, 10).map(({ consulta, paginas }) => ({ consulta, paginas }));
  const org = /* @__PURE__ */ new Map();
  for (const [c, ps] of porConsulta) org.set(c.toLowerCase(), agg(ps));
  const kw = /* @__PURE__ */ new Map();
  for (const r of rows.filter((x) => x.source === "google_ads" && x.level === "keyword")) {
    const text = (r.entity_name ?? r.entity_id.split("|")[0] ?? "").toLowerCase();
    const o = kw.get(text) ?? { gasto: 0, compras: 0 };
    if (r.metric === "gasto") o.gasto += r.value;
    if (r.metric === "compras_plataforma") o.compras += r.value;
    kw.set(text, o);
  }
  const cruce_ads = [...kw.entries()].filter(([k]) => org.has(k)).map(([keyword, v]) => ({ keyword, gasto: v.gasto, compras: v.compras, posicion_organica: org.get(keyword).posicion ?? 0, clics_organicos: org.get(keyword).clics })).sort((a, b) => b.gasto - a.gasto);
  const ov = raws.overview;
  return {
    marca: agg(qp.filter((r) => isBrand(r.consulta))),
    no_marca: agg(qp.filter((r) => !isBrand(r.consulta))),
    cobertura: `Sobre las ${qp.length.toLocaleString("es-CL")} combinaciones consulta \xD7 p\xE1gina con m\xE1s impresiones (Google oculta las consultas an\xF3nimas).`,
    temas,
    canibalizacion,
    quick_wins: parseTsv(raws.quickWins).slice(0, 15),
    ctr_gaps: parseTsv(raws.ctrGaps).slice(0, 10),
    cruce_ads,
    periodo_anterior: ov?.delta ? { clics_pct: (ov.delta.clicks_pct ?? 0) / 100, impresiones_pct: (ov.delta.impressions_pct ?? 0) / 100, ctr_pct: (ov.delta.ctr_pct ?? 0) / 100 } : null
  };
}

// src/core/email.ts
var FLOWS_CLAVE = [
  { clave: "bienvenida", nombre: "Bienvenida", patron: /welcome|bienvenida/i },
  { clave: "carrito", nombre: "Carrito abandonado", patron: /carrito|cart|checkout/i },
  { clave: "navegacion", nombre: "Navegaci\xF3n abandonada", patron: /navegaci|browse/i },
  { clave: "postcompra", nombre: "Postcompra", patron: /post ?compra|post-?purchase|postventa/i },
  { clave: "recompra", nombre: "Recompra / recuperaci\xF3n", patron: /recompra|winback|recupera|reactiva/i }
];
function emailBlock(config2, rows, ventasTotal, raws) {
  const fl = new Map((raws.flows?.data ?? []).map((f) => [f.id, f.attributes ?? {}]));
  const cp = new Map((raws.campaigns?.data ?? []).map((c) => [c.id, c.attributes ?? {}]));
  const val = (r) => r.currency ? toReport(config2, r.value, r.currency, r.date_to) : r.value;
  const sumBy = (level, metric) => {
    const m = /* @__PURE__ */ new Map();
    for (const r of rows.filter((x) => x.source === "klaviyo" && x.level === level && x.metric === metric)) m.set(r.entity_id, (m.get(r.entity_id) ?? 0) + val(r));
    return m;
  };
  const fIng = sumBy("flow", "ingreso_email"), fPed = sumBy("flow", "pedidos_email");
  const mIng = sumBy("message", "ingreso_email"), mPed = sumBy("message", "pedidos_email");
  const flows = [.../* @__PURE__ */ new Set([...fl.keys(), ...fIng.keys()])].map((id) => ({ id, nombre: fl.get(id)?.name ?? id, estado: fl.get(id)?.status ?? "desconocido", ingreso: fIng.get(id) ?? 0, pedidos: fPed.get(id) ?? 0 })).sort((a, b) => b.ingreso - a.ingreso);
  const campanas = [...mIng.keys()].filter((id) => cp.has(id)).map((id) => ({ id, nombre: cp.get(id).name ?? id, enviada: cp.get(id).send_time ?? null, ingreso: mIng.get(id) ?? 0, pedidos: mPed.get(id) ?? 0 })).sort((a, b) => b.ingreso - a.ingreso);
  const ingreso_flows = flows.reduce((a, f) => a + f.ingreso, 0);
  const ingreso_campanas = campanas.reduce((a, c) => a + c.ingreso, 0);
  const checklist = FLOWS_CLAVE.map((k) => {
    const match = flows.filter((f) => k.patron.test(f.nombre));
    const activos = match.filter((f) => f.estado === "live");
    return {
      clave: k.clave,
      nombre: k.nombre,
      estado: activos.length ? "activo" : match.length ? "borrador" : "falta",
      flows: match.map((f) => `${f.nombre} (${f.estado === "live" ? "activo" : f.estado})`),
      ingreso: activos.reduce((a, f) => a + f.ingreso, 0)
    };
  });
  const listas = /* @__PURE__ */ new Map();
  for (const r of rows.filter((x) => x.source === "klaviyo" && x.level === "list" && x.metric === "altas_lista")) {
    listas.set(r.entity_id, [...listas.get(r.entity_id) ?? [], { desde: r.date_from, altas: r.value }]);
  }
  return {
    ingreso_flows,
    ingreso_campanas,
    ingreso_total: ingreso_flows + ingreso_campanas,
    peso: safeDiv(ingreso_flows + ingreso_campanas, ventasTotal),
    flows,
    campanas,
    checklist,
    altas: [...listas.entries()].map(([lista, s]) => ({ lista, semanas: s.sort((a, b) => a.desde < b.desde ? -1 : 1) })).filter((l) => l.semanas.some((w) => w.altas > 0))
  };
}

// src/core/competencia.ts
function parse2(raw) {
  const r = raw?.results;
  const o = typeof r === "string" ? JSON.parse(r) : r;
  return { total: o?.estimated_total_count ?? null, ads: o?.ads ?? [] };
}
function competenciaBlock(config2, capturedAt, raws) {
  const cfg = config2.competencia;
  const excluir = new Set((cfg?.excluir_paginas ?? []).map(String));
  const seguidos = new Set(config2.competidores.flatMap((c) => [c.nombre.toLowerCase(), ...c.pagina_meta ? [String(c.pagina_meta).toLowerCase()] : []]));
  const now = Date.parse(capturedAt) / 1e3;
  let total = null;
  const by = /* @__PURE__ */ new Map();
  for (const raw of raws) {
    const p = parse2(raw);
    total = (total ?? 0) + (p.total ?? 0);
    for (const a of p.ads) {
      const pid = String(a.page_id);
      if (excluir.has(pid)) continue;
      by.set(pid, [...(by.get(pid) ?? []).filter((x) => x.id !== a.id), a]);
    }
  }
  const anunciantes = [...by.entries()].map(([page_id, ads]) => {
    const starts = ads.map((a) => a.ad_delivery_start_time).filter((t) => typeof t === "number");
    const titulos = [...new Set(ads.map((a) => (a.ad_creative_link_title ?? "").replace(/\s*\|\s*/g, " ").trim()).filter(Boolean))].slice(0, 3);
    const pagina = ads[0].page_name;
    return {
      pagina,
      page_id,
      anuncios: ads.length,
      mas_antiguo_dias: starts.length && Number.isFinite(now) ? Math.max(0, Math.round((now - Math.min(...starts)) / 86400)) : null,
      titulos,
      ejemplo_url: ads[0].ad_snapshot_url,
      seguido: seguidos.has(pagina.toLowerCase()) || seguidos.has(page_id)
    };
  }).sort((a, b) => Number(b.seguido) - Number(a.seguido) || b.anuncios - a.anuncios);
  return {
    terminos: cfg?.terminos ?? [],
    total_estimado: total,
    anunciantes,
    nota: "Muestra de los anuncios activos m\xE1s recientes por t\xE9rmino (la biblioteca devuelve los \xFAltimos primero). Un anunciante con muchos anuncios activos est\xE1 invirtiendo fuerte en la categor\xEDa ahora."
  };
}

// src/engine/catalog.json
var catalog_default = {
  version: "0.1.0",
  nota: "Criterio Advanz como datos (FASE-0 \xA79.2). Umbrales por defecto; cada cliente puede sobrescribirlos en config.umbrales_escenarios.<id>. Los textos usan {placeholders} que llena el detector con n\xFAmeros ya calculados.",
  escenarios: [
    {
      id: "S-NEG-01",
      pagina: "resumen",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        captura_min: 0.85
      },
      veredicto: "Tu anal\xEDtica no ve {faltan_pct} de los pedidos reales",
      accion: "Revisar la instalaci\xF3n del evento de compra (GA4, p\xEDxel, API de conversiones). Mientras tanto, juzgar el retorno con el MER, no con cada plataforma."
    },
    {
      id: "S-NEG-02",
      pagina: "resumen",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        sobreatribucion_min: 1
      },
      veredicto: "Las plataformas se atribuyen {suma_plataformas} compras; GA4 ve {ga4} en total",
      accion: "Decidir presupuesto con el retorno total (MER {mer}), no con el ROAS que informa cada plataforma."
    },
    {
      id: "S-NEG-03",
      pagina: "ventas",
      impacto: "medio",
      confianza: "alta",
      umbrales: {
        descuento_max: 0.2
      },
      veredicto: "Los descuentos fueron el {descuento_pct} de la venta bruta",
      accion: "Comparar la contribuci\xF3n con y sin promoci\xF3n antes de repetirla."
    },
    {
      id: "S-CRO-01",
      pagina: "cro",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        ratio_movil_max: 0.5,
        peso_movil_min: 0.6
      },
      veredicto: "El celular trae el {peso_movil} de las visitas y convierte {conv_movil}: menos de la mitad que el escritorio ({conv_desktop})",
      accion: "Priorizar CRO m\xF3vil: es la mayor palanca del negocio."
    },
    {
      id: "S-CRO-02",
      pagina: "cro",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        cierre_min: 0.4,
        piso_checkouts: 50,
        min_pedidos_extra: 10
      },
      veredicto: "{abandono} de quienes llegan al checkout en {dispositivo} no compra ({perdidos} personas)",
      accion: "Revisar costo de env\xEDo, medios de pago y campos del checkout en {dispositivo}. Si el cierre llegara a {cierre_objetivo}, ser\xEDan ~{pedidos_extra} pedidos m\xE1s."
    },
    {
      id: "S-CRO-04",
      pagina: "cro",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        scroll_min: 0.3
      },
      veredicto: "En celular la gente ve solo el {scroll} de la p\xE1gina",
      accion: "Subir precio, beneficio principal, rese\xF1as y bot\xF3n de compra en las fichas."
    },
    {
      id: "S-META-04",
      pagina: "meta",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        frecuencia_max: 6,
        piso_gasto_usd: 50
      },
      veredicto: '"{anuncio}" tiene frecuencia {frecuencia}: la audiencia se est\xE1 saturando',
      accion: "Ampliar la audiencia o renovar creativos antes de que suba el costo por compra."
    },
    {
      id: "S-META-05",
      pagina: "meta",
      impacto: "alto",
      confianza: "media",
      umbrales: {
        piso_compras: 10
      },
      veredicto: '"{anuncio}" vende a {cpa} por compra, bajo el objetivo de {objetivo}',
      accion: "Candidato a escalar presupuesto."
    },
    {
      id: "S-META-06",
      pagina: "meta",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        piso_gasto_multiplo_cpa: 3
      },
      veredicto: '"{anuncio}" gast\xF3 {gasto} con {compras}: costo por compra sobre el techo ({techo})',
      accion: "Cortar o revisar el creativo."
    },
    {
      id: "S-META-07",
      pagina: "meta",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        piso_vistas: 500,
        tasa_carrito_min: 0.02
      },
      veredicto: '"{anuncio}" lleva {vistas} personas a la p\xE1gina y solo {tasa} agrega al carrito',
      accion: "El anuncio atrae tr\xE1fico que no compra: revisar la promesa del anuncio vs. la p\xE1gina de destino."
    },
    {
      id: "S-GADS-01",
      pagina: "google_ads",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        perdida_ppto_min: 0.1
      },
      veredicto: '"{campana}" pierde {perdida} de las b\xFAsquedas por presupuesto con un costo por compra de {cpa} (promedio de la cuenta {cpa_cuenta})',
      accion: 'Evaluar subir el presupuesto de "{campana}".'
    },
    {
      id: "S-GADS-03",
      pagina: "google_ads",
      impacto: "medio",
      confianza: "alta",
      umbrales: {
        qs_max: 4,
        piso_gasto: 1e4
      },
      veredicto: 'La keyword "{keyword}" tiene nivel de calidad {qs} y pierde {perdida_rank} por ranking',
      accion: "Revisar el anuncio y la p\xE1gina de destino de esa keyword."
    },
    {
      id: "S-GADS-04",
      pagina: "google_ads",
      impacto: "alto",
      confianza: "media",
      umbrales: {
        multiplo_cpa: 3,
        piso_gasto: 5e4
      },
      veredicto: '"{entidad}" gast\xF3 {gasto} con {compras} (costo por compra {cpa}, {veces}\xD7 el promedio)',
      accion: "Revisar o pausar."
    },
    {
      id: "S-EMAIL-01",
      pagina: "email",
      impacto: "alto",
      confianza: "media",
      umbrales: {
        semanas_en_cero: 1,
        piso_semanal_previo: 20
      },
      veredicto: 'La lista "{lista}" pas\xF3 de {previo} altas por semana a 0',
      accion: "Confirmar si el formulario o popup se apag\xF3 a prop\xF3sito. {contexto}"
    },
    {
      id: "S-DATA-01",
      pagina: "resumen",
      impacto: "alto",
      confianza: "alta",
      umbrales: {},
      veredicto: "{fuente} no tiene datos actualizados",
      accion: "Reconectar la fuente. Mientras tanto, las p\xE1ginas que dependen de ella muestran datos incompletos."
    },
    {
      id: "S-SEO-01",
      pagina: "seo",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        caida_ctr: -0.1,
        suba_impresiones: 0.1
      },
      veredicto: "El CTR org\xE1nico baj\xF3 {ctr} mientras las impresiones subieron {imp}: no es una ca\xEDda, entraron b\xFAsquedas nuevas",
      accion: "Leer marca y no-marca por separado. La marca se mantiene; las b\xFAsquedas nuevas no-marca son la oportunidad."
    },
    {
      id: "S-SEO-02",
      pagina: "seo",
      impacto: "alto",
      confianza: "media",
      umbrales: {
        clics_potenciales_min: 100
      },
      veredicto: '"{consulta}" tiene {impresiones} impresiones en posici\xF3n {posicion}: llegar al top 3 sumar\xEDa ~{extra} clics al mes',
      accion: "Mejorar el contenido y los enlaces internos de la p\xE1gina que rankea para esa b\xFAsqueda."
    },
    {
      id: "S-SEO-03",
      pagina: "seo",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        posicion_max: 10
      },
      veredicto: 'Pagas {gasto} en Google por "{keyword}" y adem\xE1s rankeas org\xE1nico en posici\xF3n {posicion}',
      accion: "Subir esa p\xE1gina al top 3 org\xE1nico reduce lo que dependes del pago en esa b\xFAsqueda."
    },
    {
      id: "S-SEO-04",
      pagina: "seo",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        paginas_min: 3
      },
      veredicto: '"{consulta}" reparte los clics entre {n} p\xE1ginas de tu sitio',
      accion: "Definir una p\xE1gina principal para esa b\xFAsqueda y enlazar las dem\xE1s hacia ella."
    },
    {
      id: "S-EMAIL-02",
      pagina: "email",
      impacto: "alto",
      confianza: "alta",
      umbrales: {},
      veredicto: "{estado} el flow de {nombre}",
      accion: "{accion}"
    },
    {
      id: "S-EMAIL-03",
      pagina: "email",
      impacto: "medio",
      confianza: "media",
      umbrales: {
        peso_min: 0.1
      },
      veredicto: "El email aporta solo {peso} de la venta",
      accion: "Revisar que los flows clave est\xE9n activos y la frecuencia de campa\xF1as: en marcas sanas suele aportar 15\u201330%."
    },
    {
      id: "S-WAR-01",
      pagina: "war_room",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        ritmo_min: 0.85
      },
      veredicto: "{evento}: d\xEDa {dia} de {dias}, vas al {ritmo} del ritmo para llegar a la meta ({acumulado} de {esperado} esperados a hoy)",
      accion: "Revisar qu\xE9 canal est\xE1 bajo su ritmo diario y reforzar lo que ya vende (anuncios ganadores, email a la base, empuje en las horas de mayor venta)."
    },
    {
      id: "S-WAR-02",
      pagina: "war_room",
      impacto: "alto",
      confianza: "alta",
      umbrales: {
        dias_aviso: 14
      },
      veredicto: "Faltan {dias} d\xEDas para {evento} y hay {n} tareas de preparaci\xF3n pendientes que el sistema puede verificar",
      accion: "Resolver antes del inicio: {tareas}."
    }
  ]
};

// src/engine/detect.ts
var CATALOG = catalog_default;
var IMPACT = { alto: 3, medio: 2, bajo: 1 };
var CONF = { alta: 1, media: 0.8, hipotesis: 0.5 };
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => k in vars ? String(vars[k]) : `{${k}}`);
}
function detect(input) {
  const { config: config2, rows, kpis, funnel } = input;
  const rates = input.rates ?? [];
  const cur = config2.moneda_reporte;
  const money2 = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  const pct8 = (v) => `${Math.round(v * 100)}%`;
  const compras = (n) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })} ${n === 1 ? "compra" : "compras"}`;
  const pct1 = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
  const toRep = (r) => r.currency ? toReport(config2, r.value, r.currency, r.date_to, rates) : r.value;
  const val = (src, level, entity, metric) => rows.find((r) => r.source === src && r.level === level && r.entity_id === entity && r.metric === metric);
  const entities = (src, level) => [...new Set(rows.filter((r) => r.source === src && r.level === level).map((r) => r.entity_id))];
  const out = [];
  for (const sc of CATALOG.escenarios) {
    const u = { ...sc.umbrales, ...config2.umbrales_escenarios?.[sc.id] ?? {} };
    const push = (vars, evidence, extraPriority = 0) => out.push({
      scenario: sc.id,
      page: sc.pagina,
      impact: sc.impacto,
      confidence: sc.confianza,
      verdict: fill(sc.veredicto, vars),
      action: fill(sc.accion, vars),
      evidence,
      priority: IMPACT[sc.impacto] * CONF[sc.confianza] + extraPriority
    });
    switch (sc.id) {
      case "S-NEG-01": {
        const c = kpis.captura_tracking;
        if (c !== null && c < u.captura_min) push({ faltan_pct: pct8(1 - c) }, [{ metric: "captura_tracking", value: c }]);
        break;
      }
      case "S-NEG-02": {
        const meta = rows.filter((r) => r.source === "meta" && r.level === "account" && r.metric === "compras_plataforma").reduce((a, r) => a + r.value, 0);
        const gads = rows.filter((r) => r.source === "google_ads" && r.level === "campaign" && r.metric === "compras_plataforma").reduce((a, r) => a + r.value, 0);
        const ga4 = val("ga4", "account", "", "compras_ga4")?.value;
        const ratio = safeDiv(meta + gads, ga4 ?? null);
        if (ratio !== null && ratio > u.sobreatribucion_min && kpis.mer !== null)
          push({ suma_plataformas: Math.round(meta + gads), ga4, mer: `${kpis.mer.toFixed(1).replace(".", ",")}x` }, [
            { metric: "compras_plataforma", entity: "meta", value: meta },
            { metric: "compras_plataforma", entity: "google_ads", value: gads },
            { metric: "compras_ga4", value: ga4 }
          ]);
        break;
      }
      case "S-NEG-03": {
        const d2 = kpis.descuentos_pct;
        if (d2 !== null && d2 > u.descuento_max) push({ descuento_pct: pct8(d2) }, [{ metric: "descuentos_pct", value: d2 }]);
        break;
      }
      case "S-CRO-01": {
        const m = funnel.mobile, dsk = funnel.desktop;
        if (!m || !dsk) break;
        const totalSes = Object.values(funnel).reduce((a, f) => a + f[0].valor, 0);
        const convM = m[3].tasa_vs_inicio, convD = dsk[3].tasa_vs_inicio;
        const peso = m[0].valor / totalSes;
        if (peso >= u.peso_movil_min && convM / convD < u.ratio_movil_max)
          push({ peso_movil: pct8(peso), conv_movil: pct1(convM), conv_desktop: pct1(convD) }, [
            { metric: "tasa_conversion", entity: "mobile", value: convM },
            { metric: "tasa_conversion", entity: "desktop", value: convD }
          ]);
        break;
      }
      case "S-CRO-02": {
        const bestCierre = Math.max(...Object.values(funnel).filter((f) => f[2].valor >= u.piso_checkouts).map((f) => f[3].tasa_vs_anterior ?? 0));
        for (const [dev, f] of Object.entries(funnel)) {
          const checkouts = f[2].valor, compras2 = f[3].valor, cierre = f[3].tasa_vs_anterior;
          if (checkouts < u.piso_checkouts || cierre === null || cierre >= u.cierre_min) continue;
          const objetivo = Math.max(bestCierre, u.cierre_min);
          const extra = Math.round(checkouts * objetivo - compras2);
          if (extra < u.min_pedidos_extra) continue;
          push(
            { abandono: pct8(1 - cierre), dispositivo: dev === "mobile" ? "celular" : dev === "desktop" ? "escritorio" : dev, perdidos: checkouts - compras2, cierre_objetivo: pct8(objetivo), pedidos_extra: extra },
            [{ metric: "tasa_cierre_checkout", entity: dev, value: cierre }],
            extra / 100
          );
        }
        break;
      }
      case "S-CRO-04": {
        const s = val("clarity", "device", "mobile", "scroll_medio")?.value;
        if (s !== void 0 && s < u.scroll_min) push({ scroll: pct8(s) }, [{ metric: "scroll_medio", entity: "mobile", value: s }]);
        break;
      }
      case "S-META-04":
      case "S-META-05":
      case "S-META-06":
      case "S-META-07": {
        const piso = config2.umbrales.piso_gasto ?? 0;
        const adIds = entities("meta", "ad");
        const nameCount = /* @__PURE__ */ new Map();
        for (const id of adIds) {
          const n = val("meta", "ad", id, "gasto")?.entity_name ?? id;
          nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
        }
        let common = 0;
        const first = adIds[0] ?? "";
        while (common < first.length && adIds.every((x) => x[x.length - 1 - common] === first[first.length - 1 - common])) common++;
        const shortId = (id) => id.slice(Math.max(0, id.length - common - 4), id.length - common);
        for (const id of adIds) {
          const g = val("meta", "ad", id, "gasto");
          if (!g) continue;
          const gasto = toRep(g);
          const base = g.entity_name ?? id;
          const name = (nameCount.get(base) ?? 0) > 1 ? `${base} (ID \u2026${shortId(id)})` : base;
          const comprasN = val("meta", "ad", id, "compras_plataforma")?.value ?? 0;
          const cpa = comprasN > 0 ? gasto / comprasN : null;
          if (sc.id === "S-META-04") {
            const fr = val("meta", "ad", id, "frecuencia")?.value;
            if (fr !== void 0 && fr > u.frecuencia_max && gasto >= piso)
              push({ anuncio: name, frecuencia: fr.toFixed(1).replace(".", ",") }, [{ metric: "frecuencia", entity: id, value: fr }]);
          } else if (sc.id === "S-META-05") {
            const obj = config2.umbrales.cpa_objetivo;
            if (obj && cpa !== null && comprasN >= u.piso_compras && cpa < obj)
              push({ anuncio: name, cpa: money2(cpa), objetivo: money2(obj) }, [{ metric: "cpa_plataforma", entity: id, value: cpa }], comprasN / 100);
          } else if (sc.id === "S-META-06") {
            const techo = config2.umbrales.cpa_techo;
            if (!val("meta", "ad", id, "compras_plataforma")) continue;
            if (techo && gasto >= u.piso_gasto_multiplo_cpa * techo && (cpa === null || cpa > techo))
              push({ anuncio: name, gasto: money2(gasto), compras: compras(comprasN), techo: money2(techo) }, [{ metric: "gasto", entity: id, value: gasto }]);
          } else {
            const vistas = val("meta", "ad", id, "vistas_landing")?.value ?? 0;
            const carritos = val("meta", "ad", id, "carritos_plataforma")?.value ?? 0;
            const tasa = safeDiv(carritos, vistas);
            const vendeBien = cpa !== null && config2.umbrales.cpa_objetivo !== void 0 && cpa < config2.umbrales.cpa_objetivo;
            if (!vendeBien && vistas >= u.piso_vistas && tasa !== null && tasa < u.tasa_carrito_min)
              push({ anuncio: name, vistas: vistas.toLocaleString("es-CL"), tasa: pct1(tasa) }, [{ metric: "vistas_landing", entity: id, value: vistas }]);
          }
        }
        break;
      }
      case "S-GADS-01":
      case "S-GADS-04": {
        const camps = entities("google_ads", "campaign");
        const totG = camps.reduce((a, c) => a + (val("google_ads", "campaign", c, "gasto")?.value ?? 0), 0);
        const totC = camps.reduce((a, c) => a + (val("google_ads", "campaign", c, "compras_plataforma")?.value ?? 0), 0);
        const cpaCuenta = safeDiv(totG, totC);
        if (cpaCuenta === null) break;
        if (sc.id === "S-GADS-01") {
          for (const c of camps) {
            const perdida = val("google_ads", "campaign", c, "cuota_perdida_ppto")?.value;
            const cpa = safeDiv(val("google_ads", "campaign", c, "gasto")?.value, val("google_ads", "campaign", c, "compras_plataforma")?.value);
            if (perdida !== void 0 && cpa !== null && perdida > u.perdida_ppto_min && cpa < cpaCuenta)
              push({ campana: c, perdida: pct8(perdida), cpa: money2(cpa), cpa_cuenta: money2(cpaCuenta) }, [
                { metric: "cuota_perdida_ppto", entity: c, value: perdida },
                { metric: "cpa_plataforma", entity: c, value: cpa }
              ]);
          }
        } else {
          for (const level of ["asset_group", "product"]) {
            for (const e of entities("google_ads", level)) {
              const g = val("google_ads", level, e, "gasto")?.value ?? 0;
              const c = val("google_ads", level, e, "compras_plataforma")?.value ?? 0;
              const cpa = c > 0 ? g / c : Infinity;
              if (g >= u.piso_gasto && cpa > u.multiplo_cpa * cpaCuenta)
                push(
                  { entidad: e.split("|").pop(), gasto: money2(g), compras: compras(Math.round(c * 10) / 10), cpa: Number.isFinite(cpa) ? money2(cpa) : "sin compras", veces: Number.isFinite(cpa) ? Math.round(cpa / cpaCuenta) : "\u221E" },
                  [{ metric: "gasto", entity: e, value: g }],
                  g / 1e6
                );
            }
          }
        }
        break;
      }
      case "S-GADS-03": {
        for (const k of entities("google_ads", "keyword")) {
          const qs = val("google_ads", "keyword", k, "quality_score")?.value;
          const g = val("google_ads", "keyword", k, "gasto")?.value ?? 0;
          const pr = val("google_ads", "keyword", k, "cuota_perdida_rank")?.value;
          if (qs !== void 0 && qs <= u.qs_max && g >= u.piso_gasto)
            push({ keyword: k.split("|")[0], qs, perdida_rank: pr !== void 0 ? pct8(pr) : "\u2014" }, [{ metric: "quality_score", entity: k, value: qs }]);
        }
        break;
      }
      case "S-EMAIL-01": {
        const listRows = rows.filter((r) => r.source === "klaviyo" && r.metric === "altas_lista" && r.level === "list");
        const byList = /* @__PURE__ */ new Map();
        for (const r of listRows) byList.set(r.entity_id, [...byList.get(r.entity_id) ?? [], r]);
        const lastWeek = [...new Set(listRows.map((r) => r.date_from))].sort().at(-1);
        for (const [list, series] of byList) {
          const s = series.sort((a, b) => a.date_from < b.date_from ? -1 : 1);
          const n = u.semanas_en_cero;
          const tail = s.slice(-n), prev = s.slice(0, -n);
          const prevNonZero = prev.filter((r) => r.value > 0);
          const prevAvg = prevNonZero.length ? prevNonZero.reduce((a, r) => a + r.value, 0) / prevNonZero.length : 0;
          if (tail.length === n && tail.every((r) => r.value === 0) && prevAvg >= u.piso_semanal_previo) {
            const nueva = [...byList.entries()].find(([l, ss]) => l !== list && ss.find((r) => r.date_from === lastWeek)?.value && ss.filter((r) => r.date_from !== lastWeek).every((r) => r.value === 0));
            const contexto = nueva ? `En la misma semana empez\xF3 a capturar "${nueva[0]}" (${nueva[1].find((r) => r.date_from === lastWeek).value} altas): puede ser un reemplazo intencional.` : "";
            push({ lista: list, previo: Math.round(prevAvg), contexto }, [{ metric: "altas_lista", entity: list, value: 0 }]);
          }
        }
        break;
      }
      case "S-SEO-01": {
        const pa = input.seo?.periodo_anterior;
        if (pa && pa.ctr_pct < u.caida_ctr && pa.impresiones_pct > u.suba_impresiones)
          push({ ctr: pct8(Math.abs(pa.ctr_pct)), imp: pct8(pa.impresiones_pct) }, [{ metric: "ctr", value: pa.ctr_pct }]);
        break;
      }
      case "S-SEO-02": {
        const q = input.seo?.quick_wins[0];
        if (q && Number(q.uplift) >= u.clics_potenciales_min)
          push(
            { consulta: String(q.query), impresiones: Number(q.impressions).toLocaleString("es-CL"), posicion: Number(q.position).toFixed(1).replace(".", ","), extra: Number(q.uplift).toLocaleString("es-CL") },
            [{ metric: "posicion", entity: String(q.query), value: Number(q.position) }]
          );
        break;
      }
      case "S-SEO-03": {
        const piso = config2.umbrales.piso_gasto ?? 0;
        const marcaT = config2.terminos_marca.map((t) => t.toLowerCase());
        for (const c of input.seo?.cruce_ads ?? []) {
          if (marcaT.some((t) => c.keyword.toLowerCase().includes(t))) continue;
          if (c.gasto >= piso && c.posicion_organica > 0 && c.posicion_organica <= u.posicion_max)
            push({ gasto: money2(c.gasto), keyword: c.keyword, posicion: c.posicion_organica.toFixed(1).replace(".", ",") }, [{ metric: "posicion", entity: c.keyword, value: c.posicion_organica }], c.gasto / 1e6);
        }
        break;
      }
      case "S-SEO-04": {
        const marca = config2.terminos_marca.map((t) => t.toLowerCase());
        const c = (input.seo?.canibalizacion ?? []).find((x) => x.paginas.length >= u.paginas_min && marca.some((t) => x.consulta.toLowerCase().includes(t)));
        if (c) push({ consulta: c.consulta, n: c.paginas.length }, [{ metric: "clics", entity: c.consulta, value: c.paginas.length }]);
        break;
      }
      case "S-EMAIL-02": {
        for (const k of input.email?.checklist ?? []) {
          if (k.estado === "activo") continue;
          push(
            {
              estado: k.estado === "falta" ? "Falta" : "Est\xE1 en borrador",
              nombre: k.nombre.toLowerCase(),
              accion: k.estado === "falta" ? `Crear el flow de ${k.nombre.toLowerCase()}: es venta autom\xE1tica que hoy no se captura.` : `Terminar y activar el flow de ${k.nombre.toLowerCase()}.`
            },
            [{ metric: "flow", entity: k.clave, value: 0 }]
          );
        }
        break;
      }
      case "S-EMAIL-03": {
        const w = input.email?.peso;
        if (w !== null && w !== void 0 && w < u.peso_min) push({ peso: pct8(w) }, [{ metric: "peso_email", value: w }]);
        break;
      }
      case "S-WAR-01": {
        const w = input.warRoom;
        if (w && w.fase === "durante" && w.ritmo !== null && w.ritmo < u.ritmo_min)
          push({ evento: w.evento.nombre, dia: w.dia_actual, dias: w.evento.dias, ritmo: pct8(w.ritmo), acumulado: money2(w.acumulado), esperado: money2(w.esperado_a_hoy ?? 0) }, [{ metric: "ritmo", value: w.ritmo }], 1);
        break;
      }
      case "S-WAR-02": {
        const w = input.warRoom;
        const pend = (w?.checklist ?? []).filter((c) => c.estado === "pendiente");
        if (w && w.fase === "antes" && w.dias_para_inicio <= u.dias_aviso && pend.length)
          push(
            { dias: w.dias_para_inicio, evento: w.evento.nombre, n: pend.length, tareas: pend.map((c) => c.tarea.charAt(0).toLowerCase() + c.tarea.slice(1) + (c.detalle ? ` (${c.detalle.charAt(0).toLowerCase() + c.detalle.slice(1)})` : "")).join("; ") },
            [{ metric: "checklist", value: pend.length }],
            0.5
          );
        break;
      }
      case "S-DATA-01": {
        for (const h of input.health ?? []) if (h.last_success === null) push({ fuente: h.source }, [{ metric: "sync", entity: h.source, value: 0 }]);
        break;
      }
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

// src/dictionary/metrics.ts
var METRICS = [
  // ─── Negocio ─────────────────────────────────────────────
  {
    id: "ventas_total",
    nombre: "Venta total",
    unidad: "money",
    formula: "Suma del total de los pedidos v\xE1lidos (pagados, no cancelados)",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Todo lo que vendiste en pedidos pagados. Sale de tu tienda, que es la fuente de verdad.",
      buen_valor: "Comp\xE1rala contra tu meta del mes y contra el mismo per\xEDodo anterior.",
      si_empeora: "Mira primero Conversi\xF3n (\xBFllega gente pero no compra?) y despu\xE9s Adquisici\xF3n (\xBFllega menos gente?)."
    }
  },
  {
    id: "ventas_brutas",
    nombre: "Venta bruta",
    unidad: "money",
    formula: "Precio \xD7 cantidad de los pedidos v\xE1lidos, antes de descuentos y env\xEDo",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Lo que habr\xEDas vendido a precio lleno, antes de descuentos.",
      buen_valor: "Sirve para medir cu\xE1nto se va en descuentos.",
      si_empeora: "Revisa si cay\xF3 el tr\xE1fico o la conversi\xF3n."
    }
  },
  {
    id: "ventas_netas",
    nombre: "Venta neta",
    unidad: "money",
    formula: "Venta bruta \u2212 descuentos \u2212 devoluciones",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Lo que realmente queda de la venta despu\xE9s de descuentos y devoluciones.",
      buen_valor: "Es la base para calcular tu margen.",
      si_empeora: "Revisa descuentos y devoluciones."
    }
  },
  {
    id: "devoluciones",
    nombre: "Devoluciones",
    unidad: "money",
    formula: "Monto reembolsado de pedidos del per\xEDodo",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: { que_es: "Dinero devuelto a clientes.", buen_valor: "Bajo y estable.", si_empeora: "Revisa motivos: producto, env\xEDo o expectativa creada por el anuncio." }
  },
  {
    id: "descuentos",
    nombre: "Descuentos",
    unidad: "money",
    formula: "Suma de descuentos aplicados (cupones, promociones, medio de pago)",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: {
      que_es: "Cu\xE1nto dejaste de cobrar por descuentos.",
      buen_valor: "Depende de tu estrategia. Fuera de eventos, mientras m\xE1s bajo, m\xE1s margen.",
      si_empeora: "Revisa si la venta se est\xE1 sosteniendo solo con promociones."
    }
  },
  {
    id: "descuentos_pct",
    nombre: "% de descuento",
    unidad: "ratio",
    formula: "Descuentos \xF7 venta bruta",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: {
      que_es: "Qu\xE9 parte de tu venta bruta se fue en descuentos.",
      buen_valor: "Si pasa de ~20% fuera de un evento, el margen se est\xE1 erosionando.",
      si_empeora: "Compara la contribuci\xF3n con y sin promoci\xF3n antes de repetirla."
    }
  },
  {
    id: "pedidos",
    nombre: "Pedidos",
    unidad: "count",
    formula: "Cantidad de pedidos v\xE1lidos",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Cu\xE1ntas compras pagadas tuviste.",
      buen_valor: "Comp\xE1ralo contra el per\xEDodo anterior y tu meta.",
      si_empeora: "Revisa la conversi\xF3n del sitio y el tr\xE1fico de cada canal."
    }
  },
  {
    id: "aov",
    nombre: "Ticket promedio",
    unidad: "money",
    formula: "(Venta bruta \u2212 descuentos) \xF7 pedidos \u2014 igual que el ticket promedio de Shopify (sin env\xEDo ni impuestos)",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Cu\xE1nto gasta en promedio cada pedido.",
      buen_valor: "Subirlo con packs, env\xEDo gratis desde un monto o ventas cruzadas mejora el margen.",
      si_empeora: "Revisa si se venden m\xE1s productos chicos o si cambi\xF3 el mix de promociones."
    }
  },
  {
    id: "clientes_nuevos",
    nombre: "Clientes nuevos",
    unidad: "count",
    formula: "Clientes cuyo primer pedido v\xE1lido cae en el per\xEDodo (deduplicados por email entre tiendas)",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Personas que te compraron por primera vez.",
      buen_valor: "Es lo que la publicidad de adquisici\xF3n deber\xEDa mover.",
      si_empeora: "Revisa la inversi\xF3n en prospecci\xF3n y el costo por cliente nuevo."
    }
  },
  {
    id: "clientes_recurrentes",
    nombre: "Clientes recurrentes",
    unidad: "count",
    formula: "Clientes con pedido v\xE1lido en el per\xEDodo que ya hab\xEDan comprado antes",
    fuente_verdad: ["tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Clientes que volvieron a comprar.",
      buen_valor: "Una base que recompra baja tu dependencia de la publicidad.",
      si_empeora: "Revisa los flows de email y postcompra."
    }
  },
  {
    id: "gasto_ads",
    nombre: "Inversi\xF3n publicitaria",
    unidad: "money",
    formula: "Suma del gasto de todas las plataformas, convertido a moneda de reporte",
    fuente_verdad: ["plataformas"],
    rezago_dias: 1,
    mejor_si_sube: null,
    educa: {
      que_es: "Todo lo que invertiste en publicidad en el per\xEDodo.",
      buen_valor: "Solo tiene sentido junto al retorno total (MER).",
      si_empeora: "Si sube sin que suba la venta, el retorno total cae."
    }
  },
  {
    id: "mer",
    nombre: "Retorno total (MER)",
    unidad: "multiple",
    formula: "Venta total \xF7 inversi\xF3n publicitaria total",
    fuente_verdad: ["tienda", "plataformas"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Cu\xE1nto vendes por cada $1 invertido en publicidad, sumando todo. No depende de c\xF3mo cada plataforma se atribuye las ventas.",
      buen_valor: "Depende de tu margen: con 60% de margen bruto, un MER sobre ~2,5x suele dejar ganancia.",
      si_empeora: "Revisa qu\xE9 canal subi\xF3 su gasto sin subir la venta total."
    }
  },
  {
    id: "captura_tracking",
    nombre: "Captura de tracking",
    unidad: "ratio",
    formula: "Compras registradas en GA4 \xF7 pedidos v\xE1lidos de la tienda",
    fuente_verdad: ["ga4", "tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Qu\xE9 parte de tus ventas reales ve tu anal\xEDtica.",
      buen_valor: "Sobre 90%. Bajo 85%, la atribuci\xF3n de todos los canales est\xE1 sesgada.",
      si_empeora: "Revisa la instalaci\xF3n del evento de compra (GA4, p\xEDxel, API de conversiones)."
    }
  },
  // ─── Conversión ──────────────────────────────────────────
  {
    id: "sesiones",
    nombre: "Visitas",
    unidad: "count",
    formula: "Sesiones en la tienda",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: {
      que_es: "Cu\xE1ntas veces entraron a tu tienda.",
      buen_valor: "Solo importa junto a la conversi\xF3n.",
      si_empeora: "Revisa el tr\xE1fico por canal."
    }
  },
  {
    id: "usuarios_nuevos",
    nombre: "Usuarios nuevos",
    unidad: "count",
    formula: "Usuarios que visitan por primera vez (GA4)",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Personas que entran por primera vez a tu tienda.", buen_valor: "Crece cuando la adquisici\xF3n funciona.", si_empeora: "Revisa el alcance de tus campa\xF1as de prospecci\xF3n." }
  },
  {
    id: "engagement",
    nombre: "Visitas con interacci\xF3n",
    unidad: "ratio",
    formula: "Sesiones con interacci\xF3n \xF7 sesiones (GA4 engagementRate)",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Qu\xE9 parte de las visitas interact\xFAa de verdad (m\xE1s de 10 s, 2 p\xE1ginas o una conversi\xF3n).", buen_valor: "Sobre ~50% en tr\xE1fico de calidad.", si_empeora: "El tr\xE1fico no es el correcto o la p\xE1gina de entrada no responde a lo que prometi\xF3 el anuncio." }
  },
  {
    id: "paginas_sesion",
    nombre: "P\xE1ginas por visita",
    unidad: "ratio",
    formula: "P\xE1ginas vistas \xF7 sesiones (GA4 screenPageViewsPerSession)",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Cu\xE1ntas p\xE1ginas mira en promedio cada visita antes de irse.", buen_valor: "2 o m\xE1s en una tienda con varios productos.", si_empeora: "La gente no encuentra un camino claro a otros productos: revisar navegaci\xF3n, productos relacionados y buscador." }
  },
  {
    id: "duracion_media",
    nombre: "Tiempo promedio por visita",
    unidad: "count",
    formula: "Duraci\xF3n promedio de la sesi\xF3n en segundos (GA4 averageSessionDuration)",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Cu\xE1nto tiempo pasa en promedio cada visita en la tienda.", buen_valor: "Sobre 1 minuto en tr\xE1fico que llega a comprar.", si_empeora: "La p\xE1gina de entrada no retiene: revisar velocidad, primera pantalla y coherencia con el anuncio." }
  },
  {
    id: "compras_ga4",
    nombre: "Compras en GA4",
    unidad: "count",
    formula: "Eventos purchase registrados por GA4",
    fuente_verdad: ["ga4"],
    rezago_dias: 1,
    mejor_si_sube: true,
    nota: "Se usa para atribuir por canal y para medir la captura de tracking contra la tienda.",
    educa: { que_es: "Compras que tu anal\xEDtica alcanz\xF3 a registrar.", buen_valor: "Cerca de los pedidos reales de la tienda.", si_empeora: "Ver captura de tracking." }
  },
  {
    id: "ingresos_ga4",
    nombre: "Ingresos en GA4",
    unidad: "money",
    formula: "purchaseRevenue de GA4",
    fuente_verdad: ["ga4"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Ventas que tu anal\xEDtica alcanz\xF3 a registrar.", buen_valor: "Cerca de la venta real.", si_empeora: "Ver captura de tracking." }
  },
  {
    id: "carritos_ga4",
    nombre: "Agregados al carrito (GA4)",
    unidad: "count",
    formula: "Eventos add_to_cart",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Veces que se agreg\xF3 un producto al carrito.", buen_valor: "Ver tasa de carrito.", si_empeora: "Ver tasa de carrito." }
  },
  {
    id: "checkouts_ga4",
    nombre: "Inicios de checkout (GA4)",
    unidad: "count",
    formula: "Eventos begin_checkout",
    fuente_verdad: ["ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Veces que alguien empez\xF3 a pagar.", buen_valor: "Ver cierre del checkout.", si_empeora: "Ver cierre del checkout." }
  },
  {
    id: "sesiones_carrito",
    nombre: "Visitas que agregan al carrito",
    unidad: "count",
    formula: "Sesiones con al menos un producto agregado",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Visitas que mostraron intenci\xF3n de compra.", buen_valor: "Ver tasa de carrito.", si_empeora: "Ver tasa de carrito." }
  },
  {
    id: "sesiones_checkout",
    nombre: "Visitas que llegan al checkout",
    unidad: "count",
    formula: "Sesiones que llegaron al pago",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Visitas que empezaron a pagar.", buen_valor: "Ver cierre del checkout.", si_empeora: "Ver cierre del checkout." }
  },
  {
    id: "sesiones_compra",
    nombre: "Visitas que compran",
    unidad: "count",
    formula: "Sesiones que completaron la compra",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Visitas que terminaron en compra.", buen_valor: "Ver conversi\xF3n.", si_empeora: "Ver conversi\xF3n." }
  },
  {
    id: "tasa_carrito",
    nombre: "Agregan al carrito",
    unidad: "ratio",
    formula: "Visitas que agregan al carrito \xF7 visitas",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: {
      que_es: "De cada 100 visitas, cu\xE1ntas agregan un producto al carrito.",
      buen_valor: "En ecommerce suele estar entre 5% y 10%.",
      si_empeora: "La ficha de producto no est\xE1 convenciendo: precio, beneficio, fotos, rese\xF1as o bot\xF3n fuera de la vista."
    }
  },
  {
    id: "tasa_cierre_checkout",
    nombre: "Terminan la compra",
    unidad: "ratio",
    formula: "Visitas que compran \xF7 visitas que llegan al checkout",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: {
      que_es: "De quienes empiezan a pagar, cu\xE1ntos terminan.",
      buen_valor: "Sobre 40\u201350%. Si es menor, hay fricci\xF3n en el checkout.",
      si_empeora: "Revisa costo de env\xEDo, medios de pago, campos obligatorios y velocidad."
    }
  },
  {
    id: "tasa_conversion",
    nombre: "Conversi\xF3n",
    unidad: "ratio",
    formula: "Visitas que compran \xF7 visitas",
    fuente_verdad: ["shopify", "ga4"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: {
      que_es: "De cada 100 visitas, cu\xE1ntas terminan comprando.",
      buen_valor: "Entre 1% y 3% es habitual; comp\xE1rala por dispositivo.",
      si_empeora: "Mira el embudo para ver en qu\xE9 paso se cae la gente."
    }
  },
  {
    id: "scroll_medio",
    nombre: "Profundidad de lectura",
    unidad: "ratio",
    formula: "Porcentaje promedio de la p\xE1gina que ve cada visita",
    fuente_verdad: ["clarity"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: {
      que_es: "Qu\xE9 parte de la p\xE1gina ve la gente en promedio.",
      buen_valor: "Si es menor a ~30% en celular, lo que est\xE1 abajo casi no se ve.",
      si_empeora: "Sube precio, beneficio principal, rese\xF1as y bot\xF3n de compra."
    }
  },
  {
    id: "rage_clicks",
    nombre: "Clics de frustraci\xF3n",
    unidad: "ratio",
    formula: "Clics repetidos r\xE1pidos por sesi\xF3n",
    fuente_verdad: ["clarity"],
    rezago_dias: 0,
    mejor_si_sube: false,
    educa: { que_es: "Clics repetidos de alguien frustrado porque algo no responde.", buen_valor: "Cercano a 0.", si_empeora: "Mira las grabaciones: algo parece clickeable y no lo es, o no funciona." }
  },
  {
    id: "dead_clicks",
    nombre: "Clics sin respuesta",
    unidad: "ratio",
    formula: "Clics sin efecto por sesi\xF3n",
    fuente_verdad: ["clarity"],
    rezago_dias: 0,
    mejor_si_sube: false,
    educa: { que_es: "Clics en elementos que no hacen nada.", buen_valor: "Cercano a 0.", si_empeora: "Revisa qu\xE9 elementos parecen botones sin serlo." }
  },
  {
    id: "quick_backs",
    nombre: "Vuelven atr\xE1s r\xE1pido",
    unidad: "ratio",
    formula: "Vueltas atr\xE1s inmediatas por sesi\xF3n",
    fuente_verdad: ["clarity"],
    rezago_dias: 0,
    mejor_si_sube: false,
    educa: { que_es: "Personas que entran a una p\xE1gina y vuelven enseguida.", buen_valor: "Bajo.", si_empeora: "La p\xE1gina no era lo que esperaban: revisa el anuncio o el enlace que lleva ah\xED." }
  },
  // ─── Pauta ───────────────────────────────────────────────
  {
    id: "gasto",
    nombre: "Inversi\xF3n",
    unidad: "money",
    formula: "Gasto de la plataforma (moneda de origen)",
    fuente_verdad: ["meta", "google_ads"],
    rezago_dias: 1,
    mejor_si_sube: null,
    educa: { que_es: "Lo invertido en esta plataforma.", buen_valor: "Juzgarlo junto al retorno.", si_empeora: "\u2014" }
  },
  {
    id: "impresiones",
    nombre: "Impresiones",
    unidad: "count",
    formula: "Veces que se mostr\xF3 el anuncio",
    fuente_verdad: ["meta", "google_ads", "gsc"],
    rezago_dias: 1,
    mejor_si_sube: null,
    educa: { que_es: "Cu\xE1ntas veces se mostr\xF3.", buen_valor: "Depende del presupuesto.", si_empeora: "\u2014" }
  },
  {
    id: "clics",
    nombre: "Clics",
    unidad: "count",
    formula: "Clics (enlace en Meta; clics en Google y Search Console)",
    fuente_verdad: ["meta", "google_ads", "gsc"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Cu\xE1ntas personas hicieron clic.", buen_valor: "Ver CTR.", si_empeora: "Ver CTR." }
  },
  {
    id: "compras_plataforma",
    nombre: "Compras (seg\xFAn la plataforma)",
    unidad: "count",
    formula: "Meta: omni_purchase \xB7 Google Ads: conversions de la acci\xF3n de compra",
    fuente_verdad: ["meta", "google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    nota: "Cada plataforma se atribuye ventas con su propia ventana. Nunca se suman entre s\xED ni se comparan sin la tienda al lado.",
    educa: {
      que_es: "Las compras que la plataforma dice haber generado, seg\xFAn su propia forma de contar.",
      buen_valor: "\xDAsala para comparar anuncios dentro de la misma plataforma, no para medir tu negocio.",
      si_empeora: "Compara contra la venta real de la tienda y el retorno total."
    }
  },
  {
    id: "valor_compras_plataforma",
    nombre: "Valor de compras (seg\xFAn la plataforma)",
    unidad: "money",
    formula: "Meta: omni_purchase_values \xB7 Google Ads: conversions_value",
    fuente_verdad: ["meta", "google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Ventas que la plataforma se atribuye.", buen_valor: "Ver compras seg\xFAn la plataforma.", si_empeora: "\u2014" }
  },
  {
    id: "cpa_plataforma",
    nombre: "Costo por compra",
    unidad: "money",
    formula: "Inversi\xF3n \xF7 compras seg\xFAn la plataforma",
    fuente_verdad: ["meta", "google_ads"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: {
      que_es: "Cu\xE1nto te cuesta cada compra seg\xFAn la plataforma.",
      buen_valor: "Bajo tu CPA objetivo (se configura por cliente seg\xFAn el margen).",
      si_empeora: "Revisa si subi\xF3 el costo por mil (subasta), baj\xF3 el CTR (creativo) o baj\xF3 la conversi\xF3n (landing)."
    }
  },
  {
    id: "roas_plataforma",
    nombre: "Retorno (seg\xFAn la plataforma)",
    unidad: "multiple",
    formula: "Valor de compras seg\xFAn la plataforma \xF7 inversi\xF3n",
    fuente_verdad: ["meta", "google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    nota: "Siempre se muestra con el MER al lado (regla S-NEG-02).",
    educa: {
      que_es: "Cu\xE1nto dice vender la plataforma por cada $1 invertido.",
      buen_valor: "Sirve para comparar dentro de la plataforma. Para tu negocio, mira el retorno total (MER).",
      si_empeora: "Revisa el \xE1rbol: subasta \u2192 creativo \u2192 landing."
    }
  },
  {
    id: "ctr",
    nombre: "Clics sobre vistas (CTR)",
    unidad: "ratio",
    formula: "Clics \xF7 impresiones (Meta: website_ctr, de enlace)",
    fuente_verdad: ["meta", "google_ads", "gsc"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "De cada 100 personas que ven el anuncio, cu\xE1ntas hacen clic.",
      buen_valor: "En Meta, sobre ~1% de clic en enlace suele ser sano.",
      si_empeora: "El creativo perdi\xF3 fuerza o la audiencia ya lo vio demasiadas veces."
    }
  },
  {
    id: "cpm",
    nombre: "Costo por mil impresiones",
    unidad: "money",
    formula: "Inversi\xF3n \xF7 impresiones \xD7 1.000",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: {
      que_es: "Cu\xE1nto cuesta que el anuncio se muestre 1.000 veces.",
      buen_valor: "Sube en temporadas de alta competencia (Cyber, Navidad).",
      si_empeora: "Si sube sin que cambien tus creativos, es la subasta: no cambies creativos por eso."
    }
  },
  {
    id: "vistas_landing",
    nombre: "Llegan a la p\xE1gina",
    unidad: "count",
    formula: "Meta omni_landing_page_view",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Personas que hicieron clic y esperaron a que cargue la p\xE1gina.", buen_valor: "Cerca de los clics; si es mucho menor, la p\xE1gina carga lento.", si_empeora: "Revisa la velocidad de la p\xE1gina de destino." }
  },
  {
    id: "carritos_plataforma",
    nombre: "Agregan al carrito (seg\xFAn la plataforma)",
    unidad: "count",
    formula: "Meta omni_add_to_cart",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Carritos que la plataforma atribuye a este anuncio.", buen_valor: "Ver tasa sobre llegadas a la p\xE1gina.", si_empeora: "La p\xE1gina de destino no convence a quien llega desde este anuncio." }
  },
  {
    id: "checkouts_plataforma",
    nombre: "Inician el pago (seg\xFAn la plataforma)",
    unidad: "count",
    formula: "Meta omni_initiated_checkout",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Inicios de pago atribuidos a este anuncio.", buen_valor: "Comp\xE1ralo contra carritos y compras.", si_empeora: "Revisa el checkout." }
  },
  {
    id: "video_3s",
    nombre: "Reproducciones de 3 segundos",
    unidad: "count",
    formula: "Meta 3_second_video_plays (solo conjunto/campa\xF1a)",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Veces que el video se vio al menos 3 segundos.", buen_valor: "Base del hook rate.", si_empeora: "El inicio del video no retiene." }
  },
  {
    id: "video_p25",
    nombre: "Ven el 25% del video",
    unidad: "count",
    formula: "Meta video_p25_watched_actions",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Veces que se vio al menos un cuarto del video.", buen_valor: "Aproxima el hook rate por anuncio.", si_empeora: "El inicio del video no retiene." }
  },
  {
    id: "thruplay",
    nombre: "Ven el video completo (ThruPlay)",
    unidad: "count",
    formula: "Meta video_thruplay_watched_actions",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Veces que el video se vio completo o 15 segundos.", buen_valor: "Base del hold rate.", si_empeora: "El desarrollo del video no sostiene la atenci\xF3n." }
  },
  {
    id: "cuota_superior",
    nombre: "Cuota en la parte superior",
    unidad: "ratio",
    formula: "Google search_top_impression_share",
    fuente_verdad: ["google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "En qu\xE9 parte de las b\xFAsquedas apareces arriba de los resultados.", buen_valor: "Alta en campa\xF1as de marca.", si_empeora: "Un competidor puja por tu marca o baj\xF3 tu calidad." }
  },
  {
    id: "alcance",
    nombre: "Alcance",
    unidad: "count",
    formula: "Personas \xFAnicas que vieron el anuncio",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Cu\xE1ntas personas distintas vieron tus anuncios.", buen_valor: "Crece con la prospecci\xF3n.", si_empeora: "Si baja con el mismo gasto, la audiencia se est\xE1 agotando." }
  },
  {
    id: "frecuencia",
    nombre: "Frecuencia",
    unidad: "multiple",
    formula: "Impresiones \xF7 alcance",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: {
      que_es: "Cu\xE1ntas veces vio el anuncio cada persona, en promedio.",
      buen_valor: "En prospecci\xF3n, bajo 3. En retargeting tolera m\xE1s, pero sobre ~6 satura.",
      si_empeora: "Ampl\xEDa la audiencia o renueva creativos."
    }
  },
  {
    id: "hook_rate",
    nombre: "Retenci\xF3n inicial del video",
    unidad: "ratio",
    formula: "Reproducciones de 3 s \xF7 impresiones (por conjunto) \xB7 aproximado por anuncio: reproducciones al 25% \xF7 impresiones",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Qu\xE9 parte de quienes ven el video no lo pasan de largo.",
      buen_valor: "Sobre ~25\u201330% es un buen gancho.",
      si_empeora: "Cambia los primeros 3 segundos del video."
    }
  },
  {
    id: "hold_rate",
    nombre: "Retenci\xF3n del video",
    unidad: "ratio",
    formula: "ThruPlay \xF7 impresiones",
    fuente_verdad: ["meta"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Qu\xE9 parte ve el video completo (o 15 s).", buen_valor: "Comp\xE1ralo entre tus videos.", si_empeora: "El desarrollo del video no sostiene la atenci\xF3n." }
  },
  {
    id: "cuota_impr",
    nombre: "Cuota de impresiones",
    unidad: "ratio",
    formula: "Impresiones obtenidas \xF7 impresiones posibles",
    fuente_verdad: ["google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "De todas las b\xFAsquedas donde podr\xEDas aparecer, en cu\xE1ntas apareces.", buen_valor: "En campa\xF1as de marca, sobre 85\u201390%.", si_empeora: "Mira si pierdes por presupuesto o por ranking." }
  },
  {
    id: "cuota_perdida_ppto",
    nombre: "B\xFAsquedas perdidas por presupuesto",
    unidad: "ratio",
    formula: "search_budget_lost_impression_share",
    fuente_verdad: ["google_ads"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: { que_es: "B\xFAsquedas donde no apareciste porque se acab\xF3 el presupuesto.", buen_valor: "Cercano a 0 en campa\xF1as rentables.", si_empeora: "Si la campa\xF1a es rentable, sube el presupuesto." }
  },
  {
    id: "cuota_perdida_rank",
    nombre: "B\xFAsquedas perdidas por ranking",
    unidad: "ratio",
    formula: "search_rank_lost_impression_share",
    fuente_verdad: ["google_ads"],
    rezago_dias: 1,
    mejor_si_sube: false,
    educa: { que_es: "B\xFAsquedas donde no apareciste por calidad o puja insuficiente.", buen_valor: "Bajo.", si_empeora: "Mejora anuncio, landing o puja." }
  },
  {
    id: "quality_score",
    nombre: "Nivel de calidad",
    unidad: "count",
    formula: "Quality Score de Google (1 a 10)",
    fuente_verdad: ["google_ads"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: { que_es: "Qu\xE9 tan relevante considera Google tu anuncio y tu p\xE1gina para esa b\xFAsqueda.", buen_valor: "7 o m\xE1s.", si_empeora: "Con 4 o menos pagas m\xE1s caro cada clic: revisa anuncio y landing." }
  },
  {
    id: "posicion",
    nombre: "Posici\xF3n promedio",
    unidad: "position",
    formula: "Posici\xF3n media en Google",
    fuente_verdad: ["gsc"],
    rezago_dias: 3,
    mejor_si_sube: false,
    educa: { que_es: "En qu\xE9 lugar apareces en los resultados de Google.", buen_valor: "Top 3 recibe la mayor\xEDa de los clics.", si_empeora: "Revisa si la p\xE1gina perdi\xF3 relevancia o si hay canibalizaci\xF3n." }
  },
  // ─── Email ───────────────────────────────────────────────
  {
    id: "ingreso_email",
    nombre: "Ingreso de email",
    unidad: "money",
    formula: "Ingreso atribuido por Klaviyo a flows + campa\xF1as",
    fuente_verdad: ["klaviyo"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Ventas que Klaviyo atribuye a tus emails.", buen_valor: "Ver peso del canal propio.", si_empeora: "Revisa flows y calendario de campa\xF1as." }
  },
  {
    id: "pedidos_email",
    nombre: "Pedidos de email",
    unidad: "count",
    formula: "Placed Order atribuidos por Klaviyo a un flow o campa\xF1a",
    fuente_verdad: ["klaviyo"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Pedidos que Klaviyo atribuye a tus emails.", buen_valor: "Ver peso del canal propio.", si_empeora: "Revisa flows y campa\xF1as." }
  },
  {
    id: "ingreso_email_no_atribuido",
    nombre: "Venta no atribuida a email",
    unidad: "money",
    formula: "Placed Order sin flow/campa\xF1a atribuida (Klaviyo)",
    fuente_verdad: ["klaviyo"],
    rezago_dias: 0,
    mejor_si_sube: null,
    nota: "Ingreso email + no atribuido \u2248 venta total de la tienda: sirve para conciliar Klaviyo con la tienda.",
    educa: { que_es: "Ventas que Klaviyo registr\xF3 pero no atribuye a ning\xFAn email.", buen_valor: "\u2014", si_empeora: "\u2014" }
  },
  {
    id: "pedidos_email_no_atribuido",
    nombre: "Pedidos no atribuidos a email",
    unidad: "count",
    formula: "Placed Order sin flow/campa\xF1a atribuida (Klaviyo)",
    fuente_verdad: ["klaviyo"],
    rezago_dias: 0,
    mejor_si_sube: null,
    educa: { que_es: "Pedidos que Klaviyo registr\xF3 pero no atribuye a ning\xFAn email.", buen_valor: "\u2014", si_empeora: "\u2014" }
  },
  {
    id: "peso_email",
    nombre: "Peso del canal propio",
    unidad: "ratio",
    formula: "Ingreso de email \xF7 venta total de la tienda",
    fuente_verdad: ["klaviyo", "tienda"],
    rezago_dias: 1,
    mejor_si_sube: true,
    educa: {
      que_es: "Qu\xE9 parte de tu venta viene de tu base de emails.",
      buen_valor: "En marcas sanas suele estar entre 15% y 30%.",
      si_empeora: "Revisa que est\xE9n los flows clave y la frecuencia de campa\xF1as."
    }
  },
  {
    id: "altas_lista",
    nombre: "Nuevos suscriptores",
    unidad: "count",
    formula: "Eventos 'Subscribed to List' por lista",
    fuente_verdad: ["klaviyo"],
    rezago_dias: 0,
    mejor_si_sube: true,
    educa: { que_es: "Personas que se suman a tu base.", buen_valor: "Estable o creciendo.", si_empeora: "Si cae a 0, revisa que el popup o formulario est\xE9 activo." }
  }
];
var METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));

// src/bundle/build.ts
var BUNDLE_VERSION = "0.1.0";
function pivot(rows, filter, dimKeys = []) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows.filter(filter)) {
    const key = [r.entity_id, ...dimKeys.map((d2) => r.dims?.[d2] ?? "")].join("|");
    const t = map.get(key) ?? { entidad: r.entity_name ?? r.entity_id, ...Object.fromEntries(dimKeys.map((d2) => [d2, r.dims?.[d2] ?? ""])) };
    t[r.metric] = r.value;
    map.set(key, t);
  }
  return [...map.values()];
}
function pivotReport(config2, rows, filter, dimKeys = []) {
  return pivot(rows.filter(filter).map((r) => r.currency ? { ...r, value: toReport(config2, r.value, r.currency, r.date_to), currency: config2.moneda_reporte } : r), () => true, dimKeys);
}
function configCompleteness(config2, mes) {
  const checks = [
    { ok: !!config2.metas[mes]?.ventas_total, campo: `Meta de venta de ${mes}`, desbloquea: "el veredicto de si vas bien o mal en el mes" },
    { ok: config2.costos.validado, campo: "Costo de producto (COGS) validado", desbloquea: "la contribuci\xF3n real (hoy es estimada)" },
    { ok: !!config2.umbrales.cpa_objetivo, campo: "CPA objetivo", desbloquea: "los ganadores y perdedores de pauta" },
    { ok: config2.terminos_marca.length > 0, campo: "T\xE9rminos de marca", desbloquea: "SEO separado entre marca y no-marca" },
    { ok: config2.competidores.length > 0, campo: "Competidores", desbloquea: "la p\xE1gina de Competencia" }
  ];
  const ok = checks.filter((c) => c.ok).length;
  return { pct: Math.round(ok / checks.length * 100), faltantes: checks.filter((c) => !c.ok).map(({ campo, desbloquea }) => ({ campo, desbloquea })) };
}
function buildBundle(input) {
  const { config: config2, daily } = input;
  const rows = daily.rows;
  const fx = config2.fx.modo === "fijo" ? Object.entries(config2.fx.tasas).map(([k, v]) => `${k.replace("_", "\u2192")} ${v.toLocaleString("es-CL")} (fijo)`).join(" \xB7 ") : `Tipo de cambio diario (${config2.fx.fuente})`;
  const mes = input.hasta.slice(0, 7);
  const used = new Set(rows.map((r) => r.metric));
  for (const k of ["ventas_total", "pedidos", "aov", "mer", "descuentos_pct", "captura_tracking", "tasa_carrito", "tasa_cierre_checkout", "tasa_conversion", "gasto_ads", "clientes_nuevos", "clientes_recurrentes", "scroll_medio", "cpa_plataforma", "roas_plataforma", "hook_rate", "hold_rate", "posicion", "ctr", "clics", "impresiones", "ingreso_email", "peso_email", "altas_lista", "pedidos_email"]) used.add(k);
  const sumRep = (f) => {
    const hit = rows.filter(f);
    return hit.length ? hit.reduce((a, r) => a + (r.currency ? toReport(config2, r.value, r.currency, r.date_to) : r.value), 0) : null;
  };
  const metaAcc = (m) => sumRep((r) => r.source === "meta" && r.level === "account" && r.metric === m);
  const gCamp = (m) => sumRep((r) => r.source === "google_ads" && r.level === "campaign" && r.metric === m);
  const gGasto = gCamp("gasto"), gCompras = gCamp("compras_plataforma");
  const metaAds = pivotReport(config2, rows, (r) => r.source === "meta" && r.level === "ad").map((t) => ({
    ...t,
    veredicto: adVerdict(config2, Number(t.gasto ?? 0), t.compras_plataforma === void 0 ? null : Number(t.compras_plataforma))
  }));
  const kw = pivotReport(config2, rows, (r) => r.source === "google_ads" && r.level === "keyword", ["match_type"]);
  const kwTexts = new Set(kw.map((k) => String(k.entidad).toLowerCase()));
  const terminos = pivotReport(config2, rows, (r) => r.source === "google_ads" && r.level === "search_term", ["name"]).map((t) => ({
    ...t,
    // Candidato a negativa: gastó sobre el piso sin compras. Candidato a keyword: compra y no existe como keyword.
    sugerencia: Number(t.compras_plataforma ?? 0) === 0 && Number(t.gasto ?? 0) >= (config2.umbrales.piso_gasto ?? 0) / 4 ? "negativa" : Number(t.compras_plataforma ?? 0) >= 2 && !kwTexts.has(String(t.entidad).toLowerCase()) ? "nueva keyword" : ""
  }));
  const opp = input.metaOpportunity;
  const recsByType = /* @__PURE__ */ new Map();
  for (const r of opp?.recommendations ?? []) {
    const prev = recsByType.get(r.type);
    if (prev) {
      prev.entidades += r.object_ids?.length ?? 0;
      continue;
    }
    recsByType.set(r.type, { tipo: r.type, texto: r.recommendation_content?.lift_estimate ?? r.type, lectura: META_REC_LECTURA[r.type] ?? "Evaluar contra el MER y los umbrales antes de aplicar.", url: r.url, entidades: r.object_ids?.length ?? 0 });
  }
  return {
    version: BUNDLE_VERSION,
    meta: {
      cliente: config2.cliente,
      marca: config2.marca_reporte.nombre,
      marca_blanca: config2.marca_reporte.marca_blanca,
      moneda: config2.moneda_reporte,
      desde: input.desde,
      hasta: input.hasta,
      capturado: input.capturado,
      fx_nota: fx,
      cogs_pct: config2.costos.cogs_pct_default ?? null,
      cogs_validado: config2.costos.validado,
      cpa_objetivo: config2.umbrales.cpa_objetivo ?? null,
      cpa_techo: config2.umbrales.cpa_techo ?? null,
      patron_creativos: config2.nomenclatura_creativos?.patron ?? null
    },
    kpis: daily.kpis,
    funnel: daily.funnel,
    reconciliation: daily.reconciliation,
    findings: input.findings,
    health: daily.health,
    config_completitud: configCompleteness(config2, mes),
    historia: input.historia ? { ...input.historia, yoy: yearOverYear(input.historia.series, mes, ["ventas_total", "pedidos", "mer", "captura_tracking", "descuentos_pct"]) } : null,
    tablas: {
      canales: pivot(rows, (r) => r.source === "ga4" && r.level === "channel"),
      productos: pivot(rows, (r) => r.source === "shopify" && r.level === "product"),
      landing: pivot(rows, (r) => r.source === "ga4" && r.level === "page", ["deviceCategory"]),
      clarity: pivot(rows, (r) => r.source === "clarity" && r.level === "device"),
      meta_ads: metaAds,
      google_campanas: pivotReport(config2, rows, (r) => r.source === "google_ads" && r.level === "campaign", ["advertising_channel_type"]),
      google_asset_groups: pivotReport(config2, rows, (r) => r.source === "google_ads" && r.level === "asset_group", ["name"]),
      google_productos: pivotReport(config2, rows, (r) => r.source === "google_ads" && r.level === "product"),
      google_keywords: kw,
      google_terminos: terminos
    },
    seo: input.seo ?? null,
    email: input.email ?? null,
    competencia: input.competencia ?? null,
    war_room: input.warRoom ?? null,
    google_dashboard: input.googleDashboard ?? null,
    arbol: input.arbol ?? null,
    cro: input.cro ?? null,
    seo_dashboard: input.seoDash ?? null,
    meta_dashboard: input.metaDash ?? null,
    ventas_dashboard: input.ventasDash ?? null,
    email_dashboard: input.emailDash ?? null,
    competencia_dashboard: input.compDash ?? null,
    meta_recs: opp ? { puntaje: opp.opportunity_score ?? null, items: [...recsByType.values()] } : null,
    pauta: {
      meta: { gasto: metaAcc("gasto"), compras: metaAcc("compras_plataforma"), valor: metaAcc("valor_compras_plataforma"), impresiones: metaAcc("impresiones"), alcance: metaAcc("alcance") },
      google: { gasto: gGasto, compras: gCompras, valor: gCamp("valor_compras_plataforma"), cpa_cuenta: gGasto !== null && gCompras ? gGasto / gCompras : null }
    },
    diccionario: Object.fromEntries(
      METRICS.filter((m) => used.has(m.id)).map((m) => [m.id, { nombre: m.nombre, formula: m.formula, que_es: m.educa.que_es, buen_valor: m.educa.buen_valor, si_empeora: m.educa.si_empeora }])
    )
  };
}

// src/bundle/assemble.ts
function assemble(input) {
  const { config: config2, daily, read } = input;
  const seo = config2.fuentes.gsc ? seoBlock(config2, daily.rows, { quickWins: read("gsc-quick-wins.json"), ctrGaps: read("gsc-ctr-gaps.json"), overview: read("gsc-overview.json") }) : null;
  const email = config2.fuentes.klaviyo ? emailBlock(config2, daily.rows, daily.kpis.ventas_total, { flows: read("klaviyo-flows.json"), campaigns: read("klaviyo-campaigns.json") }) : null;
  const library = [...(config2.competencia?.terminos ?? []).map((t) => read(`meta-library-${slug(t)}.json`)), read("meta-library-competidores.json")].filter((x) => x !== void 0);
  const competencia = config2.competencia ? competenciaBlock(config2, input.capturado, library) : null;
  const fechaActualizacion = new Intl.DateTimeFormat("en-CA", { timeZone: config2.zona_horaria }).format(new Date(input.capturado));
  const warRoom = warRoomBlock(config2, [...daily.rows, ...daily.series], input.hasta, { email, captura: daily.kpis.captura_tracking, fechaActualizacion });
  const findings = detect({ config: config2, rows: daily.rows, kpis: daily.kpis, funnel: daily.funnel, health: daily.health, seo, email, warRoom });
  const arbol = arbolNegocio({ config: config2, kpis: daily.kpis, funnel: daily.funnel, series: daily.series, anterior: previousPeriod(input.desde, input.hasta), emailPeso: email?.peso ?? null, escenarios: findings });
  const cro = croDashboard({ config: config2, series: daily.series, funnel: daily.funnel, desde: input.desde, hasta: input.hasta, anterior: previousPeriod(input.desde, input.hasta), captura: daily.kpis.captura_tracking, ticket: daily.kpis.aov, escenarios: findings });
  const seoDash = seoDashboard({ config: config2, series: daily.series, desde: input.desde, hasta: input.hasta, anterior: previousPeriod(input.desde, input.hasta), escenarios: findings });
  const metaDash = metaDashboard({ config: config2, rows: daily.rows, series: daily.series, desde: input.desde, hasta: input.hasta, anterior: previousPeriod(input.desde, input.hasta), pedidosTienda: daily.kpis.pedidos, creativos: read("meta-creatives.json"), costoPedidoMax: arbol.economia.costo_pedido_maximo, escenarios: findings });
  const comp = previousPeriod(input.desde, input.hasta);
  const prevRows = daily.series.filter((r) => r.date_from === comp[0] && r.date_to === comp[1]);
  const kpisAnt = prevRows.some((r) => r.level === "store") ? businessKpis(prevRows, config2) : null;
  const ventasDash = ventasDashboard({ config: config2, series: daily.series, rows: daily.rows, kpis: daily.kpis, kpisAnt, desde: input.desde, hasta: input.hasta, anterior: comp });
  const emailDash = email ? emailDashboard({
    config: config2,
    series: daily.series,
    block: email,
    desde: input.desde,
    hasta: input.hasta,
    anterior: comp,
    ventaTienda: daily.kpis.ventas_total,
    ventaTiendaAnt: kpisAnt?.ventas_total ?? null,
    ventaDiaria: ventasDash?.dias.map((d2) => ({ fecha: d2.fecha, venta: d2.venta })),
    campanasActuales: read("klaviyo-campaigns.json"),
    campanasAnt: read("klaviyo-campaigns-prev.json"),
    escenarios: findings
  }) : null;
  const compDash = config2.competencia ? compDashboard({
    config: config2,
    capturado: input.capturado,
    raws: (config2.competencia.terminos ?? []).map((t) => read(`meta-library-${slug(t)}.json`)).filter((x) => x !== void 0),
    rawCompetidores: read("meta-library-competidores.json")
  }) : null;
  const googleDashboard = gadsDashboard(config2, daily.series, input.desde, input.hasta, previousPeriod(input.desde, input.hasta), findings.filter((f) => f.page === "google_ads"), arbol.economia);
  return buildBundle({
    config: config2,
    desde: input.desde,
    hasta: input.hasta,
    capturado: input.capturado,
    daily,
    findings,
    historia: input.historia,
    metaOpportunity: read("meta-opportunity.json"),
    seo,
    email,
    competencia,
    warRoom,
    googleDashboard,
    arbol,
    cro,
    seoDash,
    metaDash,
    ventasDash,
    emailDash,
    compDash
  });
}

// src/core/validate.ts
var PAGES = ["resumen", "ventas", "cro", "meta", "google_ads", "seo", "email", "competencia", "war_room"];
var isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
var isCur = (s) => typeof s === "string" && /^[A-Z]{3}$/.test(s);
var digits = (s) => typeof s === "string" && /^\d+$/.test(s);
function validTz(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function validateConfig(input) {
  const errores = [];
  const avisos = [];
  if (!input || typeof input !== "object") return { errores: ["La configuraci\xF3n no es un objeto JSON"], avisos };
  const c = input;
  if (typeof c.cliente !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.cliente)) errores.push('"cliente" debe ser un identificador en min\xFAsculas y con guiones (p. ej. "mi-marca")');
  if (!c.marca_reporte?.nombre) errores.push('Falta "marca_reporte.nombre" (el nombre que se muestra en el panel)');
  if (typeof c.mercado !== "string" || !/^[A-Z]{2}$/.test(c.mercado)) errores.push('"mercado" debe ser el c\xF3digo de pa\xEDs de 2 letras (p. ej. "CL")');
  if (!isCur(c.moneda_reporte)) errores.push('"moneda_reporte" debe ser un c\xF3digo de moneda de 3 letras (p. ej. "CLP")');
  if (!validTz(c.zona_horaria)) errores.push(`"zona_horaria" no es v\xE1lida: ${JSON.stringify(c.zona_horaria)} (p. ej. "America/Santiago")`);
  const tiendas = Array.isArray(c.tiendas) ? c.tiendas : [];
  if (!tiendas.length) errores.push('Falta al menos una tienda en "tiendas" (la tienda es la fuente de verdad de la venta)');
  for (const t of tiendas) {
    if (t.plataforma !== "shopify" && t.plataforma !== "tiendanube") errores.push(`Plataforma de tienda desconocida: ${JSON.stringify(t.plataforma)}`);
    if (t.plataforma === "tiendanube") avisos.push("Tiendanube todav\xEDa no tiene conector: esa tienda no se captura");
    if (!t.id) errores.push(`La tienda ${t.plataforma} no tiene "id"`);
    if (!isCur(t.moneda)) errores.push(`La tienda ${t.plataforma} necesita "moneda" de 3 letras`);
  }
  const f = c.fuentes ?? {};
  const monedas = new Set(tiendas.map((t) => t.moneda).filter(isCur));
  const meta = f.meta;
  if (meta) {
    const cuentas = Array.isArray(meta.cuentas) ? meta.cuentas : [];
    if (!cuentas.length) errores.push('Meta: falta "cuentas" (IDs de cuentas publicitarias)');
    for (const a of cuentas) if (!digits(a)) errores.push(`Meta: la cuenta ${JSON.stringify(a)} debe ser solo n\xFAmeros, sin "act_"`);
    if (!isCur(meta.moneda)) errores.push('Meta: falta "moneda" de la cuenta (3 letras, p. ej. "USD")');
    else monedas.add(meta.moneda);
  }
  const gads = f.google_ads;
  if (gads) {
    const cuentas = Array.isArray(gads.cuentas) ? gads.cuentas : [];
    if (!cuentas.length) errores.push('Google Ads: falta "cuentas"');
    for (const a of cuentas) if (!digits(a) || String(a).length !== 10) errores.push(`Google Ads: la cuenta ${JSON.stringify(a)} debe tener 10 d\xEDgitos, sin guiones`);
    if (!isCur(gads.moneda)) errores.push('Google Ads: falta "moneda" de la cuenta');
    else monedas.add(gads.moneda);
  }
  const ga4 = f.ga4;
  if (ga4 && !digits(ga4.propiedad)) errores.push('GA4: "propiedad" debe ser el ID num\xE9rico de la propiedad');
  const gsc = f.gsc;
  if (gsc) {
    const p = gsc.propiedad;
    if (typeof p !== "string" || !(p.startsWith("sc-domain:") || /^https?:\/\//.test(p) && p.endsWith("/")))
      errores.push('Search Console: "propiedad" debe ser "sc-domain:dominio.com" o una URL terminada en "/"');
  }
  const kl = f.klaviyo;
  if (kl) {
    if (!kl.metrica_compra) errores.push('Klaviyo: falta "metrica_compra" (ID de la m\xE9trica de pedido)');
    if (!kl.metrica_alta) avisos.push('Klaviyo: sin "metrica_alta" no se mide el crecimiento de la lista');
  }
  const faltan = [["meta", "Creativos \xB7 Meta"], ["google_ads", "B\xFAsqueda paga \xB7 Google"], ["ga4", "parte de Conversi\xF3n y la conciliaci\xF3n"], ["gsc", "SEO"], ["klaviyo", "Email y retenci\xF3n"], ["clarity", "el comportamiento de la visita en CRO"]];
  for (const [src, pagina] of faltan) if (!f[src]) avisos.push(`Sin ${src}: queda vac\xEDo ${pagina}`);
  const fx = c.fx;
  if (!fx || fx.modo !== "fijo" && fx.modo !== "diario") errores.push('"fx.modo" debe ser "fijo" o "diario"');
  else if (isCur(c.moneda_reporte)) {
    for (const m of monedas) {
      if (m === c.moneda_reporte) continue;
      const k = `${m}_${c.moneda_reporte}`, inv = `${c.moneda_reporte}_${m}`;
      const tasas = fx.modo === "fijo" ? fx.tasas ?? {} : fx.fallback ?? {};
      const t = tasas[k] ?? tasas[inv];
      if (!(typeof t === "number" && t > 0)) errores.push(`Falta el tipo de cambio ${k}: sin \xE9l no se puede sumar la inversi\xF3n en ${m}`);
      else if (fx.modo === "fijo") avisos.push(`Tipo de cambio ${k} fijo (${t}): conviene actualizarlo cada mes`);
    }
  }
  if (!Array.isArray(c.terminos_marca) || !c.terminos_marca.length) avisos.push("Sin t\xE9rminos de marca: SEO no separa marca de no-marca");
  const u = c.umbrales ?? {};
  for (const [k, v] of Object.entries(u)) if (v !== void 0 && !(typeof v === "number" && v >= 0)) errores.push(`Umbral "${k}" debe ser un n\xFAmero positivo`);
  if (!u.cpa_objetivo) avisos.push("Sin costo por compra objetivo: no se marcan ganadores ni perdedores de pauta");
  if (u.cpa_objetivo && u.cpa_eficiencia && u.cpa_objetivo > u.cpa_eficiencia) errores.push("El costo por compra objetivo no puede ser mayor que el de eficiencia");
  if (u.cpa_eficiencia && u.cpa_techo && u.cpa_eficiencia > u.cpa_techo) errores.push("El costo por compra de eficiencia no puede ser mayor que el techo");
  const cogs = c.costos?.cogs_pct_default;
  if (cogs !== void 0 && !(cogs > 0 && cogs < 1)) errores.push('"costos.cogs_pct_default" va como fracci\xF3n entre 0 y 1 (35% = 0.35)');
  if (!c.costos?.validado) avisos.push("Costo de producto sin validar: la contribuci\xF3n se muestra como estimada");
  for (const [mes, m] of Object.entries(c.metas ?? {})) if (!/^\d{4}-\d{2}$/.test(mes)) errores.push(`Meta con mes inv\xE1lido: "${mes}" (formato AAAA-MM)`);
  else if (m && Object.values(m).some((v) => !(typeof v === "number" && v > 0))) errores.push(`Las metas de ${mes} deben ser n\xFAmeros positivos`);
  for (const e of c.calendario?.eventos_propios ?? []) {
    if (!e.nombre) errores.push("Hay un evento sin nombre");
    if (!isDate(e.desde) || e.hasta !== void 0 && !isDate(e.hasta)) errores.push(`Evento "${e.nombre}": fechas en formato AAAA-MM-DD`);
    else if (e.hasta && e.hasta < e.desde) errores.push(`Evento "${e.nombre}": termina antes de empezar`);
    if (e.meta_venta !== void 0 && !(e.meta_venta > 0)) errores.push(`Evento "${e.nombre}": la meta de venta debe ser positiva`);
    if (e.referencia && (!isDate(e.referencia.desde) || !isDate(e.referencia.hasta) || e.referencia.hasta < e.referencia.desde)) errores.push(`Evento "${e.nombre}": la referencia necesita fechas v\xE1lidas`);
    if (!e.referencia) avisos.push(`Evento "${e.nombre}" sin evento anterior de referencia: la curva esperada ser\xE1 lineal`);
  }
  for (const p of c.paginas_activas ?? []) if (!PAGES.includes(p)) errores.push(`P\xE1gina desconocida en "paginas_activas": ${JSON.stringify(p)}`);
  if (!c.paginas_activas?.length) errores.push('"paginas_activas" no puede estar vac\xEDo');
  if (!Array.isArray(c.competidores)) errores.push('"competidores" debe ser una lista (puede estar vac\xEDa)');
  else if (!c.competidores.length && !c.competencia?.terminos?.length) avisos.push("Sin competidores ni t\xE9rminos de b\xFAsqueda: la p\xE1gina de Competencia queda vac\xEDa");
  return { errores, avisos };
}

// scripts/cc.ts
import { copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
var [cmd, configPath, ...rest] = process.argv.slice(2);
if (cmd === "save") {
  const [dir, saveAs, src] = [configPath, ...rest];
  if (!dir || !saveAs || !src) fail("uso: save <carpeta-captura> <save_as> <archivo-origen>");
  const rawDir = join(resolve(dir), "raw");
  mkdirSync(rawDir, { recursive: true });
  const value = toRaw(readFileSync(resolve(src), "utf8"));
  writeFileSync(join(rawDir, saveAs), JSON.stringify(value));
  console.log(`\u2714 guardado raw/${saveAs}`);
  process.exit(0);
}
var isDate2 = (s) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
function fail(msg) {
  console.error(`\u2716 ${msg}`);
  process.exit(1);
}
if (!cmd || !configPath) fail("uso: cc plan|ingest|history-plan|history-ingest|bundle|validate|save|publish <config.json> \u2026");
if (!existsSync(resolve(configPath))) fail(`no existe la configuraci\xF3n ${resolve(configPath)}`);
var parsed;
try {
  parsed = JSON.parse(readFileSync(resolve(configPath), "utf8"));
} catch (e) {
  fail(`la configuraci\xF3n no es JSON v\xE1lido: ${e.message}`);
}
var config = parsed;
if (cmd === "args") {
  const [dir, from, to, saveAs] = rest;
  if (!dir || !isDate2(from) || !isDate2(to) || !saveAs) fail("uso: args <config> <carpeta-captura> <desde> <hasta> <save_as>");
  const step = buildCapturePlan(config, from, to).find((s) => s.save_as === saveAs);
  if (!step) fail(`no hay un paso ${saveAs} en el plan`);
  if (!step.args_from) {
    console.log(JSON.stringify(step.args));
    process.exit(0);
  }
  const src = join(resolve(dir), "raw", step.args_from.file);
  if (!existsSync(src)) fail(`falta ${step.args_from.file}: ejecuta ese paso antes`);
  const raw = JSON.parse(readFileSync(src, "utf8"));
  const lista = typeof raw.ad_entities === "string" ? JSON.parse(raw.ad_entities) : raw.ad_entities ?? raw;
  const valores = [...new Set((Array.isArray(lista) ? lista : []).map((x) => x[step.args_from.campo]).filter((v) => v !== void 0 && v !== null && v !== "").map(String))].slice(0, step.args_from.max ?? 100);
  console.log(JSON.stringify({ ...step.args, [step.args_from.como]: valores }));
  process.exit(0);
}
if (cmd === "validate") {
  const { errores, avisos } = validateConfig(config);
  for (const e of errores) console.log(`\u2716 ${e}`);
  for (const a of avisos) console.log(`\u26A0 ${a}`);
  console.log(errores.length ? `\u2716 ${errores.length} errores: corr\xEDgelos antes de capturar` : `\u2714 configuraci\xF3n v\xE1lida${avisos.length ? ` (${avisos.length} avisos)` : ""}`);
  process.exit(errores.length ? 1 : 0);
}
if (cmd === "plan") {
  const [from, to] = rest;
  if (!isDate2(from) || !isDate2(to)) fail("fechas YYYY-MM-DD");
  console.log(JSON.stringify(buildCapturePlan(config, from, to), null, 2));
} else if (cmd === "ingest") {
  const [dir, from, to] = rest;
  if (!dir || !isDate2(from) || !isDate2(to)) fail("uso: ingest <config> <carpeta> <desde> <hasta>");
  const rawDir = join(resolve(dir), "raw");
  if (!existsSync(rawDir)) fail(`no existe ${rawDir}`);
  const read = (f) => existsSync(join(rawDir, f)) ? JSON.parse(readFileSync(join(rawDir, f), "utf8")) : void 0;
  const plan = buildCapturePlan(config, from, to);
  const res = ingest(config, plan, read, from, to, (/* @__PURE__ */ new Date()).toISOString());
  mkdirSync(resolve(dir), { recursive: true });
  writeFileSync(join(resolve(dir), "metrics.json"), JSON.stringify(res.rows));
  writeFileSync(join(resolve(dir), "kpis.json"), JSON.stringify({ kpis: res.kpis, funnel: res.funnel, reconciliation: res.reconciliation }, null, 2));
  writeFileSync(join(resolve(dir), "health.json"), JSON.stringify({ health: res.health, missing: res.missing }, null, 2));
  const k = res.kpis;
  const fmt = (v, d2 = 0) => v === null ? "\u2014" : v.toLocaleString("es-CL", { maximumFractionDigits: d2 });
  console.log(`\u2714 ${res.rows.length} filas \xB7 venta ${fmt(k.ventas_total)} \xB7 pedidos ${fmt(k.pedidos)} \xB7 inversi\xF3n ${fmt(k.gasto_ads)} \xB7 MER ${fmt(k.mer, 2)} \xB7 captura GA4 ${k.captura_tracking === null ? "\u2014" : `${(k.captura_tracking * 100).toFixed(1)}%`}`);
  if (k.incompleto.length) console.log(`\u26A0 MER incompleto: falta gasto de ${k.incompleto.join(", ")}`);
  if (res.missing.length) console.log(`\u26A0 ${res.missing.length} respuestas faltantes: ${res.missing.join(", ")}`);
  for (const h of res.health) {
    if (h.error) console.log(`\u2716 ${h.source}: ${h.error}`);
    for (const n of h.notes ?? []) console.log(`\u2139 ${h.source}: ${n}`);
  }
} else if (cmd === "bundle") {
  const [dir, from, to, outDir, histDir] = rest;
  if (!dir || !isDate2(from) || !isDate2(to) || !outDir) fail("uso: bundle <config> <carpeta-captura> <desde> <hasta> <salida-dir> [carpeta-historia]");
  const reader = (base) => (f) => existsSync(join(base, "raw", f)) ? JSON.parse(readFileSync(join(base, "raw", f), "utf8")) : void 0;
  const daily = ingest(config, buildCapturePlan(config, from, to), reader(resolve(dir)), from, to, (/* @__PURE__ */ new Date()).toISOString());
  let historia = null;
  if (histDir) {
    const h = ingest(config, buildHistoryPlan(config, to), reader(resolve(histDir)), monthsBack(to, 13), to, (/* @__PURE__ */ new Date()).toISOString());
    const series = monthlySeries(h.rows, config);
    historia = { series, anomalias: seriesAnomalies(series), mejor_mes: bestMonth(series) };
  }
  const bundle = assemble({ config, desde: from, hasta: to, capturado: (/* @__PURE__ */ new Date()).toISOString(), daily, read: reader(resolve(dir)), historia });
  const findings = bundle.findings;
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(join(resolve(outDir), "bundle.js"), `window.CC_DATA = ${JSON.stringify(bundle)};
`);
  const appHtml = join(dirname(fileURLToPath(import.meta.url)), ..."../app/index.html".split("/"));
  if (existsSync(appHtml)) copyFileSync(appHtml, join(resolve(outDir), "index.html"));
  else console.log("\u26A0 app sin compilar: corre `npm run build:app` para generar app/dist/index.html");
  console.log(`\u2714 bundle con ${findings.length} lecturas${historia ? ` y ${historia.series.length} meses de historia` : ""} \u2192 ${join(resolve(outDir), "index.html")}`);
} else if (cmd === "publish") {
  const [outDir] = rest;
  if (!outDir) fail("uso: publish <config> <salida-dir>");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gnzqykmfwpauhkmyqtpi.supabase.co";
  if (!key) fail("falta SUPABASE_SERVICE_ROLE_KEY en el entorno (p. ej. node --env-file=apps/web/.env.local)");
  const src = readFileSync(join(resolve(outDir), "bundle.js"), "utf8");
  const json = src.replace(/^window\.CC_DATA = /, "").replace(/;\s*$/, "");
  const bundle = JSON.parse(json);
  if (bundle.meta.cliente !== config.cliente) fail(`el bundle es de "${bundle.meta.cliente}" y la config de "${config.cliente}"`);
  const row2 = {
    brand: config.cliente,
    period: "cc_bundle",
    captured_at: bundle.meta.capturado,
    source: "command-center",
    currency: bundle.meta.moneda,
    kpis: bundle,
    meta: { desde: bundle.meta.desde, hasta: bundle.meta.hasta, version: bundle.version }
  };
  const res = await fetch(`${url}/rest/v1/brand_snapshots`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row2)
  });
  if (!res.ok) fail(`Supabase respondi\xF3 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log(`\u2714 publicado: ${config.cliente} \xB7 ${bundle.meta.desde} \u2192 ${bundle.meta.hasta} (${(json.length / 1024).toFixed(0)} KB)`);
} else if (cmd === "history-plan") {
  const [until, months] = rest;
  if (!isDate2(until)) fail("uso: history-plan <config> <hasta> [meses]");
  console.log(JSON.stringify(buildHistoryPlan(config, until, Number(months ?? 13)), null, 2));
} else if (cmd === "history-ingest") {
  const [dir, until, months] = rest;
  if (!dir || !isDate2(until)) fail("uso: history-ingest <config> <carpeta> <hasta> [meses]");
  const n = Number(months ?? 13);
  const rawDir = join(resolve(dir), "raw");
  const read = (f) => existsSync(join(rawDir, f)) ? JSON.parse(readFileSync(join(rawDir, f), "utf8")) : void 0;
  const res = ingest(config, buildHistoryPlan(config, until, n), read, monthsBack(until, n), until, (/* @__PURE__ */ new Date()).toISOString());
  const series = monthlySeries(res.rows, config);
  const anomalies = seriesAnomalies(series);
  writeFileSync(join(resolve(dir), "series.json"), JSON.stringify({ series, anomalies, mejor_mes: bestMonth(series), health: res.health, missing: res.missing }, null, 2));
  console.log(`\u2714 ${series.length} meses \xB7 mejor mes ${bestMonth(series)?.mes ?? "\u2014"}`);
  for (const a of anomalies) console.log(`\u26A0 ${a.tipo}: ${a.detalle}`);
  if (res.missing.length) console.log(`\u26A0 faltan: ${res.missing.join(", ")}`);
} else {
  fail(`comando desconocido: ${cmd}`);
}
