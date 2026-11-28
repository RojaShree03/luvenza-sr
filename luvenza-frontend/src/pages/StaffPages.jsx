import ResourcePage,{statusColumn} from "../components/ResourcePage";
import { useEffect,useState } from "react";
import api,{getErrorMessage} from "../services/api";
import { useAuth } from "../context/AuthContext";

export function TailorOrders(){return <ResourcePage title="Assigned tailoring orders" endpoint="/tailor/orders" description="Accept your assigned work, record progress and mark completed tailoring." columns={[
 {key:"_id",label:"Order",render:r=>(r._id||"").slice(-8)},
 {key:"customerId",label:"Customer",render:r=>r.customerId?.name||"—"},
 {key:"createdAt",label:"Placed",render:r=>r.createdAt?new Date(r.createdAt).toLocaleDateString():"—"},
 statusColumn
]} actions={[
 {label:"Accept",path:"/accept",when:r=>r.status==="tailor_assigned"},
 {label:"Reject",path:"/reject",prompt:"Reason for rejecting this assignment",when:r=>r.status==="tailor_assigned"},
 {label:"Mark ready",path:"/status",fields:[{name:"status",label:"New status (ready_for_delivery)"}],when:r=>r.status==="tailoring"}
]}/>;}

export function DeliveryOrders(){return <ResourcePage title="My deliveries" endpoint="/delivery/orders" description="Accept deliveries and update customer tracking status." columns={[
 {key:"_id",label:"Order",render:r=>(r._id||"").slice(-8)},
 {key:"customerId",label:"Customer",render:r=>r.customerId?.name||"—"},
 {key:"deliveryDetails",label:"Tracking",render:r=>r.deliveryDetails?.trackingNote||"—"},
 statusColumn
]} actions={[
 {label:"Accept",path:"/accept",when:r=>r.status==="delivery_assigned"},
 {label:"Reject",path:"/reject",prompt:"Reason for rejecting this delivery",when:r=>r.status==="delivery_assigned"},
 {label:"Out for delivery",path:"/status",fields:[{name:"status",label:"Status (out_for_delivery)"},{name:"trackingNote",label:"Tracking note"}],when:r=>r.status==="delivery_accepted"},
 {label:"Mark delivered",path:"/status",fields:[{name:"status",label:"Status (delivered)"},{name:"trackingNote",label:"Delivery note"}],when:r=>r.status==="out_for_delivery"}
]}/>;}

export function ProfilePage({kind}) {
 const {user}=useAuth();const base=kind==="tailor"?"/tailor/profile":kind==="delivery"?"/delivery/profile":"/users/profile";
 const [form,setForm]=useState({username:user?.username||"",phone:user?.phone||"",email:user?.email||"",specialization:user?.professionalDetails?.specialization||"",experience:user?.professionalDetails?.experience||"",vehicleType:user?.deliveryDetails?.vehicleType||"",vehicleNumber:user?.deliveryDetails?.vehicleNumber||"",licenseNumber:user?.deliveryDetails?.licenseNumber||""});
 const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{api.get(base).then(r=>{const payload=r.data?.data??r.data;const u=payload.profile||payload.partner||payload.user||payload;setForm(old=>({...old,username:u.username||u.name||old.username,phone:u.phone||old.phone,email:u.email||old.email,specialization:u.professionalDetails?.specialization||old.specialization,experience:u.professionalDetails?.experience||old.experience,vehicleType:u.deliveryDetails?.vehicleType||old.vehicleType,vehicleNumber:u.deliveryDetails?.vehicleNumber||old.vehicleNumber,licenseNumber:u.deliveryDetails?.licenseNumber||old.licenseNumber}));}).catch(e=>setError(getErrorMessage(e)));},[base]);
 function change(e){setForm({...form,[e.target.name]:e.target.value});}
 async function submit(e){e.preventDefault();setError("");setMessage("");let payload={username:form.username,phone:form.phone};if(kind==="tailor")payload.professionalDetails={specialization:form.specialization,experience:Number(form.experience||0)};if(kind==="delivery")payload.deliveryDetails={vehicleType:form.vehicleType,vehicleNumber:form.vehicleNumber,licenseNumber:form.licenseNumber};try{setBusy(true);await api.put(base,payload);setMessage("Profile updated successfully.");}catch(e){setError(getErrorMessage(e));}finally{setBusy(false);}}
 const fields=[["username","Display name"],["phone","Phone number"],...(kind==="tailor"?[["specialization","Specialization"],["experience","Years of experience"]]:kind==="delivery"?[["vehicleType","Vehicle type"],["vehicleNumber","Vehicle number"],["licenseNumber","Driving licence number"]]:[])];
 return <div className="max-w-3xl space-y-6"><div><h1 className="page-title">My profile</h1><p className="muted mt-2">Update the profile information linked to your account.</p></div>{error&&<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{message&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<form onSubmit={submit} className="panel space-y-4 p-6"><div><label className="field-label">Email address (read only)</label><input className="field bg-stone-50" value={form.email} readOnly/></div>{fields.map(([name,label])=><div key={name}><label className="field-label">{label}</label><input className="field" name={name} type={name==="experience"?"number":"text"} value={form[name]} onChange={change}/></div>)}<button disabled={busy} className="btn-primary">{busy?"Saving…":"Save profile"}</button></form></div>;
}

export function Availability(){
 const {user}=useAuth();const isTailor=user?.role==="tailor";const endpoint=isTailor?"/tailor/availability":"/delivery/availability";
 const [status,setStatus]=useState(user?.availabilityStatus||"available");const [message,setMessage]=useState("");const [error,setError]=useState("");
 async function save(){setMessage("");setError("");try{await api.patch(endpoint,{availabilityStatus:status});setMessage("Availability updated.");}catch(e){setError(getErrorMessage(e));}}
 return <div className="panel max-w-xl p-6"><h2 className="font-display text-2xl text-plum-900">Availability</h2><p className="muted mt-2">Set whether you can receive new work assignments.</p><select className="field mt-5" value={status} onChange={e=>setStatus(e.target.value)}><option value="available">Available</option><option value="unavailable">Unavailable</option></select><button onClick={save} className="btn-primary mt-4">Update availability</button>{message&&<p className="mt-3 text-sm text-emerald-700">{message}</p>}{error&&<p className="mt-3 text-sm text-rose-700">{error}</p>}</div>;
}


export function MonthlyReport({kind}) {
 const now=new Date(); const [year,setYear]=useState(now.getFullYear()); const [month,setMonth]=useState(now.getMonth()+1);
 const [report,setReport]=useState(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
 const endpoint=kind==="tailor"?"/tailor/dashboard/monthly-report":"/delivery/dashboard/monthly-report";
 async function load(e){if(e)e.preventDefault();setError("");setLoading(true);try{const response=await api.get(endpoint,{params:{year,month}});setReport(response.data?.data??response.data);}catch(e){setError(getErrorMessage(e));}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 return <div className="max-w-3xl space-y-5"><div><h1 className="page-title">Monthly activity report</h1><p className="muted mt-2">Choose a month to review your activity summary.</p></div><form onSubmit={load} className="panel flex flex-wrap items-end gap-3 p-5"><div><label className="field-label">Year</label><input className="field w-32" type="number" min="2020" max="2100" value={year} onChange={e=>setYear(e.target.value)}/></div><div><label className="field-label">Month</label><select className="field w-44" value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleString("en",{month:"long"})}</option>)}</select></div><button className="btn-primary" disabled={loading}>{loading?"Loading…":"Generate report"}</button></form>{error&&<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{report&&<div className="panel grid gap-4 p-6 sm:grid-cols-2">{Object.entries(report).filter(([,v])=>typeof v!=="object").map(([key,value])=><div className="rounded-xl bg-stone-50 p-4" key={key}><p className="text-xs capitalize text-stone-500">{key.replace(/[A-Z]/g,m=>" "+m)}</p><p className="mt-2 text-2xl font-bold text-plum-900">{String(value)}</p></div>)}</div>}</div>;
}
