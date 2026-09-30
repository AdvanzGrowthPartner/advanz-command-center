// Advanz Command Center v0.1.0 · generado por scripts/build-plugin.mjs. No editar: se edita en packages/command-center.

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
function safeDiv(num, den) {
  if (num === null || num === void 0 || den === null || den === void 0) return null;
  if (den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return num / den;
}

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
  const hasta = ev.hasta;
  const N = diffDays(ev.desde, hasta) + 1;
  const fase = hoy < ev.desde ? "antes" : hoy > hasta ? "despues" : "durante";
  const conv = (r) => r.currency ? toReport(config2, r.value, r.currency, r.date_to) : r.value;
  const byDay = (src) => {
    const m = /* @__PURE__ */ new Map();
    for (const r of rows.filter((x) => src(x) && x.date_from === x.date_to)) m.set(r.date_from, (m.get(r.date_from) ?? 0) + conv(r));
    return m;
  };
  const store = (metric) => (r) => (r.source === "shopify" || r.source === "tiendanube") && r.level === "store" && r.metric === metric && !r.dims?.hora;
  const venta = byDay(store("ventas_total"));
  const pedidosD = byDay(store("pedidos"));
  const gasto = byDay((r) => (r.source === "meta" || r.source === "google_ads") && r.level === "account" && r.metric === "gasto");
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
    const fecha = addDays(ev.desde, k);
    const v = fecha <= hoy ? venta.get(fecha) ?? null : null;
    const g = fecha <= hoy ? gasto.get(fecha) ?? null : null;
    const refFecha = ev.referencia ? addDays(ev.referencia.desde, Math.round(k / Math.max(1, N - 1) * diffDays(ev.referencia.desde, ev.referencia.hasta))) : null;
    return {
      dia: k + 1,
      fecha,
      venta: v,
      pedidos: fecha <= hoy ? pedidosD.get(fecha) ?? null : null,
      gasto: g,
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
  return {
    evento: { nombre: ev.nombre, desde: ev.desde, hasta, dias: N },
    fase,
    dias_para_inicio: Math.max(0, diffDays(hoy, ev.desde)),
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
    referencia,
    checklist
  };
}

// src/capture/plan.ts
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
  }
  const meta = f.meta;
  for (const acct of meta?.cuentas ?? []) {
    const base = { ad_account_id: `act_${acct}`, time_range: { since: date_from, until: date_to } };
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
          fields: ["amount_spent", "impressions", "reach", "frequency", "website_ctr", "cpm", "omni_purchase", "omni_purchase_values", "omni_add_to_cart", "omni_initiated_checkout", "omni_landing_page_view", "video_thruplay_watched_actions", "video_p25_watched_actions"]
        }
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
      for (const acct of f.meta?.cuentas ?? [])
        steps.push({
          source: "meta",
          tool: "meta.ads_get_ad_entities",
          save_as: `wr-meta-diario-${acct}.json`,
          serie: true,
          normalize: { fn: "meta", level: "account" },
          para: "War Room \xB7 inversi\xF3n Meta por d\xEDa",
          args: { ad_account_id: `act_${acct}`, level: "account", time_increment: 1, time_range: { since: ev.desde, until: finVentana }, fields: ["amount_spent", "omni_purchase", "omni_purchase_values"] }
        });
      for (const customer_id of f.google_ads?.cuentas ?? [])
        steps.push({
          source: "google_ads",
          tool: "google_ads.search",
          save_as: `wr-google-diario-${customer_id}.json`,
          serie: true,
          normalize: { fn: "gaql", resource: "customer", currency: f.google_ads.moneda ?? config2.moneda_reporte },
          para: "War Room \xB7 inversi\xF3n Google por d\xEDa",
          args: { customer_id, resource: "customer", fields: ["segments.date", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"], conditions: [`segments.date BETWEEN '${ev.desde}' AND '${finVentana}'`], orderings: ["segments.date ASC"] }
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
  "sessionKeyEventRate:purchase": "tasa_conversion"
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
  const dimCols = header.filter((h) => !(h in metricCols));
  const level = dimCols[0] === "page" ? "page" : dimCols[0] === "device" ? "device" : "query";
  const out = [];
  for (const line of lines) {
    const cells = line.split("	");
    const get = (h) => cells[header.indexOf(h)];
    const entity = get(dimCols[0] ?? "") ?? "";
    const dims = dimCols.length > 1 ? Object.fromEntries(dimCols.slice(1).map((d2) => [d2, get(d2) ?? ""])) : void 0;
    for (const [col, metric] of Object.entries(metricCols)) {
      if (!header.includes(col)) continue;
      out.push(row(ctx, "gsc", metric, level, entity, toNumber(get(col)), { dims }));
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
    const extra = { entity_name: String(e.name ?? "") };
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
  const money = opts.currency ? { currency: opts.currency } : {};
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
        out.push(row({ ...ctx, date_from: from, date_to: to }, "klaviyo", metric, level, entity, Number.isFinite(v) ? v : null, money));
      });
    } else {
      const total = series.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      out.push(row(ctx, "klaviyo", metric, level, entity, total, money));
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
    const tot = ps.reduce((a, p) => a + p.impresiones, 0);
    const fuertes = ps.filter((p) => tot && p.impresiones / tot >= 0.1);
    return { consulta, tot, paginas: fuertes.sort((a, b) => b.clics - a.clics).map((p) => ({ pagina: p.pagina, clics: p.clics, posicion: p.posicion })) };
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
function parse(raw) {
  const r = raw?.results;
  const o = typeof r === "string" ? JSON.parse(r) : r;
  return { total: o?.estimated_total_count ?? null, ads: o?.ads ?? [] };
}
function competenciaBlock(config2, capturedAt, raws) {
  const cfg = config2.competencia;
  const excluir = new Set((cfg?.excluir_paginas ?? []).map(String));
  const seguidos = new Set(config2.competidores.map((c) => (c.pagina_meta ?? c.nombre).toLowerCase()));
  const now = Date.parse(capturedAt) / 1e3;
  let total = null;
  const by = /* @__PURE__ */ new Map();
  for (const raw of raws) {
    const p = parse(raw);
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
  const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  const pct = (v) => `${Math.round(v * 100)}%`;
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
        if (c !== null && c < u.captura_min) push({ faltan_pct: pct(1 - c) }, [{ metric: "captura_tracking", value: c }]);
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
        if (d2 !== null && d2 > u.descuento_max) push({ descuento_pct: pct(d2) }, [{ metric: "descuentos_pct", value: d2 }]);
        break;
      }
      case "S-CRO-01": {
        const m = funnel.mobile, dsk = funnel.desktop;
        if (!m || !dsk) break;
        const totalSes = Object.values(funnel).reduce((a, f) => a + f[0].valor, 0);
        const convM = m[3].tasa_vs_inicio, convD = dsk[3].tasa_vs_inicio;
        const peso = m[0].valor / totalSes;
        if (peso >= u.peso_movil_min && convM / convD < u.ratio_movil_max)
          push({ peso_movil: pct(peso), conv_movil: pct1(convM), conv_desktop: pct1(convD) }, [
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
            { abandono: pct(1 - cierre), dispositivo: dev === "mobile" ? "celular" : dev === "desktop" ? "escritorio" : dev, perdidos: checkouts - compras2, cierre_objetivo: pct(objetivo), pedidos_extra: extra },
            [{ metric: "tasa_cierre_checkout", entity: dev, value: cierre }],
            extra / 100
          );
        }
        break;
      }
      case "S-CRO-04": {
        const s = val("clarity", "device", "mobile", "scroll_medio")?.value;
        if (s !== void 0 && s < u.scroll_min) push({ scroll: pct(s) }, [{ metric: "scroll_medio", entity: "mobile", value: s }]);
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
              push({ anuncio: name, cpa: money(cpa), objetivo: money(obj) }, [{ metric: "cpa_plataforma", entity: id, value: cpa }], comprasN / 100);
          } else if (sc.id === "S-META-06") {
            const techo = config2.umbrales.cpa_techo;
            if (!val("meta", "ad", id, "compras_plataforma")) continue;
            if (techo && gasto >= u.piso_gasto_multiplo_cpa * techo && (cpa === null || cpa > techo))
              push({ anuncio: name, gasto: money(gasto), compras: compras(comprasN), techo: money(techo) }, [{ metric: "gasto", entity: id, value: gasto }]);
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
              push({ campana: c, perdida: pct(perdida), cpa: money(cpa), cpa_cuenta: money(cpaCuenta) }, [
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
                  { entidad: e.split("|").pop(), gasto: money(g), compras: compras(Math.round(c * 10) / 10), cpa: Number.isFinite(cpa) ? money(cpa) : "sin compras", veces: Number.isFinite(cpa) ? Math.round(cpa / cpaCuenta) : "\u221E" },
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
            push({ keyword: k.split("|")[0], qs, perdida_rank: pr !== void 0 ? pct(pr) : "\u2014" }, [{ metric: "quality_score", entity: k, value: qs }]);
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
          push({ ctr: pct(Math.abs(pa.ctr_pct)), imp: pct(pa.impresiones_pct) }, [{ metric: "ctr", value: pa.ctr_pct }]);
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
            push({ gasto: money(c.gasto), keyword: c.keyword, posicion: c.posicion_organica.toFixed(1).replace(".", ",") }, [{ metric: "posicion", entity: c.keyword, value: c.posicion_organica }], c.gasto / 1e6);
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
        if (w !== null && w !== void 0 && w < u.peso_min) push({ peso: pct(w) }, [{ metric: "peso_email", value: w }]);
        break;
      }
      case "S-WAR-01": {
        const w = input.warRoom;
        if (w && w.fase === "durante" && w.ritmo !== null && w.ritmo < u.ritmo_min)
          push({ evento: w.evento.nombre, dia: w.dia_actual, dias: w.evento.dias, ritmo: pct(w.ritmo), acumulado: money(w.acumulado), esperado: money(w.esperado_a_hoy ?? 0) }, [{ metric: "ritmo", value: w.ritmo }], 1);
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
  const warRoom = warRoomBlock(config2, [...daily.rows, ...daily.series], input.hasta, { email, captura: daily.kpis.captura_tracking });
  const findings = detect({ config: config2, rows: daily.rows, kpis: daily.kpis, funnel: daily.funnel, health: daily.health, seo, email, warRoom });
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
    warRoom
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
