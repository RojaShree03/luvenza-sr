import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import DataTable from "./DataTable";
import StatusBadge from "./StatusBadge";

export default function ResourcePage({ title, endpoint, columns, createFields = [], actions = [], description, allowCreate = false }) {
  const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [query,setQuery]=useState("");
  const [showForm,setShowForm]=useState(false);const [form,setForm]=useState({});const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const res=await api.get(endpoint);const body=res.data?.data??res.data;const list=Array.isArray(body)?body:(body?.items||body?.results||body?.orders||body?.customizations||body?.customers||body?.tailors||body?.deliveryPartners||body?.collections||body?.components||body?.templates||body?.products||body?.measurements||[]);setRows(list);}catch(e){setError(getErrorMessage(e));}finally{setLoading(false);}},[endpoint]);
  useEffect(()=>{load();},[load]);
  function setField(e){setForm({...form,[e.target.name]:e.target.value});}
  async function create(e){e.preventDefault();setBusy(true);setError("");try{const payload={...form};createFields.forEach(f=>{if(f.type==="number"&&payload[f.name]!=="")payload[f.name]=Number(payload[f.name]);});await api.post(endpoint,payload);setForm({});setShowForm(false);await load();}catch(e){setError(getErrorMessage(e));}finally{setBusy(false);}}
  async function runAction(action,row){const id=row._id||row.id;let payload={};if(action.prompt){const answer=window.prompt(action.prompt);if(answer===null)return;payload[action.promptKey||"reason"]=answer;}if(action.fields){for(const field of action.fields){const answer=window.prompt(field.label,field.defaultValue||"");if(answer===null)return;payload[field.name]=field.type==="number"?Number(answer):answer;}}
    try{await api({method:action.method||"patch",url:action.url? action.url(row):`${endpoint}/${id}${action.path||""}`,data:payload});await load();}catch(e){setError(getErrorMessage(e));}}
  const filtered=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const finalColumns=[...columns];
  if(actions.length)finalColumns.push({key:"_actions",label:"Actions",render:(row)=><div className="flex flex-wrap gap-2">{actions.filter(a=>!a.when||a.when(row)).map(a=><button key={a.label} onClick={()=>runAction(a,row)} className="rounded-lg border border-plum-200 px-2.5 py-1.5 text-xs font-semibold text-plum-700 hover:bg-plum-50">{a.label}</button>)}</div>});
  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="page-title">{title}</h1><p className="muted mt-2">{description||"Manage records available to your account."}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>{allowCreate&&<button className="btn-primary" onClick={()=>setShowForm(!showForm)}><Plus size={16}/> Add new</button>}</div></div>
    {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {showForm&&<form onSubmit={create} className="panel grid gap-4 p-5 sm:grid-cols-2">{createFields.map(f=><div key={f.name}><label className="field-label">{f.label}</label>{f.options?<select className="field" name={f.name} value={form[f.name]||""} onChange={setField} required={f.required!==false}><option value="">Select {f.label}</option>{f.options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}</select>:<input className="field" name={f.name} type={f.type||"text"} value={form[f.name]||""} onChange={setField} required={f.required!==false} placeholder={f.placeholder||""}/>}</div>)}<div className="flex items-end gap-2"><button disabled={busy} className="btn-primary">{busy?"Saving…":"Save record"}</button><button type="button" className="btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button></div></form>}
    <div className="panel p-4"><div className="mb-4 flex items-center gap-2 rounded-xl border border-stone-200 px-3"><Search size={16} className="text-stone-400"/><input className="w-full py-2.5 text-sm outline-none" placeholder="Search records…" value={query} onChange={e=>setQuery(e.target.value)}/></div>{loading?<p className="py-12 text-center text-sm text-stone-400">Loading records…</p>:<DataTable columns={finalColumns} rows={filtered.map(r=>({...r,statusCell:r.status}))}/>}</div>
  </div>;
}

export const statusColumn = {key:"status",label:"Status",render:row=><StatusBadge status={row.status}/>};
