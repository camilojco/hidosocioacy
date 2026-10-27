/* ============================================================
   ESCENARIOS DE AGUA: crecidas por caudal y niveles de cada embalse
   ============================================================ */
const SCEN_KEY = "censo-hidrosocial-escenarios-v2";
const SCEN_RAMP = ["#0d366b","#184f95","#256abf","#3987e5","#6da7ec","#9ec5f4","#cde2fb"];
const GRUPOS = {
  crecida:{label:"Crecidas", largo:"Crecidas por caudal", unidad:"m³/s", base:null},
  yguazu:{label:"Embalse Yguazú", largo:"Nivel del embalse Yguazú", unidad:"msnm", base:"lake"},
  acaray:{label:"Embalse Acaray", largo:"Nivel del embalse Acaray", unidad:"msnm", base:"cauce"}
};
const scen = { list:[], active:null, tab:"crecida", margin:50, showAll:false, removed:[], names:{}, values:{}, groups:{} };
let scenLayer=null;
function prepScenario(s){
  const polys=[]; const g=s.geom;
  const add=rings=>{ let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity; for(const p of rings[0]){ if(p[0]<a)a=p[0]; if(p[0]>c)c=p[0]; if(p[1]<b)b=p[1]; if(p[1]>d)d=p[1]; } polys.push({rings,bbox:[a,b,c,d]}); };
  if(g.type==="Polygon") add(g.coordinates); else if(g.type==="MultiPolygon") g.coordinates.forEach(add);
  s.polys=polys;
  s.bbox=polys.reduce((m,p)=>[Math.min(m[0],p.bbox[0]),Math.min(m[1],p.bbox[1]),Math.max(m[2],p.bbox[2]),Math.max(m[3],p.bbox[3])],[Infinity,Infinity,-Infinity,-Infinity]);
  s.cache=new Map();
  if(!s.grupo) s.grupo="crecida";
  return s;
}
const scenGroup = s => scen.groups[s.id] || s.grupo || "crecida";
function scenList(grp){ return scen.list.filter(s=>!scen.removed.includes(s.id) && (!grp || scenGroup(s)===grp)).sort((a,b)=>(scenValue(a)??0)-(scenValue(b)??0)); }
function scenById(id){ return scen.list.find(s=>s.id===id); }
function scenName(s){ return scen.names[s.id] || s.nombre; }
function scenValue(s){ return s.id in scen.values ? scen.values[s.id] : s.valor; }
function scenColor(s){ const L=scenList(scenGroup(s)); const i=L.indexOf(s); if(L.length<=1) return SCEN_RAMP[2]; const idx=Math.round(i*(SCEN_RAMP.length-2)/(L.length-1)); return SCEN_RAMP[Math.min(SCEN_RAMP.length-1,idx)]; }
/* Exposición de una ficha a un escenario: {in, d} (d en metros al borde; Infinity si está a más de 5 km) */
function expo(s, r){
  if(!s || !hasCoords(r)) return null;
  const lat=+r.latitud, lon=+r.longitud, key=lat+"|"+lon;
  if(s.cache.has(key)) return s.cache.get(key);
  let res; const B=s.bbox, pad=0.05;
  if(lon<B[0]-pad||lon>B[2]+pad||lat<B[1]-pad||lat>B[3]+pad) res={in:false,d:Infinity};
  else {
    let inside=false;
    for(const p of s.polys){ const b=p.bbox; if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3]) continue; if(pipPoly(lat,lon,p.rings)){ inside=true; break; } }
    if(inside) res={in:true,d:0};
    else { let d=Infinity; for(const p of s.polys){ const b=p.bbox; if(lon<b[0]-pad||lon>b[2]+pad||lat<b[1]-pad||lat>b[3]+pad) continue; const dd=distToLines(lat,lon,p.rings); if(dd<d) d=dd; } res={in:false,d:d>5000?Infinity:Math.round(d)}; }
  }
  s.cache.set(key,res); return res;
}
function expoStatus(s, r){ const e=expo(s,r); if(!e) return "Sin ubicación"; if(e.in) return "Dentro del área"; if(e.d<=scen.margin) return `A menos de ${scen.margin} m`; return "Fuera"; }
function activeScen(){ return scen.active ? scenById(scen.active) : null; }
function firstReach(r,grp){ for(const s of scenList(grp)){ const e=expo(s,r); if(e && e.in) return s; } return null; }
function fmtDist(e){ if(!e) return "Sin ubicación"; if(e.in) return "—"; if(!isFinite(e.d)) return "más de 5 km"; return e.d>=1000?`${(e.d/1000).toFixed(1).replace(".",",")} km`:`${e.d} m`; }
const fmtKm2 = v => (+v).toLocaleString("es-PY",{maximumFractionDigits:1});
const usaEmbalse = r => ["Alta","Media"].includes(r.dependencia_embalse) || r.fuente_agua_consumo==="Toma directa del embalse" || splitMulti(r.usos_agua).some(u=>/Pesca|Abrevadero|Riego|Transporte|Turismo|Acuicultura/.test(u));

function saveScen(){
  try{ localStorage.setItem(SCEN_KEY, JSON.stringify({uploaded:scen.list.filter(s=>!s.embebido).map(({polys,cache,bbox,...s})=>s), removed:scen.removed, names:scen.names, values:scen.values, groups:scen.groups, active:scen.active, tab:scen.tab, margin:scen.margin, showAll:scen.showAll})); return true; }
  catch(e){ return false; }
}
function loadScen(){
  scen.list = SCENARIOS.map(s=>prepScenario(Object.assign({},s)));
  try{
    let s=JSON.parse(localStorage.getItem(SCEN_KEY)||"null");
    if(!s){ const old=JSON.parse(localStorage.getItem("censo-hidrosocial-escenarios-v1")||"null"); if(old) s={uploaded:old.uploaded,removed:old.removed,names:old.names,values:old.values,margin:old.margin}; }
    if(s){ (s.uploaded||[]).forEach(u=>scen.list.push(prepScenario(u))); scen.removed=s.removed||[]; scen.names=s.names||{}; scen.values=s.values||{}; scen.groups=s.groups||{}; scen.active=s.active&&scen.list.some(x=>x.id===s.active)?s.active:null; scen.tab=GRUPOS[s.tab]?s.tab:"crecida"; scen.margin=s.margin??50; scen.showAll=!!s.showAll; }
  }catch(e){}
  if(scen.active && scen.removed.includes(scen.active)) scen.active=null;
}

/* ---------- dibujo ---------- */
function drawScen(){
  if(scenLayer){ map.removeLayer(scenLayer); scenLayer=null; }
  const a=activeScen(); const sat = state.base!=="carto";
  // El contorno base del embalse se reemplaza por el nivel elegido
  const replaced = a ? GRUPOS[scenGroup(a)].base : null;
  if(overlay.lakeL) overlay.lakeL.setStyle({fillOpacity: replaced==="lake"||sat?0:1, opacity: replaced==="lake"?0:(sat?0:1)});
  if(overlay.cauceL) overlay.cauceL.setStyle({fillOpacity: replaced==="cauce"||sat?0:1, opacity: replaced==="cauce"?0:(sat?0:1)});
  const grp = scen.showAll ? scen.tab : (a ? scenGroup(a) : null);
  if(!a && !scen.showAll) return;
  scenLayer=L.layerGroup().addTo(map);
  const list = scen.showAll ? scenList(grp).slice().reverse() : [a];
  for(const s of list){
    const isA = a && s.id===a.id; const lvl = GRUPOS[scenGroup(s)].base;
    let st;
    if(scen.showAll) st={color:isA?PALETTE["--ink"]:scenColor(s), weight:isA?1.2:.6, fillColor:scenColor(s), fillOpacity:sat?.45:.6, opacity:.9};
    else if(lvl) st={color:PALETTE["--water-line"], weight:1, fillColor:PALETTE["--water-lvl"], fillOpacity:sat?.55:1, opacity:1};
    else st={color:"#184f95", weight:.9, fillColor:PALETTE["--scen"], fillOpacity:sat?.4:.55, opacity:.8};
    L.geoJSON(s.geom,{pane:"scen",interactive:false,style:()=>st}).addTo(scenLayer);
  }
}
function renderScenCard(){
  const card=$("#scenCard"); const tab=scen.tab; const L_=scenList(tab); const a=activeScen(); const aIn = a && scenGroup(a)===tab;
  const tabs = `<div class="scen-tabs" role="tablist">${Object.entries(GRUPOS).map(([k,g])=>`<button role="tab" data-stab="${k}" aria-selected="${k===tab}">${esc(g.label)}${a&&scenGroup(a)===k?' <span class="dotact"></span>':''}</button>`).join("")}</div>`;
  let body;
  if(!L_.length){
    body=`<p class="scen-empty">Todavía no hay superficies para ${esc(GRUPOS[tab].largo.toLowerCase())}. Cargá un KML, KMZ o GeoJSON por cada nivel o caudal.</p>`;
  } else {
    const rows=visible();
    let info;
    if(aIn){
      let din=0,cer=0; rows.forEach(r=>{ const e=expo(a,r); if(!e) return; if(e.in) din++; else if(e.d<=scen.margin) cer++; });
      info=`<b>${esc(scenName(a))}</b>${a.simulado?' <span class="pill warn">Simulado</span>':a.referencia?' <span class="pill">Referencia</span>':''} · ${fmtKm2(a.area_km2)} km² · <b>${din}</b> ficha${din===1?"":"s"} dentro · <b>${cer}</b> a menos de ${scen.margin} m`;
    } else info = a ? `Activo: ${esc(scenName(a))} (${esc(GRUPOS[scenGroup(a)].label)}). Elegí uno de esta pestaña para cambiarlo.` : (GRUPOS[tab].base ? "Elegí un nivel para cambiar la extensión del embalse en el mapa." : "Elegí un escenario para ver qué fichas quedan dentro del área de agua.");
    const sim = L_.some(s=>s.simulado);
    body=`<div class="scen-seg" role="radiogroup" aria-label="Escenario activo">
      <button role="radio" data-scen="" aria-checked="${!aIn}">Ninguno</button>
      ${L_.map(s=>`<button role="radio" data-scen="${esc(s.id)}" aria-checked="${!!(a&&a.id===s.id)}" class="${s.simulado?"sim":""}" title="${esc(scenName(s))} · ${fmtKm2(s.area_km2)} km²${s.simulado?" · simulado":""}">${scen.showAll?`<i style="background:${scenColor(s)}"></i>`:""}${esc(scenName(s))}</button>`).join("")}
    </div>
    <div class="scen-info">${info}</div>
    ${sim?`<div class="scen-note">Los niveles subrayados son simulaciones ilustrativas. Reemplazalos con las superficies estimadas del estudio.</div>`:""}`;
  }
  card.innerHTML = `<div class="scen-h"><span class="flabel">Escenarios de agua</span><span><button class="linkbtn" id="scenUp">Cargar</button> · <button class="linkbtn" id="scenManage">Administrar</button></span></div>${tabs}${body}
    <div class="scen-opts"><label>Margen <select id="scenMargin" class="sel" aria-label="Margen de cercanía">${[0,25,50,100,200,500].map(m=>`<option value="${m}"${m===scen.margin?" selected":""}>${m} m</option>`).join("")}</select></label>
      <label><input type="checkbox" id="scenAll"${scen.showAll?" checked":""}> Superponer la pestaña</label></div>`;
  card.querySelectorAll("[data-stab]").forEach(b=>b.onclick=()=>{ scen.tab=b.dataset.stab; saveScen(); drawScen(); renderScenCard(); });
  card.querySelectorAll("[data-scen]").forEach(b=>b.onclick=()=>setScen(b.dataset.scen||null));
  $("#scenManage").onclick=openScenManager;
  $("#scenUp").onclick=()=>$("#scenFile").click();
  $("#scenMargin").onchange=e=>{ scen.margin=+e.target.value; saveScen(); scenChanged(); };
  $("#scenAll").onchange=e=>{ scen.showAll=e.target.checked; saveScen(); drawScen(); renderScenCard(); };
}
function setScen(id){
  const prev=scen.active; scen.active=id||null;
  if(scen.active && state.colorBy!=="exposicion"){ state.prevColorBy=state.colorBy; state.colorBy="exposicion"; }
  if(!scen.active && state.colorBy==="exposicion"){ state.colorBy=state.prevColorBy||"ivh"; }
  if(!scen.active && state.filters.stat==="expuestas") state.filters.stat="";
  if(scen.active) scen.tab=scenGroup(activeScen());
  saveScen(); saveSoon();
  scenChanged();
  if(scen.active && !state.selected){ const s=activeScen(); const pg=prev&&scenById(prev); if(!pg || scenGroup(pg)!==scenGroup(s)){ try{ const b=s.bbox; map.flyToBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[60,60],duration:.6,maxZoom:13}); }catch(e){} } }
}
function scenChanged(){ drawScen(); renderScenCard(); renderData(); renderDrawer(); }

/* ---------- carga de archivos ---------- */
function dpSimplify(pts, tol){
  if(pts.length<=4) return pts;
  const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]]; const t2=tol*tol;
  while(stack.length){ const [a,b]=stack.pop(); let md=0, mi=-1; const ax=pts[a][0],ay=pts[a][1],bx=pts[b][0],by=pts[b][1];
    for(let i=a+1;i<b;i++){ const d=segDist(pts[i][0],pts[i][1],ax,ay,bx,by); if(d>md){ md=d; mi=i; } }
    if(md*md>t2 && mi>0){ keep[mi]=1; stack.push([a,mi],[mi,b]); } }
  return pts.filter((p,i)=>keep[i]);
}
function polysFromGeoJSON(gj){
  const out=[];
  const walk=g=>{ if(!g) return; if(g.type==="Polygon") out.push(g.coordinates); else if(g.type==="MultiPolygon") g.coordinates.forEach(c=>out.push(c)); else if(g.type==="GeometryCollection") g.geometries.forEach(walk); };
  const feats = gj.type==="FeatureCollection"?gj.features:gj.type==="Feature"?[gj]:[{geometry:gj}];
  feats.forEach(f=>walk(f.geometry));
  return out.map(rings=>rings.map(r=>dpSimplify(r.map(p=>[+(+p[0]).toFixed(5),+(+p[1]).toFixed(5)]),0.00004)).filter(r=>r.length>=4)).filter(p=>p.length);
}
function ringArea(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++){ a+=(r[j][0]*KX)*(r[i][1]*KY)-(r[i][0]*KX)*(r[j][1]*KY); } return Math.abs(a/2); }
async function kmzToGeoJSON(file){
  if(typeof JSZip==="undefined") throw new Error("no se pudo cargar el lector de KMZ");
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const k=Object.keys(zip.files).find(n=>/\.kml$/i.test(n)); if(!k) throw new Error("el KMZ no contiene un KML");
  return toGeoJSON.kml(new DOMParser().parseFromString(await zip.files[k].async("string"),"text/xml"));
}
async function fileToGeoJSON(file){
  const ext=file.name.split(".").pop().toLowerCase();
  if(ext==="kmz") return kmzToGeoJSON(file);
  if(ext==="kml"){ if(typeof toGeoJSON==="undefined") throw new Error("no se pudo cargar el lector de KML"); return toGeoJSON.kml(new DOMParser().parseFromString(await file.text(),"text/xml")); }
  return JSON.parse(await file.text());
}
async function readScenFile(file, grupo){
  const polys=polysFromGeoJSON(await fileToGeoJSON(file));
  if(!polys.length) throw new Error("el archivo no tiene polígonos");
  const base=file.name.replace(/\.[^.]+$/,"").replace(/^[0-9a-f]{6,}-/i,"");
  const m=base.match(/-?\d+(?:[.,]\d+)?/); const valor=m?parseNum(m[0]):null;
  const area=polys.reduce((t,p)=>t+ringArea(p[0])-p.slice(1).reduce((h,r)=>h+ringArea(r),0),0)/1e6;
  return prepScenario({id:"u"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), nombre:base, valor, grupo, area_km2:+area.toFixed(2), archivo:file.name, embebido:false, geom:{type:"MultiPolygon",coordinates:polys}});
}
$("#scenFile").addEventListener("change", async e=>{
  const files=[...e.target.files]; e.target.value=""; if(!files.length) return;
  const added=[];
  for(const f of files){ try{ const s=await readScenFile(f, scen.tab); scen.list.push(s); added.push(s); }catch(err){ toast(`${f.name}: ${err.message||err}`); } }
  if(!added.length) return;
  const ok=saveScen();
  toast(`${added.length} superficie${added.length>1?"s":""} cargada${added.length>1?"s":""} en ${GRUPOS[scen.tab].label}${ok?"":". Son muy pesadas para guardarlas en este navegador: se usan solo en esta sesión"}.`);
  if(!scen.active) setScen(added[0].id); else scenChanged();
  if($("#overlay") && $("#scenTable")) openScenManager();
});
function openScenManager(){
  const L_=scen.list.filter(s=>!scen.removed.includes(s.id)).sort((a,b)=>Object.keys(GRUPOS).indexOf(scenGroup(a))-Object.keys(GRUPOS).indexOf(scenGroup(b)) || (scenValue(a)??0)-(scenValue(b)??0));
  const removedEmb=scen.list.filter(s=>s.embebido && scen.removed.includes(s.id));
  openModal(`${mhead("Escenarios de agua")}
    <div class="mbody">
      <p>Cada escenario es un polígono con la superficie que cubre el agua en una situación proyectada: una crecida (caudal) o un nivel del embalse (cota). Al elegir un nivel, el embalse cambia de extensión en el mapa y el visor calcula qué fichas quedan dentro, cerca o lejos del agua.</p>
      <div style="overflow-x:auto" id="scenTable"><table class="t"><thead><tr><th></th><th>Nombre</th><th>Tipo</th><th class="num">Valor</th><th class="num">Área (km²)</th><th>Origen</th><th></th></tr></thead><tbody>
      ${L_.map(s=>`<tr><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${scenColor(s)}"></span></td>
        <td><input class="sel" style="height:28px;min-width:110px" data-sname="${esc(s.id)}" value="${esc(scenName(s))}" aria-label="Nombre del escenario"></td>
        <td><select class="sel" style="height:28px" data-sgrp="${esc(s.id)}" aria-label="Tipo de escenario">${Object.entries(GRUPOS).map(([k,g])=>`<option value="${k}"${k===scenGroup(s)?" selected":""}>${esc(g.largo)}</option>`).join("")}</select></td>
        <td class="num"><input class="sel" type="number" step="any" style="height:28px;width:90px" data-sval="${esc(s.id)}" value="${esc(scenValue(s)??"")}" aria-label="Valor del escenario"></td>
        <td class="num">${fmtKm2(s.area_km2)}</td><td style="color:var(--ink-3);font-size:12px">${esc(s.archivo||"")}${s.simulado?" · simulado":s.embebido?" · incluido":""}</td>
        <td><button class="btn small ghost" data-srm="${esc(s.id)}">Quitar</button></td></tr>`).join("") || `<tr><td colspan="7" style="color:var(--ink-3)">No hay escenarios cargados.</td></tr>`}
      </tbody></table></div>
      <div class="callout">Los archivos nuevos se cargan en la pestaña que esté abierta en el panel del mapa (ahora: <b>${esc(GRUPOS[scen.tab].largo)}</b>); el tipo se puede cambiar acá. El valor ordena los escenarios (caudal en m³/s o cota en msnm); se toma del nombre del archivo y se puede corregir. Las geometrías se simplifican a unos 4 m.</div>
    </div>
    <div class="mfoot">${removedEmb.length?`<button class="btn" id="scenRestore">Restaurar incluidos (${removedEmb.length})</button>`:""}<span class="spacer"></span><button class="btn" id="scenAdd">Cargar KML, KMZ o GeoJSON</button><button class="btn primary" data-close>Listo</button></div>`, "wide");
  $("#scenAdd").onclick=()=>$("#scenFile").click();
  if($("#scenRestore")) $("#scenRestore").onclick=()=>{ scen.removed=[]; saveScen(); scenChanged(); openScenManager(); };
  document.querySelectorAll("[data-sname]").forEach(i=>i.onchange=()=>{ scen.names[i.dataset.sname]=i.value.trim()||undefined; saveScen(); scenChanged(); });
  document.querySelectorAll("[data-sgrp]").forEach(i=>i.onchange=()=>{ scen.groups[i.dataset.sgrp]=i.value; saveScen(); scenChanged(); openScenManager(); });
  document.querySelectorAll("[data-sval]").forEach(i=>i.onchange=()=>{ const s=scenById(i.dataset.sval); const v=parseNum(i.value); scen.values[s.id]=v===""?null:v; saveScen(); scenChanged(); openScenManager(); });
  document.querySelectorAll("[data-srm]").forEach(b=>b.onclick=()=>{ const id=b.dataset.srm; const s=scenById(id); if(s.embebido) scen.removed.push(id); else scen.list=scen.list.filter(x=>x.id!==id); if(scen.active===id) setScen(null); saveScen(); scenChanged(); openScenManager(); });
}

/* ---------- vistas que usan los escenarios ---------- */
function scenFichaHtml(r){
  if(!scenList().length) return "";
  if(!hasCoords(r)) return `<div class="grp"><h4>Escenarios de agua</h4><p style="color:var(--ink-3);margin:0">La ficha no tiene coordenadas.</p></div>`;
  const a=activeScen();
  let html=`<div class="grp"><h4>Escenarios de agua</h4>`;
  for(const [g,G] of Object.entries(GRUPOS)){
    const L_=scenList(g); if(!L_.length) continue;
    const fr=firstReach(r,g);
    html+=`<div class="scen-ficha-g"><div class="scen-first"><b>${esc(G.largo)}</b>: ${fr?`el primer escenario que la alcanza es <b>${esc(scenName(fr))}</b>.`:`ningún escenario cargado la alcanza.`}</div>
      <table class="parts">${L_.map(s=>{ const e=expo(s,r); const st=expoStatus(s,r); const cls=st.startsWith("Dentro")?"bad":st.startsWith("A menos")?"warn":""; return `<tr${a&&a.id===s.id?' class="scen-row-active"':''}><td>${esc(scenName(s))}${s.simulado?' <span class="simtag">sim.</span>':''}</td><td class="v"><span class="pill ${cls}">${esc(st)}</span></td><td>${e&&e.in?"":"a "+fmtDist(e)+(G.base?" del agua":" del borde")}</td></tr>`; }).join("")}</table></div>`;
  }
  return html+`</div>`;
}
function scenSummaryHtml(rows){
  if(!scenList().length) return "";
  const pers=r=>{ const n=+r.integrantes; return Number.isFinite(n)?n:0; };
  let html="";
  for(const [g,G] of Object.entries(GRUPOS)){
    const L_=scenList(g); if(!L_.length) continue;
    const lvl=!!G.base;
    html+=`<div><h3>${esc(G.largo)}</h3><div style="overflow-x:auto"><table class="t"><thead><tr><th>Escenario</th><th class="num">Dentro</th><th class="num">&lt; ${scen.margin} m</th>${lvl?`<th class="num">Usuarios lejos</th>`:`<th class="num">Personas</th>`}<th class="num">IVH alto</th></tr></thead><tbody>
    ${L_.map(s=>{ let din=0,cer=0,p=0,ivhA=0,far=0; rows.forEach(r=>{ const e=expo(s,r); if(!e) return; const near=!e.in&&e.d<=scen.margin; if(e.in){ din++; p+=pers(r); } else if(near) cer++; if((e.in||near) && ivh(r).nivel==="Alta") ivhA++; if(lvl && !e.in && e.d>500 && usaEmbalse(r)) far++; }); return `<tr${scen.active===s.id?' class="scen-row-active"':''}><td><button class="linkbtn" data-sumscen="${esc(s.id)}">${esc(scenName(s))}</button>${s.simulado?' <span class="simtag">sim.</span>':''}<div style="font-size:11px;color:var(--ink-3)">${fmtKm2(s.area_km2)} km²</div></td><td class="num">${din}</td><td class="num">${cer}</td><td class="num">${lvl?far:p}</td><td class="num">${ivhA}</td></tr>`; }).join("")}
    </tbody></table></div><p class="note">${lvl?`Usuarios lejos: fichas que usan el embalse (pesca, riego, abrevadero, cruce, turismo o toma directa) y quedan a más de 500 m del agua con ese nivel.`:`Personas: integrantes declarados en las fichas que quedan dentro.`} IVH alto: dentro o a menos de ${scen.margin} m.</p></div>`;
  }
  return html;
}
