let databaseRevision=0, databaseCsrf="", databaseSaveQueue=Promise.resolve(), databaseSaveBlocked=false;

async function apiRequest(path,options={}){
  const headers={...(options.headers||{})};
  if(options.body) headers["Content-Type"]="application/json";
  if(options.method && options.method!=="GET") headers["X-CSRF-Token"]=databaseCsrf;
  const response=await fetch(path,{...options,headers,credentials:"same-origin"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.error||"Error HTTP "+response.status),{status:response.status,data});
  return data;
}

async function save(){
  if(databaseSaveBlocked) return;
  const payload=JSON.parse(JSON.stringify({records:state.records,history:state.history,editor:state.editor,source:state.source,colorBy:state.colorBy}));
  databaseSaveQueue=databaseSaveQueue.catch(()=>{}).then(async()=>{
    if(databaseSaveBlocked) return;
    payload.revision=databaseRevision;
    try{
      const result=await apiRequest("/api/snapshot",{method:"POST",body:JSON.stringify(payload)});
      databaseRevision=result.revision;
    }catch(error){
      if(error.status===409){
        databaseSaveBlocked=true;
        toast("Otra sesión guardó cambios. Recargá esta página para continuar.");
      }else toast("No se pudo guardar en el servidor: "+error.message);
      throw error;
    }
  });
  return databaseSaveQueue.catch(()=>{});
}

const saveSoon=debounce(()=>save(),400);

async function load(){
  const data=await apiRequest("/api/snapshot");
  databaseRevision=data.revision;
  state.records=data.records.map(record=>asegurarClase(Object.assign(blank(),record)));
  state.history=data.history||[];
  state.editor=data.editor||"";
  state.source=data.source||state.source;
  state.colorBy=data.colorBy||"ivh";
}

async function resetSample(){
  const data=await apiRequest("/api/reset",{method:"POST",body:"{}"});
  databaseRevision=data.revision;
  databaseSaveBlocked=false;
  state.records=data.records.map(record=>asegurarClase(Object.assign(blank(),record)));
  state.history=data.history||[];
  state.editor=data.editor||"";
  state.source=data.source||{};
  state.colorBy=data.colorBy||"ivh";
}
