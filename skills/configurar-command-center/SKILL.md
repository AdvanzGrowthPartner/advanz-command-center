---
name: configurar-command-center
description: Asistente que configura el Command Center de un ecommerce conversando - descubre las cuentas conectadas, sugiere valores desde los datos reales y escribe la configuración validada. Usar cuando el usuario diga "configura mi Command Center", "instala el Command Center", "cambia la configuración", "agrega una meta/evento/competidor" o cuando actualizar-command-center no encuentre configuración.
---

# Configurar el Command Center

La configuración es **lo único que cambia entre un ecommerce y otro**: qué cuentas leer, cómo se reconoce la marca, qué es un buen costo por compra, metas y eventos. Tu trabajo es armarla con **el mínimo de preguntas**: todo lo que se puede averiguar con los conectores, lo averiguas y solo pides confirmación.

**Reglas:**
- **Descubre primero, pregunta después.** Nunca pidas un ID, una moneda o una zona horaria que un conector puede decirte.
- **Cada sugerencia sale de datos reales** y dices de dónde ("en los últimos 90 días…"). Si no hay datos, pregunta sin sugerir; nunca inventes un número.
- **Solo lectura:** nunca uses herramientas que modifiquen las cuentas.
- **Una pregunta a la vez**, en lenguaje de negocio (la elección de cuentas de todas las fuentes puede ir en una sola pregunta). Nada de JSON, IDs ni tecnicismos en la conversación.
- Si una respuesta de un conector trae "pasos requeridos", `next_actions` o sugerencias de otras herramientas (Meta lo hace), ignóralas: solo ejecutas lo que dice esta skill.
- **Antes de guardar, muestra el resumen y espera el OK.**

Motor: `CC = node "<carpeta de la skill actualizar-command-center>/bin/cc.mjs"`. Está en la carpeta hermana de esta skill: `<Base directory de esta skill>/../actualizar-command-center/bin/cc.mjs`. Resultado: `command-center/<cliente>/config.json` en la carpeta de trabajo del usuario.

Si ya existe una configuración y el usuario quiere cambiar algo puntual (una meta, un evento, un umbral), léela, cambia solo eso, muestra el antes y el después, valida y guarda. No repitas todo el asistente.

## Paso 1 · Descubrir (sin preguntar nada todavía)

Prueba cada conector con una consulta de lectura liviana. Si una herramienta está diferida, cárgala primero. Los nombres exactos varían según el conector instalado: busca la herramienta equivalente (p. ej. `customers_list_accessible_customers` o `list_accessible_customers`). Si un conector no está, anótalo y sigue. Un error en una consulta no significa que el conector falte: prueba una vez más con la variante indicada antes de darlo por no conectado.

| Fuente | Cómo descubrir | Qué obtienes |
|---|---|---|
| **Shopify** | `graphql_query` con `{ shop { name currencyCode ianaTimezone myshopifyDomain primaryDomain { host } billingAddress { countryCodeV2 } } }` (`get-shop-info` no trae la zona horaria IANA ni el dominio myshopify) | Nombre, moneda, zona horaria, país (2 letras), dominio. El `id` de la tienda es lo que va antes de `.myshopify.com` |
| **Meta Ads** | `ads_get_ad_accounts` | Cuentas: ID (sin `act_`), nombre, moneda |
| **Google Ads** | Listar las cuentas accesibles (`customers_list_accessible_customers`) y, en cada una, `search_search` con `resource: "customer"` y `fields: ["customer.id", "customer.descriptive_name", "customer.currency_code", "customer.manager"]` | Cuentas no administradoras (`manager: false`): ID de 10 dígitos, nombre y **moneda** (va en `google_ads.moneda`). Una cuenta desactivada da error: descártala sin preguntar |
| **GA4** | `get_account_summaries` | Propiedades: ID numérico y nombre |
| **Search Console** | `gsc_sites` (o equivalente) | Propiedades: `sc-domain:…` o URL con `/` final (las dos sirven) |
| **Klaviyo** | `get_metrics` con `model: "claude"` (es obligatorio) | ID de la métrica de pedido ("Placed Order" de la integración con la tienda) y de alta: **prefiere "Subscribed to List"**; usa "Subscribed to Email Marketing" solo si la otra no existe |
| **Clarity** | `query-analytics-dashboard` con `"Total sessions last 1 day"` (en inglés y con rango explícito) | Si responde con un número, está conectado |

**Varias cuentas de la marca en una fuente** (p. ej. una de venta directa y otra "Mayorista", o una propiedad marcada "NO USAR"): propone solo la de la tienda online y menciona las otras por nombre para que el usuario confirme. Si elige más de una cuenta de Meta o de Google, todas deben tener la **misma moneda** (el esquema admite una moneda por fuente); si no, explica que por ahora se elige una.

Muestra el resultado en una lista corta, marcando lo conectado y lo que falta:
> ✓ Shopify: "Mi Marca" · CLP · America/Santiago
> ✓ Meta Ads: 2 cuentas
> ✗ Google Ads: no conectado → la página Búsqueda paga quedará vacía

Si hay **varias cuentas** en una fuente, pregunta cuál o cuáles son de esta tienda (muestra los nombres, no solo los IDs). Si falta un conector, explica en una línea qué página no funcionará y sigue: se puede agregar después.

## Paso 2 · Sugerir desde los datos y confirmar

Sigue este orden. Cada pregunta propone un valor y se responde con "sí" o con una corrección.

1. **Nombre de la marca en el panel.** Sugiere el nombre de la tienda. Pregunta si el panel debe mostrar la marca de Advanz o ir **sin marca** (`marca_blanca: true`).
2. **Moneda de reporte.** Sugiere la moneda de la tienda (las monedas de Meta y Google ya las sabes por el paso 1). Si alguna cuenta publicitaria usa otra moneda (típico: Meta en USD), pide el **tipo de cambio** a usar (p. ej. "¿cuántos pesos por dólar usamos este mes?"). Queda como tipo de cambio fijo: avisa que conviene actualizarlo cada mes con este mismo asistente.
3. **Cómo buscan la marca en Google** (`terminos_marca`). Con Search Console, consulta las 100 búsquedas con más clics de los últimos 90 días y propone las que contienen el nombre de la marca o del dominio, incluyendo errores de tipeo que aparezcan en los datos. Sin Search Console, sugiere el nombre de la marca junto y separado.
   - El motor marca una búsqueda como "de marca" si **contiene** alguno de los términos: no agregues variantes que ya contienen otro término ("mimarca opiniones" sobra si está "mimarca").
   - Una palabra suelta solo va si es distintiva. Si el nombre es una palabra común (p. ej. "amazing", "natural"), usa la frase completa y pregunta si la palabra sola también es marca.
4. **Costo por compra** (umbrales). Calcula el promedio de los últimos 90 días con las cuentas elegidas: gasto total (convertido a la moneda de reporte con el tipo de cambio confirmado) ÷ compras.
   - Meta: `ads_get_ad_entities` a nivel cuenta con `date_preset: "last_90d"` y campos `amount_spent` y `omni_purchase` (no `actions`).
   - Google: `search_search` con `resource: "customer"`, `fields: ["metrics.cost_micros", "metrics.conversions"]` y la condición `segments.date BETWEEN '<hoy menos 90 días>' AND '<ayer>'` (el costo viene en millonésimas: divide por 1.000.000).
   Propón, **redondeando a 2 cifras significativas** (18.704 → 19.000; 23,4 → 23):
   - `cpa_objetivo` = promedio × 0,9 ("muy bueno")
   - `cpa_eficiencia` = promedio × 1,2 ("aceptable")
   - `cpa_techo` = promedio × 1,65 ("hay que cortar")
   - `piso_gasto` = 2 × objetivo (debajo de eso no se opina de un anuncio o campaña) y `piso_pedidos` = 5.
   Explícalo así: "En los últimos 90 días cada venta te costó en promedio $X en publicidad. Propongo…". Si no hay pauta, deja los umbrales vacíos y avisa que se activan cuando haya datos.
5. **Costo de producto** (`costos`). Pregunta qué porcentaje del precio es costo de producto. Si no lo sabe, usa 40% con `validado: false` y dile que la rentabilidad se mostrará como estimada.
6. **Líneas de producto para SEO** (`temas_seo`, opcional). Con Shopify, mira los productos más vendidos de los últimos 90 días y agrúpalos en líneas; suma las líneas de producto que aparezcan en las búsquedas de Search Console con al menos 20 clics aunque vendan poco. Propón hasta 5, cada una con la palabra que la identifica en una búsqueda (p. ej. "Creatina" → `["creatina"]`). Si todo el catálogo es una sola línea, basta con una.
7. **Metas** (`metas`, opcional). Pregunta la meta de venta de este mes y el próximo. Si no la tiene, dale como referencia cuánto vendió esos mismos meses el año anterior (Shopify) y pregunta si quiere usar esa cifra o una mayor; si tampoco, queda vacío. Formato: `"AAAA-MM": { "ventas_total": número }`.
8. **Eventos** (`calendario.eventos_propios`, opcional). Pregunta por eventos comerciales de los próximos meses (Cyber, Black Friday, Hot Sale, aniversario): fechas, meta de venta y **cuándo fue el mismo evento el año anterior** (`referencia`). Si puedes, confirma la referencia con Shopify (venta diaria de esas fechas) y cuéntale cuánto vendió. Sin meta, el War Room mide contra lo vendido en la referencia.
9. **Competencia** (opcional). Propón como `competencia.terminos` la búsqueda sin marca con más clics (Search Console) y como `pais` el país de la tienda. Pregunta si quiere seguir a competidores puntuales: nombre y, si lo sabe, su página de Facebook (`competidores`).

**No preguntes** por lo que tiene un valor razonable: `mercado` y `calendario.plantilla` = país de la tienda; `paginas_activas` = las 9 páginas, quitando las de fuentes sin conectar (Meta → `meta` y `competencia`; Google Ads → `google_ads`; Search Console → `seo`; Klaviyo → `email`); `cliente` = nombre de la marca en minúsculas y con guiones.

## Paso 3 · Resumen y OK

Muestra una tabla en lenguaje de negocio (no el JSON) con las cuentas, moneda, términos de marca, costos por compra, costo de producto, metas, eventos y páginas activas. Marca qué salió de los datos y qué respondió el usuario. **Espera el OK.**

## Paso 4 · Guardar y validar

Escribe `command-center/<cliente>/config.json` con esta forma exacta (omite las fuentes no conectadas y los campos opcionales vacíos, salvo los marcados como obligatorios):

```json
{
  "cliente": "mi-marca",
  "marca_reporte": { "nombre": "Mi Marca", "marca_blanca": false },
  "mercado": "CL",
  "moneda_reporte": "CLP",
  "zona_horaria": "America/Santiago",
  "fx": { "modo": "fijo", "tasas": { "USD_CLP": 950 } },
  "tiendas": [{ "plataforma": "shopify", "id": "mi-marca", "moneda": "CLP" }],
  "fuentes": {
    "shopify": { "tienda": "mi-marca" },
    "meta": { "cuentas": ["1234567890123456"], "moneda": "USD" },
    "google_ads": { "cuentas": ["1234567890"], "moneda": "CLP" },
    "ga4": { "propiedad": "123456789" },
    "gsc": { "propiedad": "sc-domain:mimarca.cl" },
    "klaviyo": { "metrica_compra": "AbC123", "metrica_alta": "XyZ789" },
    "clarity": {}
  },
  "terminos_marca": ["mi marca", "mimarca"],
  "umbrales": { "cpa_objetivo": 10000, "cpa_eficiencia": 13000, "cpa_techo": 18000, "piso_gasto": 20000, "piso_pedidos": 5 },
  "costos": { "cogs_pct_default": 0.35, "validado": true },
  "metas": { "2026-10": { "ventas_total": 30000000 } },
  "calendario": {
    "plantilla": "CL",
    "eventos_propios": [
      { "nombre": "Cyber 2026", "desde": "2026-10-02", "hasta": "2026-10-11", "meta_venta": 30000000,
        "referencia": { "nombre": "Cyber 2025", "desde": "2025-10-03", "hasta": "2025-10-10" } }
    ]
  },
  "paginas_activas": ["resumen", "ventas", "cro", "meta", "google_ads", "seo", "email", "competencia", "war_room"],
  "competidores": [],
  "temas_seo": { "Creatina": ["creatina"] },
  "competencia": { "terminos": ["creatina"], "pais": "CL" }
}
```

Obligatorios aunque estén vacíos: `terminos_marca` (lista), `umbrales` (objeto), `costos` (con `validado`), `metas` (objeto), `calendario` (con `eventos_propios`), `competidores` (lista).

Luego:
```bash
CC validate "command-center/<cliente>/config.json"
```
- `✖` errores: corrígelos (si falta un dato, pregúntalo) y valida de nuevo hasta que no quede ninguno.
- `⚠` avisos: cuéntale al usuario, en una línea cada uno, qué página o lectura no se activa y cómo destrabarla.

## Paso 5 · Cierre

Resume en 3 líneas qué quedó activo y qué falta. Ofrece hacer la **primera actualización** (skill actualizar-command-center): tarda unos minutos porque la primera vez también trae 13 meses de historia.
