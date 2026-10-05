#!/usr/bin/env python3
"""Captura directa (solo lectura) de un paso del plan, sin pasar por el chat.

Para qué sirve: algunas respuestas (términos de búsqueda, cambios de cuenta, consultas de Search Console) son tan
grandes que el conector las entrega "inline" en la conversación y no quedan en un archivo. Copiarlas a mano o
reconstruirlas rompe la regla de oro del Command Center (nunca inventar datos). Esta herramienta ejecuta la MISMA
consulta del plan con las credenciales que ya usa el conector y escribe el resultado directo a raw/<save_as>.

Uso:   python captura-directa.py <plan.json> <carpeta-captura> <save_as>
Ej.:   python captura-directa.py capturas/2026-10-05/plan.json capturas/2026-10-05 google-ads-search-terms.json

Soporta los pasos `google_ads.search` y `gsc.gsc_query`. Cualquier otro paso: se captura con el conector.
Solo lectura: no existe ninguna llamada de escritura aquí.
"""
import json, os, sys
from pathlib import Path


def mcp_config():
    for p in (Path.home() / ".claude.json", Path.home() / ".claude" / "settings.json"):
        if p.exists():
            try:
                servers = json.loads(p.read_text(encoding="utf-8")).get("mcpServers", {})
                if servers:
                    return servers
            except Exception:
                pass
    sys.exit("✖ no encuentro la configuración de los conectores (mcpServers) en ~/.claude.json")


def find_server(servers, *needles):
    for name, cfg in servers.items():
        if any(n in name.lower() for n in needles):
            return name, cfg
    sys.exit(f"✖ no encuentro el conector {needles} en la configuración")


def ensure_python(cfg, module):
    """Si el módulo no está en este Python, relanza con el Python del entorno del conector."""
    try:
        __import__(module)
        return
    except ImportError:
        exe = Path(cfg.get("command", ""))
        py = exe.parent / ("python.exe" if os.name == "nt" else "python")
        if py.exists() and str(py).lower() != sys.executable.lower():
            os.execv(str(py), [str(py)] + sys.argv)
        sys.exit(f"✖ falta el módulo {module}: ejecuta este script con el Python del entorno del conector")


def fmt(x):
    return str(int(x)) if float(x) == int(x) else str(x)


def google_ads(args, servers):
    _, cfg = find_server(servers, "google-ads")
    ensure_python(cfg, "ads_mcp")
    for k, v in cfg.get("env", {}).items():
        os.environ[k] = v
    from ads_mcp.tools.search import search
    kw = {k: args[k] for k in ("customer_id", "fields", "resource", "conditions", "orderings", "limit") if k in args}
    rows = search(**kw)
    return {"result": rows}, len(rows)


def gsc(args, servers):
    _, cfg = find_server(servers, "gsc", "search-console")
    ensure_python(cfg, "google.oauth2")
    for k, v in cfg.get("env", {}).items():
        os.environ[k] = v
    import requests
    from urllib.parse import quote
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    creds = Credentials(None, refresh_token=os.environ["GSC_REFRESH_TOKEN"], client_id=os.environ["GSC_CLIENT_ID"], client_secret=os.environ["GSC_CLIENT_SECRET"],
                        token_uri="https://oauth2.googleapis.com/token", scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    creds.refresh(Request())
    site = args["site_url"]
    dims = [d.strip() for d in str(args.get("dimensions", "query")).split(",") if d.strip()]
    limit = int(args.get("row_limit", 100))
    body = {"startDate": args["date_from"], "endDate": args["date_to"], "dimensions": dims, "rowLimit": limit + 1, "dataState": args.get("data_state") or "all", "type": args.get("type", "web")}
    r = requests.post(f"https://searchconsole.googleapis.com/webmasters/v3/sites/{quote(site, safe='')}/searchAnalytics/query",
                      headers={"Authorization": "Bearer " + creds.token}, json=body, timeout=90)
    r.raise_for_status()
    res = r.json().get("rows", [])
    more = len(res) > limit
    rows = res[:limit]
    meta = (f"# meta site={site} range={args['date_from']}..{args['date_to']} period=custom type={body['type']} data_state={body['dataState']} "
            f"dimensions={','.join(dims)} rows={len(rows)} has_more={'true' if more else 'false'}" + (f" next_start_row={limit}" if more else "") + " cache=miss source=searchanalytics.query")
    lines = [meta, "\t".join(dims + ["clicks", "impressions", "ctr", "position"])]
    for x in rows:
        lines.append("\t".join(list(x["keys"]) + [fmt(x["clicks"]), fmt(x["impressions"]), fmt(round(x["ctr"], 4)), fmt(round(x["position"], 1))]))
    return {"result": "\n".join(lines)}, len(rows)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    plan_path, carpeta, save_as = sys.argv[1:4]
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    steps = plan if isinstance(plan, list) else plan.get("steps", [])
    step = next((s for s in steps if s.get("save_as") == save_as), None)
    if not step:
        sys.exit(f"✖ el plan no tiene el paso {save_as}")
    tool = step.get("tool", "")
    servers = mcp_config()
    if tool == "google_ads.search":
        data, n = google_ads(step["args"], servers)
    elif tool in ("gsc.gsc_query", "gsc.query"):
        data, n = gsc(step["args"], servers)
    else:
        sys.exit(f"✖ {tool} no se captura con esta herramienta: usa el conector")
    out = Path(carpeta) / "raw" / save_as
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"✔ {save_as}: {n} filas → {out}")


if __name__ == "__main__":
    main()
