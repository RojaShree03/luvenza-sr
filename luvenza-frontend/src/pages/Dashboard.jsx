import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api, { getErrorMessage } from "../services/api";
import StatCard from "../components/StatCard";
import { Activity, Package, Users, Wallet, Scissors, Truck, ShoppingBag, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const config = {
  customer:{title:"Your style dashboard",endpoint:"/users/dashboard/overview",stats:[["Your orders","totalOrders",ShoppingBag],["Saved designs","savedDesigns",Scissors],["Measurements","measurements",Activity]],links:[["Explore the shop","/app/shop"],["Create a customization","/app/customizations"],["Manage measurements","/app/measurements"]]},
  admin:{title:"Studio overview",endpoint:"/admin/dashboard/overview",stats:[["Total orders","totalOrders",Package],["Revenue","totalSales",Wallet],["Customers","totalCustomers",Users],["Active tailors","activeTailors",Scissors]],links:[["Manage orders","/app/admin/orders"],["Review customizations","/app/admin/customizations"],["Manage collections","/app/admin/collections"]]},
  tailor:{title:"Tailor workspace",endpoint:"/tailor/dashboard/overview",stats:[["Assigned orders","totalAssignedOrders",Package],["Pending orders","pendingOrders",Activity],["Active orders","activeOrders",Scissors],["Completed orders","completedOrders",ArrowUpRight]],links:[["View assigned orders","/app/tailor/orders"],["Update profile","/app/tailor/profile"]]},
  deliver_partner:{title:"Delivery workspace",endpoint:"/delivery/dashboard/overview",stats:[["Assigned deliveries","totalAssigned",Package],["Pending","pending",Activity],["Out for delivery","outForDelivery",Truck],["Delivered","delivered",ArrowUpRight]],links:[["View deliveries","/app/delivery/orders"],["Update profile","/app/delivery/profile"]]}
};

export default function Dashboard(){
  const {user}=useAuth();const role=user?.role;const data=config[role]||config.customer;
  const [stats,setStats]=useState({});const [error,setError]=useState("");
  useEffect(()=>{let active=true;(async()=>{try{const res=await api.get(data.endpoint);const body=res.data?.data||res.data;if(active)setStats(body?.overview||body||{});}catch(e){if(active)setError(getErrorMessage(e));}})();return()=>{active=false};},[data.endpoint]);
  const displayName=user?.username||user?.name||user?.email?.split("@")[0]||"there";
  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-plum-600">Welcome back, {displayName}</p><h1 className="page-title mt-2">{data.title}</h1><p className="muted mt-2">Here is what is happening in your Luvenza workspace.</p></div><span className="rounded-full bg-plum-100 px-4 py-2 text-xs font-semibold capitalize text-plum-800">{role?.replace("_"," ")}</span></div>
    {error&&<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Dashboard summary could not be loaded: {error}. Your module links are still available.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.stats.map(([label,key,Icon],i)=><StatCard key={label} title={label} value={stats[key]??"—"} note={role==="admin"&&key==="totalSales"?"From dashboard API":undefined} icon={Icon}/>)}</div>
    <div className="panel p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-2xl text-plum-900">Quick actions</h2><p className="muted mt-1">Continue where you left off.</p></div><Activity className="text-plum-500"/></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.links.map(([label,path])=><Link key={path} to={path} className="flex items-center justify-between rounded-xl border border-stone-200 p-4 text-sm font-semibold text-plum-800 transition hover:border-plum-300 hover:bg-plum-50">{label}<ArrowUpRight size={17}/></Link>)}</div></div>
    <div className="rounded-2xl bg-gradient-to-r from-plum-900 to-plum-700 p-6 text-white sm:p-8"><p className="text-xs uppercase tracking-[.2em] text-plum-200">Luvenza studio</p><h2 className="mt-2 font-display text-3xl">Thoughtfully designed. Made to fit.</h2><p className="mt-2 max-w-xl text-sm text-plum-100">Every role has a dedicated workspace. Your available actions are determined by your account permissions.</p></div>
  </div>;
}
