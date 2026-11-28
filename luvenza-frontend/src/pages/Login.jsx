import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { loginSchema } from "../schemas/authSchema";
import { getErrorMessage } from "../services/api";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({email:"",password:""});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  if (isAuthenticated) return <Navigate to="/app" replace />;

  function update(event) { setForm({...form,[event.target.name]:event.target.value}); setErrors({...errors,[event.target.name]:""}); }
  async function submit(event) {
    event.preventDefault(); setMessage("");
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      const next = {};
      parsed.error.issues.forEach(issue => { next[issue.path[0]] = issue.message; });
      setErrors(next); return;
    }
    try {
      setLoading(true);
      const user = await login(parsed.data);
      navigate(user.role === "admin" ? "/app" : "/app", {replace:true});
    } catch (error) { setMessage(getErrorMessage(error)); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen bg-[#f8f3f1] lg:grid lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-plum-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-28 h-[520px] w-[520px] rounded-full border border-white/10"/>
      <div className="absolute -bottom-48 -left-24 h-[520px] w-[520px] rounded-full bg-plum-700/30 blur-2xl"/>
      <div className="relative"><span className="font-display text-3xl tracking-[.25em]">LUVENZA</span><p className="mt-2 text-xs uppercase tracking-[.28em] text-plum-200">Personalized fashion platform</p></div>
      <div className="relative max-w-xl">
        <p className="mb-5 flex items-center gap-2 text-sm text-plum-200"><Sparkles size={16}/> Your style, your measurements, your story</p>
        <h1 className="font-display text-6xl leading-[1.08]">Design. Customize.<br/>Try. Wear.</h1>
        <p className="mt-6 max-w-md text-base leading-7 text-plum-100">Create a look that feels like you. Explore designs, personalize every detail and follow your outfit from first sketch to final delivery.</p>
        <div className="mt-10 flex gap-3 text-xs text-plum-100"><span className="rounded-full border border-white/20 px-4 py-2">Made to measure</span><span className="rounded-full border border-white/20 px-4 py-2">3D try-on ready</span><span className="rounded-full border border-white/20 px-4 py-2">Tailored for you</span></div>
      </div>
      <p className="relative text-xs text-plum-300">© {new Date().getFullYear()} Luvenza Studio</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center lg:hidden"><span className="font-display text-3xl tracking-[.2em] text-plum-800">LUVENZA</span></div>
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.22em] text-plum-600">Welcome back</p><h2 className="mt-2 font-display text-4xl text-plum-950">Sign in to your world.</h2><p className="mt-3 text-sm text-stone-500">Access your personalized StyleFit workspace.</p></div>
        <form onSubmit={submit} className="panel space-y-5 p-6 sm:p-8">
          {message && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</div>}
          <div><label className="field-label" htmlFor="email">Email address</label><div className="relative"><Mail className="absolute left-3 top-3 text-stone-400" size={17}/><input id="email" className="field pl-10" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update}/></div>{errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email}</p>}</div>
          <div><label className="field-label" htmlFor="password">Password</label><div className="relative"><LockKeyhole className="absolute left-3 top-3 text-stone-400" size={17}/><input id="password" className="field pl-10 pr-11" name="password" type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={update}/><button type="button" className="absolute right-3 top-3 text-stone-400" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>{errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password}</p>}</div>
          <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2 text-stone-500"><input type="checkbox" className="accent-plum-700"/> Remember me</label><span className="text-plum-700">Forgot password?</span></div>
          <button disabled={loading} className="btn-primary w-full rounded-xl py-3">{loading?"Signing in…":"Sign in"} <span>→</span></button>
          <p className="text-center text-xs text-stone-500">New to Luvenza? <Link className="font-semibold text-plum-700" to="/register">Create an account</Link></p>
        </form>
        <p className="mt-5 text-center text-[11px] text-stone-400">Secure role-based access for customers, designers, tailors and delivery partners.</p>
      </div>
    </section>
  </div>;
}
