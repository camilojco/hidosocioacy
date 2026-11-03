#!/usr/bin/env python3
"""Build the authenticated Mapacy web UI from the reviewed source template."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "fuente"
DATA = ROOT / "datos"


def compact_json(path: Path) -> str:
    return json.dumps(json.loads(path.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))


def replace_once(text: str, old: str, new: str, description: str) -> str:
    count = text.count(old)
    if count != 1:
        raise ValueError(f"Se esperaba una coincidencia de {description}; encontré {count}.")
    return text.replace(old, new, 1)


def build() -> None:
    template = (SOURCE / "app_template.html").read_text(encoding="utf-8")
    leaflet = (SOURCE / "leaflet.css").read_text(encoding="utf-8")
    replacements = {
        "/*__LEAFLET_CSS__*/": leaflet,
        "/*__BASEMAP__*/null": compact_json(DATA / "basemap.json"),
        # Personal census and survey records are fetched from the authenticated API.
        "/*__SAMPLE__*/[]": "[]",
        "/*__SCENARIOS__*/[]": compact_json(DATA / "scenarios.json"),
        "/*__SITES__*/[]": "[]",
        "/*__SURVEYS__*/[]": "[]",
        "/*__STATIONS__*/[]": compact_json(DATA / "stations.json"),
        "/*__HYDRO__*/null": compact_json(DATA / "hydro.json"),
    }
    for old, new in replacements.items():
        template = replace_once(template, old, new, old)

    logo = (SOURCE / "logo.b64").read_text(encoding="ascii").strip()
    template = replace_once(
        template,
        "<!--__LOGO__-->",
        f'<img class="logo" alt="ANDE" src="data:image/png;base64,{logo}">',
        "marcador del logo",
    )
    template = replace_once(template, "Versión de prueba – Camilo Caballero Ocariz", "Mapacy · versión servida", "subtítulo")

    template = re.sub(
        r"(<h3>Datos de ejemplo</h3>\s*)<p>.*?</p>",
        r"\1<p>Las fichas, sitios y encuestas se cargan desde la base central después de iniciar sesión. Los datos hidrometeorológicos de demostración y las proyecciones del visor están simulados.</p>",
        template,
        count=1,
        flags=re.S,
    )
    template = re.sub(
        r"(<h3>Dónde quedan los datos</h3>\s*)<p>.*?</p>",
        r"\1<p>Las fichas y su historial se almacenan en una base PostgreSQL central y requieren autenticación. Los escenarios personalizados y las cargas de series hidrometeorológicas se guardan solo en este navegador. La aplicación de producción está protegida por sesión y token CSRF.</p>",
        template,
        count=1,
        flags=re.S,
    )

    template = replace_once(
        template,
        '<div class="app" id="app">',
        '<div class="app" id="app" hidden>',
        "contenedor de la aplicación",
    )
    login_css = (SOURCE / "login.css").read_text(encoding="utf-8")
    style_end = template.rfind("</style>")
    if style_end < 0:
        raise ValueError("No encontré el bloque de estilos de la aplicación.")
    template = template[:style_end] + "\n" + login_css + "\n" + template[style_end:]
    login_html = (SOURCE / "login.html").read_text(encoding="utf-8").strip()
    template = replace_once(template, '<div class="app" id="app" hidden>', login_html + '\n<div class="app" id="app" hidden>', "inserción del login")
    template = replace_once(
        template,
        '      <button class="btn ghost iconbtn" id="btnAbout"',
        '      <button class="btn ghost small" id="btnLogout">Salir</button>\n      <button class="btn ghost iconbtn" id="btnAbout"',
        "botón de cierre de sesión",
    )

    save_start = template.find("function save(){ try{ localStorage.setItem(STORE_KEY")
    sites_start = template.find("const esSitio", save_start)
    if save_start < 0 or sites_start < 0:
        raise ValueError("No encontré el bloque original de persistencia del prototipo.")
    adapter = (SOURCE / "server_adapter.js").read_text(encoding="utf-8").rstrip()
    template = template[:save_start] + adapter + "\n" + template[sites_start:]

    after_sites = template.find("const esSitio")
    reset_start = template.find("function resetSample(){", after_sites)
    by_code_start = template.find("const byCode", reset_start)
    if reset_start < 0 or by_code_start < 0:
        raise ValueError("No encontré el reset local original.")
    template = template[:reset_start] + template[by_code_start:]

    template = replace_once(
        template,
        '  $("#btnImport").onclick=openImport;',
        '  $("#btnLogout").onclick=async()=>{ try{ await apiRequest("/api/logout",{method:"POST",body:"{}"}); window.location.reload(); }catch(e){ toast("No se pudo cerrar la sesión: "+e.message); } };\n  $("#btnImport").onclick=openImport;',
        "acción de cierre de sesión",
    )

    reset_handler = re.compile(r'  \$\("#btnReset"\)\.onclick=\(\)=>\{.*?\n', re.S)
    reset_match = reset_handler.search(template)
    if not reset_match:
        raise ValueError("No encontré el controlador del botón de restablecimiento.")
    replacement = '''  $("#btnReset").onclick=async()=>{
    if(!armed){ armed=true; $("#btnReset").textContent="Confirmar: borrar cambios y volver al ejemplo"; $("#rsMsg").textContent="Se reemplazarán las fichas y el historial de la base central por el estado inicial."; return; }
    try{ await resetSample(); }catch(error){ toast("No se pudieron restablecer los datos: "+error.message); return; }
    state.selected=null; state.filters={q:"",embalse:"",distrito:"",tipo:"",estado:"",franja:"",ivh:"",stat:"",origen:"",calidad:"",alerta:""}; $("#q").value=""; closeModal(); renderAll(); fitAll(); toast("Se restablecieron los datos iniciales de la base central.");
  };
'''
    template = template[:reset_match.start()] + replacement + template[reset_match.end():]

    template = replace_once(template, "function boot(){", "async function boot(){", "inicio asíncrono")
    template = replace_once(template, "readPalette(); load(); loadScen();", "readPalette(); await load(); loadScen();", "carga de datos del servidor")
    template = replace_once(template, "boot();\n</script>", (SOURCE / "server_boot.js").read_text(encoding="utf-8").rstrip() + "\n</script>", "arranque autenticado")

    output = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>[hidden]{display:none!important}body{margin:0}</style></head><body>'
        + template
        + "</body></html>"
    )
    for marker in ("__SAMPLE__", "__SITES__", "__SURVEYS__", "__BASEMAP__", "__SCENARIOS__", "__STATIONS__", "__HYDRO__", "__LOGO__", "__LEAFLET_CSS__"):
        if marker in output:
            raise ValueError(f"Quedó sin reemplazar el marcador {marker}.")
    if "localStorage.setItem(STORE_KEY" in output:
        raise ValueError("La persistencia local de fichas no debe quedar en la aplicación servida.")

    target = ROOT / "static" / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(output, encoding="utf-8")
    print(f"Generé {target.relative_to(ROOT)} ({target.stat().st_size:,} bytes).")


if __name__ == "__main__":
    build()
