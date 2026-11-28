import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";

export default function Register() {
  const [form,setForm]=useState({name:"",email:"",password:"",phone:""});
  const [message,setMessage]=useState(""); const [loading,setLoading]=useState(false); const navigate=useNavigate();
  function change(e){setForm({...form,[e.target.name]:e.target.value});}
  async function submit(e){e.preventDefault();setMessage("");if(form.password.length<8||!/[A-Z]/.test(form.password)||!/[a-z]/.test(form.password)||!/[0-9]/.test(form.password)||!/[^A-Za-z0-9]/.test(form.password)){setMessage("Password must be at least 8 characters and include uppercase, lowercase, number, and special characters.");return;}
    try{setLoading(true);await api.post("/auth/register",{...form,role:"customer"});setMessage("Account created. Please sign in.");setTimeout(()=>navigate("/login"),900);}
    catch(error){const validationMessages=error.response?.data?.errors?.map(item=>item.message).filter(Boolean);setMessage(validationMessages?.length?validationMessages.join(". "):getErrorMessage(error));}finally{setLoading(false);}}
  return <div className="flex min-h-screen items-center justify-center bg-[#faf7f5] p-5"><div className="panel w-full max-w-lg p-7 sm:p-9">
    <Link to="/login" className="font-display text-2xl tracking-[.2em] text-plum-800">LUVENZA</Link><p className="mt-7 text-xs font-bold uppercase tracking-widest text-plum-600">Join the studio</p><h1 className="page-title mt-2">Create your account</h1><p className="muted mt-2">Customer registration is open. Staff accounts are created and approved by the admin.</p>
    {message&&<p className="mt-4 rounded-xl bg-plum-50 p-3 text-sm text-plum-800">{message}</p>}
    <form onSubmit={submit} className="mt-6 space-y-4">
      {[["name","Full name","text"],["email","Email address","email"],["phone","Phone number","tel"],["password","Password","password"]].map(([name,label,type])=><div key={name}><label className="field-label">{label}</label><input className="field" required name={name} type={type} value={form[name]} onChange={change}/>{name==="password"&&<p className="mt-1 text-xs text-stone-500">At least 8 characters, including uppercase, lowercase, a number, and a special character.</p>}</div>)}
      <button disabled={loading} className="btn-primary w-full rounded-xl">{loading?"Creating…":"Create customer account"}</button>
    </form><p className="mt-5 text-center text-sm text-stone-500">Already registered? <Link to="/login" className="font-semibold text-plum-700">Sign in</Link></p>
  </div></div>;
}
