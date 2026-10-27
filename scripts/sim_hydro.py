"""Series hidrometeorológicas SIMULADAS para las estaciones de la cuenca Acaray–Yguazú.
Coherentes entre sí: lluvia -> caudales de afluentes -> balance hídrico del embalse Yguazú -> cota."""
import json, math, random, datetime
import numpy as np

random.seed(42); rng = np.random.default_rng(42)
ST = json.load(open('stations.json'))
D0 = datetime.date(2026, 4, 1); D1 = datetime.date(2026, 10, 26)
N = (D1 - D0).days + 1
fechas = [(D0 + datetime.timedelta(i)).isoformat() for i in range(N)]
month = np.array([(D0 + datetime.timedelta(i)).month for i in range(N)])

# Curva cota–área (simulada, coherente con las superficies ilustrativas): km²
A0 = 431.3
CURVA = [(216.5, 0.66), (217.0, 0.705), (218.0, 0.76), (219.0, 0.82), (219.5, 0.85), (220.0, 0.88), (221.0, 0.93), (222.0, 0.975), (222.5, 1.0), (223.0, 1.03), (223.5, 1.06)]
CURVA = [(c, round(r * A0, 1)) for c, r in CURVA]
def area(c):
    xs = [p[0] for p in CURVA]; ys = [p[1] for p in CURVA]
    return float(np.interp(c, xs, ys)) * 1e6

# ---- lluvia: eventos regionales + chaparrones locales ----
p_ev = {4: .26, 5: .22, 6: .16, 7: .10, 8: .06, 9: .13, 10: .30}
ev = np.array([rng.random() < p_ev[m] for m in month])
ev_int = rng.gamma(1.6, 13, N) * ev
# sequía marcada: casi sin lluvia del 20 ago al 5 oct; repunte de lluvias desde mediados de octubre
for i, f in enumerate(fechas):
    if '2026-08-20' <= f <= '2026-10-05': ev_int[i] *= 0.15
    if '2026-10-14' <= f <= '2026-10-22' and rng.random() < .5: ev_int[i] += rng.gamma(2, 12)

rain = {}
for s in ST:
    if not any(k in s['tipo'] for k in ('Pluvi', 'Meteorol', 'Hidrometeorol')): continue
    loc = np.where(rng.random(N) < 0.75, ev_int * rng.lognormal(0, .45, N), 0)
    loc += np.where(rng.random(N) < 0.05, rng.gamma(1.2, 6, N), 0)
    rain[s['codigo'] + '|' + s['nombre']] = np.round(loc, 1)
basin = np.mean(list(rain.values()), axis=0)

# ---- caudales de afluentes del embalse (reservorio lineal) ----
def runoff(r, area_km2, c, k, base):
    q = np.zeros(N); s = base * 86400 * k
    for i in range(N):
        s += r[i] / 1000 * area_km2 * 1e6 * c
        out = s / k; s -= out; q[i] = out / 86400
    return q
AFL = {"AY11": (3300, .24, 9, 26.0), "AY12": (1500, .22, 7, 11.0), "AY13": (1300, .22, 6, 10.0), "AY24": (1100, .22, 7, 8.0)}
OTROS = {"AY01": (900, .22, 8, 7.0), "AY10": (650, .20, 7, 5.0), "AY14": (700, .21, 8, 5.5), "AY06": (2600, .22, 10, 22.0)}
caudal = {}
for code, (a, c, k, b) in {**AFL, **OTROS}.items():
    r = basin * rng.lognormal(0, .08, N)
    q = runoff(r, a, c, k, b) * np.exp(-np.arange(N) / 900)
    caudal[code] = np.round(q * rng.lognormal(0, .03, N), 1)
FACTOR_NO_AFORADO = 1.35
qin = sum(caudal[c] for c in AFL) * FACTOR_NO_AFORADO

# ---- balance del embalse Yguazú: dh = (Qin - Qout) dt / A(h) ----
def simulate(qout):
    h = 222.2; out = []
    for i in range(N):
        dq = qin[i] - qout + rain_direct(i, h)
        h += dq * 86400 / area(h)
        h = min(h, 223.0)
        out.append(h)
    return np.array(out)
def rain_direct(i, h): return basin[i] / 1000 * area(h) / 86400
lo, hi = 20, 200
for _ in range(50):
    mid = (lo + hi) / 2; h = simulate(mid)
    if h[-1] > 219.45: lo = mid
    else: hi = mid
QOUT = round((lo + hi) / 2, 1); cota_yg = simulate(QOUT)
print('Qout', QOUT, 'cota inicio', cota_yg[0].round(2), 'min', cota_yg.min().round(2), 'fin', cota_yg[-1].round(2), 'qin medio', qin.mean().round(1))
cota_ac = np.round(185.0 + 0.25 * np.sin(np.arange(N) / 9) + rng.normal(0, .06, N) - 0.4 * (np.array(fechas) >= '2026-09-01') * 0.5, 2)

# ---- meteorología ----
doy = np.array([(D0 + datetime.timedelta(i)).timetuple().tm_yday for i in range(N)])
tmax = 27 + 6 * np.cos((doy - 15) / 365 * 2 * np.pi) + rng.normal(0, 2.2, N) - 0.15 * np.minimum(basin, 20)
tmin = tmax - 9 - rng.normal(0, 1.5, N)
hum = np.clip(62 + 1.2 * np.minimum(basin, 25) + rng.normal(0, 6, N) - 0.8 * (tmax - 27), 30, 98)

# ---- armado por estación y variable ----
series = {}; meta = {}
def put(code, var, arr, gaps=0.03):
    a = [None if (rng.random() < gaps) else (round(float(v), 2)) for v in arr]
    series[f'{code}|{var}'] = a
for s in ST:
    code = s['codigo'] + ('b' if s['codigo'] in meta else '')
    meta[code] = s; s['id'] = code
    t = s['tipo']; key = s['codigo'] + '|' + s['nombre']
    if any(k in t for k in ('Pluvi', 'Meteorol', 'Hidrometeorol')): put(code, 'lluvia_mm', rain[key])
    if 'Meteorol' in t or 'Hidrometeorol' in t:
        put(code, 'temp_max_c', tmax); put(code, 'temp_min_c', tmin); put(code, 'humedad_pct', hum)
    if 'Hidrom' in t:
        base = s['codigo']
        q = caudal.get(base)
        if q is None: q = np.round(runoff(basin * rng.lognormal(0, .1, N), 300, .2, 6, 2.5), 1)
        put(code, 'caudal_m3s', q); put(code, 'nivel_m', np.round(0.35 * np.power(np.maximum(q, 0.1), 0.45), 2))
    if 'Limnim' in t:
        put(code, 'cota_msnm', cota_yg if 'YGUAZU' in s['nombre'].upper() else cota_ac, gaps=0.01)
# una estación sin datos recientes (falla de transmisión simulada)
for k in list(series):
    if k.startswith('AY20|'): series[k] = series[k][:-12] + [None] * 12
ids = [s['id'] for s in ST]
json.dump(ST, open('stations.json', 'w'), ensure_ascii=False, separators=(',', ':'))
CUT = 7  # la última semana queda fuera de lo embebido y va en el CSV de prueba
HYDRO = {"simulado": True, "fechas": fechas[:-CUT], "series": {k: v[:-CUT] for k, v in series.items()}, "curva": CURVA, "qout": QOUT, "factor": FACTOR_NO_AFORADO,
         "afluentes": list(AFL), "limni": {"yguazu": "AY23", "acaray": "AY22"},
         "clima": {"qin_normal_nov": round(float(np.mean(qin[-60:])) * 1.15, 1)}}
json.dump(HYDRO, open('hydro.json', 'w'), separators=(',', ':'))
# CSV largo (plantilla y archivo de prueba)
import csv
UNI = {"lluvia_mm": "mm", "caudal_m3s": "m³/s", "nivel_m": "m", "cota_msnm": "msnm", "temp_max_c": "°C", "temp_min_c": "°C", "humedad_pct": "%"}
with open('datos_estaciones_simulados.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(["fecha", "estacion", "variable", "valor", "unidad"])
    for k, arr in series.items():
        code, var = k.split('|')
        for d, v in zip(fechas[-CUT:], arr[-CUT:]):
            if v is not None: w.writerow([d, code, var, v, UNI[var]])
import os; print('hydro.json', os.path.getsize('hydro.json'), 'vars', len(series))
