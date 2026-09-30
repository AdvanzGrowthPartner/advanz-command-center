# Advanz Command Center

El panel de tu ecommerce **con lectura**: no solo muestra números, te dice qué pasó, por qué y qué hacer esta semana. Funciona dentro de Claude, con tus propios conectores, y tus datos quedan en tu computador.

## Instalar

En Claude Code (o la pestaña Code de la app de escritorio de Claude), pide:

> Instala el Command Center con `npx github:AdvanzGrowthPartner/advanz-command-center`

O córrelo tú en una terminal:

```bash
npx github:AdvanzGrowthPartner/advanz-command-center
```

Después abre una conversación nueva y escribe **"Configura mi Command Center"**. Para actualizar a la última versión, corre el mismo comando.

## Qué trae

| Página | Qué responde |
|---|---|
| Resumen | ¿Voy bien o mal? Las 3 prioridades, 13 meses de historia y si cuadran los números entre plataformas |
| Ventas y rentabilidad | Cuánto queda de la venta después de descuentos, costo de producto e inversión |
| Conversión y CRO | Dónde se cae la gente, por dispositivo y por página |
| Creativos · Meta | Qué anuncio escalar, cuál cortar y por qué |
| Búsqueda paga · Google | Demanda sin capturar, Performance Max por dentro, términos para excluir |
| SEO | Marca vs. no-marca, búsquedas cerca del top 3, páginas que compiten entre sí |
| Email y retención | Cuánto vende tu base, qué flows faltan, cómo crece la lista |
| Competencia | Quién anuncia en tu categoría ahora mismo |
| War Room | Tu evento (Cyber, Black Friday…) día a día contra la meta |

## Uso

- **"Configura mi Command Center"**: Claude revisa tus conexiones, te sugiere los valores con tus propios datos y te hace unas pocas preguntas.
- **"Actualiza mi Command Center"**: Claude trae los datos, calcula y abre el panel en tu navegador.

## Requisitos

- Claude con Claude Code (plan pago).
- Node.js 18 o superior.
- Los conectores de tus plataformas en Claude: Shopify, Meta Ads, Google Ads, Google Analytics, Search Console, Klaviyo y Microsoft Clarity. Con los que tengas, se activan las páginas correspondientes.

Todas las consultas son de solo lectura: el Command Center nunca modifica tus cuentas.

## Desinstalar

```bash
npx github:AdvanzGrowthPartner/advanz-command-center desinstalar
```

Tus datos (carpetas `command-center/`) no se borran.

---

Hecho por [Advanz Growth Partner](https://advanz.cl). ¿Quieres que lo configuremos y lo leamos contigo? Escríbenos en advanz.cl.
