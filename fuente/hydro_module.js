/* ============================================================
   HIDROLOGÍA: estaciones con datos, nivel del embalse, proyección y umbrales
   ============================================================ */
const HYKEY = "censo-hidrosocial-hidro-v1";
const VARS = {
  lluvia_mm:{label:"Lluvia", unidad:"mm", dec:1, bar:true},
  caudal_m3s:{label:"Caudal", unidad:"m³/s", dec:1},
  nivel_m:{label:"Nivel del río", unidad:"m", dec:2},
  cota_msnm:{label:"Cota del embalse", unidad:"msnm", dec:2},
  temp_max_c:{label:"Temperatura máxima", unidad:"°C", dec:1},
  temp_min_c:{label:"Temperatura mínima", unidad:"°C", dec:1},
  humedad_pct:{label:"Humedad relativa", unidad:"%", dec:0}
};
const VAR_ALIAS = {lluvia:"lluvia_mm",precipitacion:"lluvia_mm",lluvia_mm:"lluvia_mm",pp:"lluvia_mm",caudal:"caudal_m3s",caudal_m3s:"caudal_m3s",q:"caudal_m3s",nivel:"nivel_m",nivel_m:"nivel_m",altura:"nivel_m",cota:"cota_msnm",cota_msnm:"cota_msnm",nivel_embalse:"cota_msnm",temp_max:"temp_max_c",temp_max_c:"temp_max_c",tmax:"temp_max_c",temp_min:"temp_min_c",temp_min_c:"temp_min_c",tmin:"temp_min_c",humedad:"humedad_pct",humedad_pct:"humedad_pct",hr:"humedad_pct"};
const UMB_DEF = [
  {id:"u1", nombre:"Atención", cota:220.5, criterio:"pozos", accion:"Aviso preventivo a las comunidades y seguimiento de pozos someros."},
  {id:"u2", nombre:"Alerta", cota:219.0, criterio:"usuarios", accion:"Visitas y plan de abastecimiento alternativo (agua de consumo y abrevadero)."},
  {id:"u3", nombre:"Crítico", cota:217.5, criterio:"pesca", accion:"Plan de contingencia, comunicación intensiva y refuerzo del mecanismo de quejas."}
];
const CRITERIOS = {
  pozos:"Fichas con pozo somero o aljibe a menos de 2 km del agua a nivel normal",
  usuarios:"Fichas que usan el embalse y quedarían a más de 500 m del agua con esa cota",
  pesca:"Pescadores, balsas, embarcaderos y tomas directas del embalse"
};
const hy = { fechas:[], series:{}, idx:0, auto:false, esc:"normal", qout:HYDRO.qout, umbrales:UMB_DEF.map(u=>({...u})), simulado:HYDRO.simulado, cargas:[], playing:null, alertSets:{} };
function hySave(){ try{ localStorage.setItem(HYKEY, JSON.stringify({fechas:hy.fechas, series:hy.series, idx:hy.idx, auto:hy.auto, esc:hy.esc, qout:hy.qout, umbrales:hy.umbrales, cargas:hy.cargas})); }catch(e){} }
function hyLoad(){
  hy.fechas=HYDRO.fechas.slice(); hy.series=JSON.parse(JSON.stringify(HYDRO.series));
  try{ const s=JSON.parse(localStorage.getItem(HYKEY)||"null"); if(s){ hy.fechas=s.fechas||hy.fechas; hy.series=s.series||hy.series; hy.auto=!!s.auto; hy.esc=s.esc||"normal"; hy.qout=s.qout??HYDRO.qout; hy.umbrales=s.umbrales||hy.umbrales; hy.cargas=s.cargas||[]; hy.idx=Math.min(s.idx??hy.fechas.length-1, hy.fechas.length-1); return; } }catch(e){}
  hy.idx=hy.fechas.length-1;
}
const stById = id => STATIONS.find(s=>s.id===id);
const sv = (id,v) => hy.series[id+"|"+v];
function lastValid(arr,i){ if(!arr) return null; for(let k=i;k>=0;k--) if(arr[k]!=null) return {i:k,v:arr[k]}; return null; }
function acum(arr,i,n){ if(!arr) return null; let s=0,c=0; for(let k=Math.max(0,i-n+1);k<=i;k++){ if(arr[k]!=null){ s+=arr[k]; c++; } } return c?{v:s,comp:c/n}:null; }
const fmtN = (v,d=1) => v==null||!isFinite(v)?"—":(+v).toLocaleString("es-PY",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtF = i => fmtD(hy.fechas[i]);
const rainIds = () => STATIONS.filter(s=>sv(s.id,"lluvia_mm")).map(s=>s.id);
function basinRain(i,n){ const vals=rainIds().map(id=>acum(sv(id,"lluvia_mm"),i,n)).filter(x=>x&&x.comp>=.6).map(x=>x.v); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null; }
function basinDaily(i){ const vals=rainIds().map(id=>sv(id,"lluvia_mm")[i]).filter(v=>v!=null); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null; }
function cotaAt(lim,i){ const a=sv(HYDRO.limni[lim],"cota_msnm"); const lv=lastValid(a,i); return lv?lv.v:null; }
function qinAt(i){ let s=0,n=0; for(const id of HYDRO.afluentes){ const lv=lastValid(sv(id,"caudal_m3s"),i); if(lv){ s+=lv.v; n++; } } return n?s*HYDRO.factor:null; }
function areaAt(c){ const C=HYDRO.curva; if(c<=C[0][0]) return C[0][1]*1e6; for(let k=1;k<C.length;k++){ if(c<=C[k][0]){ const t=(c-C[k-1][0])/(C[k][0]-C[k-1][0]); return (C[k-1][1]+t*(C[k][1]-C[k-1][1]))*1e6; } } return C[C.length-1][1]*1e6; }
function project(i, esc, mult=1, days=30){
  const h0=cotaAt("yguazu",i); if(h0==null) return null;
  let q0=0,c=0; for(let k=i-2;k<=i;k++){ const q=qinAt(k); if(q!=null){ q0+=q; c++; } } q0=c?q0/c:HYDRO.clima.qin_normal_nov;
  const qn=HYDRO.clima.qin_normal_nov; const out=[h0]; let h=h0;
  for(let t=1;t<=days;t++){
    let q = esc==="seco" ? Math.max(.35*q0, q0*Math.exp(-t/14)) : esc==="lluvioso" ? 1.7*qn : qn;
    if(esc!=="seco") q = q0 + (q-q0)*Math.min(1,t/7);
    h += (q*mult - hy.qout)*86400/areaAt(h); out.push(h);
  }
  return out;
}
function nearestLevel(c){
  const all=scen.list.filter(s=>!scen.removed.includes(s.id) && scenGroup(s)==="yguazu");
  const real=all.filter(s=>!s.simulado && !s.referencia);
  const pool = real.length>=2 ? real : all;
  return pool.reduce((b,s)=>!b||Math.abs(scenValue(s)-c)<Math.abs(scenValue(b)-c)?s:b,null);
}
function refLevel(){ const L_=scen.list.filter(s=>!scen.removed.includes(s.id) && scenGroup(s)==="yguazu"); return L_.find(s=>s.referencia) || L_.reduce((b,s)=>!b||scenValue(s)>scenValue(b)?s:b,null); }
function umbralMembers(u){
  const ref=refLevel(); const lvl=nearestLevel(u.cota); const set=new Set();
  for(const r of state.records){
    if(!hasCoords(r) || r.embalse==="Acaray") continue;
    const er=ref?expo(ref,r):null;
    if(u.criterio==="pozos"){ if(["Pozo somero propio","Aljibe o agua de lluvia"].includes(r.fuente_agua_consumo) && er && (er.in||er.d<=2000)) set.add(r.codigo); }
    else if(u.criterio==="usuarios"){ const e=lvl?expo(lvl,r):null; if(usaEmbalse(r) && e && !e.in && e.d>500 && er && (er.in||er.d<=2000)) set.add(r.codigo); }
    else if(u.criterio==="pesca"){ const p = r.actividad_principal==="Pesca" || splitMulti(r.usos_agua).some(x=>/Pesca|Transporte/.test(x)) || r.tipo_unidad==="Embarcadero o balsa" || r.fuente_agua_consumo==="Toma directa del embalse"; if(p && er && (er.in||er.d<=3000)) set.add(r.codigo); }
  }
  hy.alertSets[u.id]=set; return set;
}
function umbralEstado(u, h, proj){
  if(h!=null && h<=u.cota) return {cls:"bad", txt:"Activo"};
  if(proj){ const k=proj.findIndex(v=>v<=u.cota); if(k>0){ const d=new Date(hy.fechas[hy.idx]+"T12:00:00"); d.setDate(d.getDate()+k); return {cls:"warn", txt:`En ${k} días (${d.toLocaleDateString("es-PY",{day:"2-digit",month:"2-digit"})})`}; } }
  return {cls:"", txt:"Sin riesgo a 30 días"};
}

/* ---------- gráficos SVG ---------- */
function chartSVG(o){
  const W=o.w||320, H=o.h||120, P={l:36,r:8,t:8,b:18};
  const all=[]; o.series.forEach(s=>s.vals.forEach(v=>{ if(v!=null&&isFinite(v)) all.push(v); })); (o.thr||[]).forEach(t=>all.push(t.y)); if(o.band) o.band.forEach(b=>b&&all.push(b[0],b[1]));
  if(!all.length) return `<div class="ch-empty">Sin datos en el período.</div>`;
  let lo=o.min??Math.min(...all), hi=o.max??Math.max(...all); if(o.bar) lo=0; if(hi-lo<1e-6){ hi+=1; lo-=o.bar?0:1; }
  const pad=(hi-lo)*.08; if(!o.bar) lo-=pad; hi+=pad;
  const n=o.n; const X=i=>P.l+(W-P.l-P.r)*(n<=1?0:i/(n-1)); const Y=v=>P.t+(H-P.t-P.b)*(1-(v-lo)/(hi-lo));
  const ticks=[lo+(hi-lo)*.1, (lo+hi)/2, hi-(hi-lo)*.1];
  let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" class="ch" role="img" aria-label="${esc(o.label||"Gráfico")}">`;
  ticks.forEach(t=>{ g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="ch-grid"/><text x="${P.l-4}" y="${(Y(t)+3).toFixed(1)}" class="ch-ax" text-anchor="end">${fmtN(t,o.dec??1)}</text>`; });
  (o.thr||[]).forEach(t=>{ g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${Y(t.y).toFixed(1)}" y2="${Y(t.y).toFixed(1)}" class="ch-thr ${t.cls||""}"/><text x="${W-P.r-2}" y="${(Y(t.y)-3).toFixed(1)}" class="ch-thrl ${t.cls||""}" text-anchor="end">${esc(t.label)}</text>`; });
  if(o.band){ let up="",dn=""; o.band.forEach((b,i)=>{ if(!b) return; up+=`${up?"L":"M"}${X(i).toFixed(1)},${Y(b[1]).toFixed(1)}`; }); const rev=o.band.map((b,i)=>[b,i]).filter(x=>x[0]).reverse(); rev.forEach(([b,i])=>{ dn+=`L${X(i).toFixed(1)},${Y(b[0]).toFixed(1)}`; }); g+=`<path d="${up}${dn}Z" class="ch-band"/>`; }
  if(o.bar){ const s=o.series[0]; const bw=Math.max(1,(W-P.l-P.r)/n-1); s.vals.forEach((v,i)=>{ if(v==null||v<=0) return; const y=Y(v); g+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(Y(0)-y).toFixed(1)}" rx="1" class="ch-bar"/>`; }); }
  else o.series.forEach(s=>{ let d="",pen=false; s.vals.forEach((v,i)=>{ if(v==null||!isFinite(v)){ pen=false; return; } d+=`${pen?"L":"M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen=true; }); g+=`<path d="${d}" class="ch-line ${s.cls||""}" fill="none"/>`; });
  if(o.mark!=null){ g+=`<line x1="${X(o.mark).toFixed(1)}" x2="${X(o.mark).toFixed(1)}" y1="${P.t}" y2="${H-P.b}" class="ch-now"/>`; }
  if(o.xl) g+=`<text x="${P.l}" y="${H-4}" class="ch-ax">${esc(o.xl[0])}</text>${o.xl[2]?`<text x="${X(o.mark??Math.floor(n/2)).toFixed(1)}" y="${H-4}" class="ch-ax" text-anchor="middle">${esc(o.xl[2])}</text>`:""}<text x="${W-P.r}" y="${H-4}" class="ch-ax" text-anchor="end">${esc(o.xl[1])}</text>`;
  g+=`<line class="ch-cursor" x1="0" x2="0" y1="${P.t}" y2="${H-P.b}" style="display:none"/><rect class="ch-hit" x="${P.l}" y="0" width="${W-P.l-P.r}" height="${H}" fill="transparent"/></svg>`;
  return `<div class="ch-wrap" data-chart='${JSON.stringify({n, W, l:P.l, r:P.r, labels:o.labels, s:o.series.map(s=>({name:s.name, vals:s.vals.map(v=>v==null?null:+(+v).toFixed(o.dec??2))})), u:o.unidad||"", dec:o.dec??1}).replace(/'/g,"&#39;")}'><div class="ch-read">${esc(o.readDefault||"")}</div>${g}</div>`;
}
function bindCharts(root){
  root.querySelectorAll(".ch-wrap").forEach(w=>{
    const cfg=JSON.parse(w.dataset.chart); const svg=w.querySelector("svg"); const read=w.querySelector(".ch-read"); const cur=w.querySelector(".ch-cursor"); const def=read.textContent;
    const move=e=>{ const b=svg.getBoundingClientRect(); const x=(e.clientX-b.left)/b.width*cfg.W; const t=(x-cfg.l)/(cfg.W-cfg.l-cfg.r); const i=Math.max(0,Math.min(cfg.n-1,Math.round(t*(cfg.n-1))));
      const px=cfg.l+(cfg.W-cfg.l-cfg.r)*(cfg.n<=1?0:i/(cfg.n-1)); cur.setAttribute("x1",px); cur.setAttribute("x2",px); cur.style.display="";
      read.textContent=`${cfg.labels[i]||""}: `+cfg.s.map(s=>`${s.name?s.name+" ":""}${s.vals[i]==null?"sin dato":fmtN(s.vals[i],cfg.dec)+" "+cfg.u}`).join(" · "); };
    svg.addEventListener("pointermove",move); svg.addEventListener("pointerdown",move);
    svg.addEventListener("pointerleave",()=>{ cur.style.display="none"; read.textContent=def; });
  });
}
const dayLabels = (a,b) => hy.fechas.slice(a,b+1).map(fmtD);
function addDays(iso,k){ const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+k); return d.toISOString().slice(0,10); }

/* ---------- panel de hidrología ---------- */
function renderHydro(){
  const el=$("#paneHy"); if(!el || state.tab!=="hy") return;
  const i=hy.idx, f=hy.fechas;
  const h=cotaAt("yguazu",i), h7=cotaAt("yguazu",Math.max(0,i-7)), h30=cotaAt("yguazu",Math.max(0,i-30));
  const projs={seco:project(i,"seco"), normal:project(i,"normal"), lluvioso:project(i,"lluvioso")};
  const pSel=projs[hy.esc]; const pLo=project(i,hy.esc,.8), pHi=project(i,hy.esc,1.2);
  const U=hy.umbrales.slice().sort((a,b)=>b.cota-a.cota);
  const est=U.find(u=>h!=null&&h<=u.cota);
  const span=120, a=Math.max(0,i-span);
  const hist=sv(HYDRO.limni.yguazu,"cota_msnm").slice(a,i+1);
  const n=hist.length+30;
  const lbl=dayLabels(a,i).concat(Array.from({length:30},(_,k)=>fmtD(addDays(f[i],k+1))));
  const pad=a=>Array(hist.length-1).fill(null).concat(a);
  const cotaChart=chartSVG({w:330,h:150,n,label:"Cota del embalse Yguazú",unidad:"msnm",dec:2,labels:lbl,mark:hist.length-1,
    series:[{name:"",vals:hist.concat(Array(30).fill(null)),cls:"main"},{name:"Proy.",vals:pad(pSel||[]),cls:"proj"}],
    band:pLo&&pHi?pad(pLo.map((v,k)=>[Math.min(v,pHi[k]),Math.max(v,pHi[k])])):null,
    thr:U.map(u=>({y:u.cota,label:`${u.nombre} ${fmtN(u.cota,1)}`,cls:u.id})), xl:[fmtD(f[a]),fmtD(addDays(f[i],30)),"hoy"], readDefault:"Pasá el cursor por el gráfico para ver cada día"});
  const projTxt = pSel ? (()=>{ const end=pSel[pSel.length-1]; const cross=U.map(u=>({u,k:pSel.findIndex(v=>v<=u.cota)})).filter(x=>x.k>0).sort((a,b)=>a.k-b.k)[0]; return `En 30 días: <b>${fmtN(end,2)} msnm</b> (${end>=h?"+":"−"}${fmtN(Math.abs(end-h),2)} m).${cross?` Cruzaría <b>${esc(cross.u.nombre)}</b> en ${cross.k} días.`:" No cruza nuevos umbrales."}`; })() : "Sin datos de cota para proyectar.";
  const r7=basinRain(i,7), r30=basinRain(i,30);
  const ra=Math.max(0,i-59); const rainBars=chartSVG({w:330,h:90,n:i-ra+1,bar:true,label:"Lluvia media diaria en la cuenca",unidad:"mm",dec:1,labels:dayLabels(ra,i),series:[{name:"",vals:Array.from({length:i-ra+1},(_,k)=>basinDaily(ra+k))}],xl:[fmtD(f[ra]),fmtD(f[i])],readDefault:"Lluvia media diaria de los pluviómetros"});
  const qa=Math.max(0,i-89); const qin=qinAt(i);
  const qChart=chartSVG({w:330,h:90,n:i-qa+1,label:"Aporte de afluentes",unidad:"m³/s",dec:0,labels:dayLabels(qa,i),series:[{name:"Aporte",vals:Array.from({length:i-qa+1},(_,k)=>qinAt(qa+k)),cls:"main"},{name:"Descarga",vals:Array(i-qa+1).fill(hy.qout),cls:"out"}],xl:[fmtD(f[qa]),fmtD(f[i])],readDefault:"Aporte estimado frente a la descarga de la presa"});
  const hA=cotaAt("acaray",i); const acA=Math.max(0,i-89);
  const acChart=chartSVG({w:330,h:70,n:i-acA+1,label:"Cota del embalse Acaray",unidad:"msnm",dec:2,labels:dayLabels(acA,i),series:[{name:"",vals:sv(HYDRO.limni.acaray,"cota_msnm").slice(acA,i+1),cls:"main"}],xl:[fmtD(f[acA]),fmtD(f[i])],readDefault:""});
  const stRows=STATIONS.map(s=>{ const st=stationStatus(s,i); return `<button class="st-row" data-st="${esc(s.id)}"><span class="st-ico st-mini${st.off?" off":""}">${stLetter(s.tipo)}</span><span class="mono">${esc(s.codigo)}</span><span class="nm">${esc(s.nombre)}</span><span class="vv">${st.txt}</span></button>`; }).join("");
  const lvl=h!=null?nearestLevel(h):null;
  el.innerHTML = `
    <div class="hy-time">
      <div class="hy-tl"><span>Datos al <b>${fmtF(i)}</b></span>${hy.simulado?'<span class="pill warn">Datos simulados</span>':""}</div>
      <div class="hy-slider"><button class="btn small iconbtn" id="hyPlay" aria-label="${hy.playing?"Pausar":"Reproducir los últimos 4 meses"}">${hy.playing?"❚❚":"▶"}</button><input type="range" id="hyIdx" min="0" max="${f.length-1}" value="${i}" aria-label="Fecha de los datos"></div>
      <div class="hy-tl2"><span>${fmtD(f[0])}</span><span>${fmtD(f[f.length-1])}</span></div>
    </div>
    <section class="hy-card">
      <div class="hy-h"><h3>Embalse Yguazú</h3><button class="linkbtn mono" data-st="${HYDRO.limni.yguazu}">${HYDRO.limni.yguazu}</button></div>
      <div class="hy-big">${fmtN(h,2)}<small> msnm</small>${est?`<span class="pill ${est.id==="u1"?"warn":"bad"}">${esc(est.nombre)}</span>`:`<span class="pill good">Normal</span>`}</div>
      <div class="hy-sub">7 días: ${h7!=null?(h-h7>=0?"+":"−")+fmtN(Math.abs(h-h7),2)+" m":"—"} · 30 días: ${h30!=null?(h-h30>=0?"+":"−")+fmtN(Math.abs(h-h30),2)+" m":"—"} · Aporte ${fmtN(qin,0)} m³/s · Descarga ${fmtN(hy.qout,0)} m³/s</div>
      ${cotaChart}
      <label class="hy-toggle"><input type="checkbox" id="hyAuto"${hy.auto?" checked":""}> Mostrar en el mapa el nivel medido${lvl?` <span class="hint">(superficie ${esc(scenName(lvl))})</span>`:""}</label>
      <div class="hy-proj">
        <div class="flabel">Proyección a 30 días</div>
        <div class="scen-seg" role="radiogroup" aria-label="Supuesto de lluvia">${[["seco","Sin lluvia"],["normal","Lluvia normal"],["lluvioso","Lluvioso"]].map(([k,l])=>`<button role="radio" data-esc="${k}" aria-checked="${hy.esc===k}">${l}</button>`).join("")}</div>
        <p class="hy-ptxt">${projTxt}</p>
        <div class="hy-prow"><label>Descarga de la presa <input type="number" id="hyQout" class="sel" value="${fmtN(hy.qout,0).replace(/\./g,"")}" step="5" min="0"> m³/s</label><button class="btn small" id="hyProjMap">Ver en el mapa</button></div>
        <p class="note">Balance hídrico simple a calibrar por el equipo de hidrología. La banda muestra ±20% en el aporte.</p>
      </div>
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Umbrales y fichas a contactar</h3></div>
      <div class="umb">${U.map(u=>{ const set=umbralMembers(u); const st=umbralEstado(u,h,pSel); return `<div class="umb-row umb-${u.id}">
        <div class="umb-a"><span class="umb-n">${esc(u.nombre)}</span><label class="umb-c">bajo <input type="number" step="0.1" class="sel" data-ucota="${u.id}" value="${u.cota}" aria-label="Cota del umbral ${esc(u.nombre)}"> msnm</label><span class="pill ${st.cls}">${st.txt}</span></div>
        <div class="umb-b">${esc(CRITERIOS[u.criterio])}.</div>
        <div class="umb-c2"><span><b>${set.size}</b> ficha${set.size===1?"":"s"}</span><button class="btn small" data-uver="${u.id}"${set.size?"":" disabled"}>Ver fichas</button></div>
        <div class="umb-acc">${esc(u.accion)}</div></div>`; }).join("")}</div>
      <p class="note">Umbrales y acciones son una propuesta a validar con el equipo. Las fichas se calculan con las superficies de agua cargadas para el Yguazú.</p>
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Lluvia en la cuenca</h3></div>
      <div class="hy-kpis"><div><b>${fmtN(r7,0)}</b> mm<span>últimos 7 días</span></div><div><b>${fmtN(r30,0)}</b> mm<span>últimos 30 días</span></div><div><b>${rainIds().length}</b><span>estaciones con lluvia</span></div></div>
      ${rainBars}
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Aporte de los afluentes al Yguazú</h3></div>
      ${qChart}
      <p class="note">Suma de las hidrométricas ${HYDRO.afluentes.join(", ")} con un factor de ${fmtN(HYDRO.factor,2)} por cuenca no aforada.</p>
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Embalse Acaray</h3><button class="linkbtn mono" data-st="${HYDRO.limni.acaray}">${HYDRO.limni.acaray}</button></div>
      <div class="hy-big sm">${fmtN(hA,2)}<small> msnm</small></div>
      ${acChart}
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Estaciones</h3><span class="hint">${STATIONS.filter(s=>stationStatus(s,i).off).length} sin datos recientes</span></div>
      <div class="st-list">${stRows}</div>
    </section>
    <section class="hy-card">
      <div class="hy-h"><h3>Datos de las estaciones</h3></div>
      <p class="note" style="margin-top:0">Cargá un CSV o Excel con columnas fecha, estación, variable y valor (o una columna por variable). Se suman a las series existentes y reemplazan los valores de las mismas fechas.</p>
      <div class="row"><button class="btn small" id="hyUp">Cargar datos de estaciones</button><button class="btn small ghost" id="hyTpl">Descargar plantilla</button></div>
      ${hy.cargas.length?`<p class="note">Últimas cargas: ${hy.cargas.slice(-3).reverse().map(c=>`${esc(c.archivo)} (${c.n} valores, ${fmtDT(c.at)})`).join("; ")}</p>`:""}
    </section>`;
  bindCharts(el);
  $("#hyIdx").oninput=e=>setHyIdx(+e.target.value, true);
  $("#hyIdx").onchange=e=>setHyIdx(+e.target.value);
  $("#hyPlay").onclick=togglePlay;
  $("#hyAuto").onchange=e=>{ hy.auto=e.target.checked; hySave(); if(hy.auto) applyAutoLevel(true); else if(activeScen()&&activeScen().auto) setScen(null); renderHydro(); };
  el.querySelectorAll("[data-esc]").forEach(b=>b.onclick=()=>{ hy.esc=b.dataset.esc; hySave(); renderHydro(); });
  $("#hyQout").onchange=e=>{ const v=parseNum(e.target.value); if(v!==""){ hy.qout=v; hySave(); renderHydro(); } };
  $("#hyProjMap").onclick=()=>{ const p=project(hy.idx,hy.esc); if(!p) return; hy.auto=false; hySave(); const s=nearestLevel(p[p.length-1]); if(s){ setScenKeep(s.id); toast(`Mapa con la extensión proyectada a 30 días (${esc(scenName(s))}, ${hy.esc==="seco"?"sin lluvia":hy.esc==="lluvioso"?"lluvioso":"lluvia normal"}).`); } renderHydro(); };
  el.querySelectorAll("[data-ucota]").forEach(inp=>inp.onchange=()=>{ const u=hy.umbrales.find(x=>x.id===inp.dataset.ucota); const v=parseNum(inp.value); if(v!==""){ u.cota=v; hySave(); renderHydro(); } });
  el.querySelectorAll("[data-uver]").forEach(b=>b.onclick=()=>{ const u=hy.umbrales.find(x=>x.id===b.dataset.uver); state.filters.alerta=u.id; state.alertaNombre=`${u.nombre} (bajo ${fmtN(u.cota,1)} msnm)`; setTab("list"); renderFilters(); renderData(); });
  el.querySelectorAll("[data-st]").forEach(b=>b.onclick=()=>openStation(b.dataset.st));
  $("#hyUp").onclick=()=>$("#hyFile").click();
  $("#hyTpl").onclick=downloadHyTemplate;
}
function stationStatus(s,i){
  const vars=Object.keys(VARS).filter(v=>sv(s.id,v));
  let last=-1; vars.forEach(v=>{ const lv=lastValid(sv(s.id,v),i); if(lv&&lv.i>last) last=lv.i; });
  const off = last<0 || i-last>3;
  let txt;
  if(sv(s.id,"cota_msnm")) txt=`${fmtN(lastValid(sv(s.id,"cota_msnm"),i)?.v,2)} msnm`;
  else if(sv(s.id,"caudal_m3s")) txt=`${fmtN(lastValid(sv(s.id,"caudal_m3s"),i)?.v,0)} m³/s`;
  else if(sv(s.id,"lluvia_mm")) txt=`${fmtN(acum(sv(s.id,"lluvia_mm"),i,7)?.v,0)} mm 7 d`;
  else txt="—";
  if(off) txt = last<0 ? "Sin datos" : `Sin datos desde ${fmtF(last)}`;
  return {off, last, txt};
}
function setHyIdx(i, light){
  hy.idx=Math.max(0,Math.min(hy.fechas.length-1,i));
  if(!light) hySave();
  updateStationIcons();
  if(hy.auto) applyAutoLevel(false);
  renderHydro();
  if(state.station) renderDrawer();
}
function togglePlay(){
  if(hy.playing){ clearInterval(hy.playing); hy.playing=null; hySave(); renderHydro(); return; }
  if(hy.idx>=hy.fechas.length-1) hy.idx=Math.max(0,hy.fechas.length-121);
  hy.playing=setInterval(()=>{ if(hy.idx>=hy.fechas.length-1){ clearInterval(hy.playing); hy.playing=null; hySave(); renderHydro(); return; } setHyIdx(hy.idx+2, true); }, 160);
  renderHydro();
}
function setScenKeep(id){ const keep=state.colorBy; setScen(id); if(keep!=="exposicion"){ state.colorBy=keep; saveSoon(); renderData(); } }
function applyAutoLevel(fly){
  const h=cotaAt("yguazu",hy.idx); if(h==null) return;
  const s=nearestLevel(h); if(!s || scen.active===s.id) return;
  const keep=state.colorBy; scen.active=s.id; scen.tab="yguazu"; saveScen(); scenChanged();
  if(keep!=="exposicion" && state.colorBy!==keep){ state.colorBy=keep; renderData(); }
  if(fly){ try{ const b=s.bbox; map.flyToBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[60,60],duration:.6,maxZoom:12}); }catch(e){} }
}

/* ---------- íconos de estaciones en el mapa ---------- */
const stLetter = t => /Hidrometeorol/.test(t)?"HM":(/Hidrom/.test(t)&&/Pluvi/.test(t))?"HP":/Hidrom/.test(t)?"H":/Pluvi/.test(t)?"P":/Limni/.test(t)?"L":/Meteorol/.test(t)?"M":"·";
const stMarkers = new Map();
function stationIcon(s){
  const st=stationStatus(s,hy.idx);
  return L.divIcon({className:"st-icon",iconSize:[18,18],iconAnchor:[9,9],html:`<span class="st-ico${st.off?" off":""}">${stLetter(s.tipo)}</span><span class="st-lbl">${st.off?"sin datos":esc(st.txt.replace(" 7 d",""))}</span>`});
}
function buildStations(){
  overlay.stations = L.layerGroup();
  for(const s of STATIONS){
    const m=L.marker([s.lat,s.lon],{pane:"stations",keyboard:false,icon:stationIcon(s)})
      .bindTooltip(()=>{ const st=stationStatus(s,hy.idx); return `<b class="mono">${esc(s.codigo)}</b> · Estación ${esc(s.tipo.toLowerCase())}<br>${esc(s.nombre)}${s.distrito?"<br>"+esc(s.distrito):""}<br><span style="color:var(--ink-3)">${esc(st.txt)}</span>`; },{direction:"top",offset:[0,-8]});
    m.on("click",ev=>{ L.DomEvent.stopPropagation(ev); openStation(s.id); });
    overlay.stations.addLayer(m); stMarkers.set(s.id,m);
  }
  overlay.stations.addTo(map);
}
function updateStationIcons(){ for(const s of STATIONS){ const m=stMarkers.get(s.id); if(m) m.setIcon(stationIcon(s)); } }

/* ---------- ficha de estación ---------- */
function openStation(id){
  state.selected=null; state.editing=null; state.station=id;
  const s=stById(id); if(s && window.innerWidth>900) flyOffset([s.lat,s.lon], Math.max(map.getZoom(),11));
  if(window.innerWidth<=900) $("#side").classList.remove("open");
  updateSelRing(); renderDrawer();
}
function stationHtml(id){
  const s=stById(id); const i=hy.idx; const st=stationStatus(s,i);
  const vars=Object.keys(VARS).filter(v=>sv(id,v));
  const a=Math.max(0,i-89);
  let comp=0,tot=0; vars.forEach(v=>{ const arr=sv(id,v); for(let k=a;k<=i;k++){ tot++; if(arr[k]!=null) comp++; } });
  let html=`<div class="dhead"><div class="r1"><div><div class="code">${esc(s.codigo)}</div><div class="where"><b>${esc(s.nombre)}</b><br>Estación ${esc(s.tipo.toLowerCase())}${s.distrito?" · "+esc(s.distrito):""}</div></div><button class="btn ghost iconbtn close" id="dClose" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="tags"><span class="pill ${st.off?"bad":"good"}">${st.off?(st.last<0?"Sin datos":"Sin datos desde "+fmtF(st.last)):"Transmitiendo"}</span><span class="pill">${tot?Math.round(comp/tot*100):0}% de datos en 90 días</span>${hy.simulado?'<span class="pill warn">Datos simulados</span>':""}</div></div><div class="dbody">`;
  for(const v of vars){
    const V=VARS[v]; const arr=sv(id,v); const vals=arr.slice(a,i+1);
    let kp="";
    if(v==="lluvia_mm"){ kp=`<div class="hy-kpis"><div><b>${fmtN(acum(arr,i,1)?.v,1)}</b> mm<span>último día</span></div><div><b>${fmtN(acum(arr,i,7)?.v,0)}</b> mm<span>7 días</span></div><div><b>${fmtN(acum(arr,i,30)?.v,0)}</b> mm<span>30 días</span></div></div>`; }
    else { const lv=lastValid(arr,i); const ok=vals.filter(x=>x!=null); kp=`<div class="hy-kpis"><div><b>${fmtN(lv?.v,V.dec)}</b> ${V.unidad}<span>último dato${lv?" · "+fmtF(lv.i):""}</span></div><div><b>${fmtN(ok.length?Math.min(...ok):null,V.dec)}</b><span>mínimo 90 días</span></div><div><b>${fmtN(ok.length?Math.max(...ok):null,V.dec)}</b><span>máximo 90 días</span></div></div>`; }
    const thr = v==="cota_msnm" && id===HYDRO.limni.yguazu ? hy.umbrales.map(u=>({y:u.cota,label:`${u.nombre} ${fmtN(u.cota,1)}`,cls:u.id})) : null;
    html+=`<div class="grp"><h4>${esc(V.label)} (${esc(V.unidad)})</h4>${kp}${chartSVG({w:400,h:V.bar?100:120,n:vals.length,bar:!!V.bar,label:V.label,unidad:V.unidad,dec:V.dec,labels:dayLabels(a,i),series:[{name:"",vals,cls:"main"}],thr,xl:[fmtF(a),fmtF(i)],readDefault:"Pasá el cursor por el gráfico para ver cada día"})}</div>`;
  }
  if(!vars.length) html+=`<div class="grp"><p>Esta estación todavía no tiene datos cargados.</p></div>`;
  html+=`<div class="grp"><h4>Ubicación</h4><dl class="kv"><dt>Coordenadas</dt><dd class="mono">${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}</dd>${s.nota?`<dt>Nota</dt><dd>${esc(s.nota)}</dd>`:""}</dl></div></div>`;
  return html;
}

/* ---------- carga de datos de estaciones ---------- */
function toISO(v){
  if(v instanceof Date) return v.toISOString().slice(0,10);
  if(typeof v==="number" && v>20000 && v<80000) return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
  const s=String(v??"").trim(); let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}
function stationIdFrom(v){ const c=norm(v).replace(/_/g,""); const s=STATIONS.find(s=>norm(s.id).replace(/_/g,"")===c) || STATIONS.find(s=>norm(s.codigo).replace(/_/g,"")===c) || STATIONS.find(s=>c.startsWith(norm(s.codigo).replace(/_/g,""))); return s?s.id:null; }
function ensureDate(iso){
  let k=hy.fechas.indexOf(iso); if(k>=0) return k;
  if(iso>hy.fechas[hy.fechas.length-1]){ let last=hy.fechas[hy.fechas.length-1]; while(last<iso){ last=addDays(last,1); hy.fechas.push(last); for(const key in hy.series) hy.series[key].push(null); } return hy.fechas.length-1; }
  if(iso<hy.fechas[0]){ let first=hy.fechas[0]; const add=[]; while(first>iso){ first=addDays(first,-1); add.unshift(first); } hy.fechas=add.concat(hy.fechas); for(const key in hy.series) hy.series[key]=Array(add.length).fill(null).concat(hy.series[key]); return 0; }
  return -1;
}
$("#hyFile").addEventListener("change", async e=>{
  const file=e.target.files[0]; e.target.value=""; if(!file) return;
  try{
    if(typeof XLSX==="undefined") throw new Error("no se pudo cargar el lector de Excel");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:true});
    if(!rows.length) throw new Error("el archivo no tiene filas");
    const cols=Object.keys(rows[0]); const nc=Object.fromEntries(cols.map(c=>[norm(c),c]));
    const cF=nc.fecha||nc.date||nc.dia, cS=nc.estacion||nc.codigo||nc.station||nc.estacion_codigo;
    if(!cF||!cS) throw new Error("faltan las columnas fecha y estación");
    const cV=nc.variable, cVal=nc.valor||nc.value;
    let n=0, skip=0; const sts=new Set();
    const put=(id,v,iso,val)=>{ const x=parseNum(val); if(x===""||!id||!iso){ skip++; return; } const key=id+"|"+v; if(!hy.series[key]) hy.series[key]=Array(hy.fechas.length).fill(null); const k=ensureDate(iso); if(k<0){ skip++; return; } hy.series[key][k]=x; n++; sts.add(id); };
    for(const r of rows){
      const iso=toISO(r[cF]); const id=stationIdFrom(r[cS]);
      if(cV&&cVal){ const v=VAR_ALIAS[norm(r[cV])]; if(!v){ skip++; continue; } put(id,v,iso,r[cVal]); }
      else for(const c of cols){ const v=VAR_ALIAS[norm(c)]; if(v) put(id,v,iso,r[c]); }
    }
    if(!n) throw new Error("no se reconocieron valores (revisá los códigos de estación y los nombres de las variables)");
    hy.cargas.push({archivo:file.name,n,at:nowISO()});
    hy.idx=hy.fechas.length-1; hySave(); updateStationIcons(); if(hy.auto) applyAutoLevel(false); renderHydro();
    toast(`Se cargaron ${n} valores de ${sts.size} estaciones${skip?` (${skip} filas sin reconocer)`:""}. Datos hasta ${fmtF(hy.fechas.length-1)}.`);
  }catch(err){ toast("No se pudieron cargar los datos: "+(err.message||err)); }
});
async function downloadHyTemplate(){
  if(typeof XLSX==="undefined"){ toast("El generador de Excel no se cargó."); return; }
  const wb=XLSX.utils.book_new(); const last=hy.fechas[hy.fechas.length-1]; const next=addDays(last,1);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{fecha:next,estacion:"AY23",variable:"cota_msnm",valor:219.4},{fecha:next,estacion:"AY18",variable:"lluvia_mm",valor:12.5},{fecha:next,estacion:"AY11",variable:"caudal_m3s",valor:48.2}]), "datos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATIONS.map(s=>({estacion:s.id,nombre:s.nombre,tipo:s.tipo,variables:Object.keys(VARS).filter(v=>sv(s.id,v)).join(", ")}))), "estaciones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(VARS).map(([k,v])=>({variable:k,descripcion:v.label,unidad:v.unidad}))), "variables");
  const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  if(await saveFile("plantilla_datos_estaciones.xlsx", new Blob([buf]))) toast("Plantilla descargada.");
}
