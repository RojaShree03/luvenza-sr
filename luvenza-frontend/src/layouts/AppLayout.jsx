import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, X, LogOut, Bell, UserCircle, LayoutDashboard, ShoppingBag, Users, Shirt, Ruler, Truck, Layers, Palette, ClipboardList, Settings, Heart, Activity } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const roleMenus = {
  customer: [
    ["Dashboard","/app",LayoutDashboard],["Shop","/app/shop",ShoppingBag],["My Customizations","/app/customizations",Palette],["Measurements","/app/measurements",Ruler],["My Orders","/app/orders",ClipboardList],["My Profile","/app/profile",UserCircle]
  ],
  admin: [
    ["Dashboard","/app",LayoutDashboard],["Orders","/app/admin/orders",ClipboardList],["Customers","/app/admin/customers",Users],["Tailors","/app/admin/tailors",Users],["Delivery Partners","/app/admin/delivery-partners",Truck],["Collections","/app/admin/collections",Layers],["Design Components","/app/admin/design-components",Palette],["Templates","/app/admin/templates",Shirt],["Customizations","/app/admin/customizations",ClipboardList]
  ],
  tailor: [
    ["Dashboard","/app",LayoutDashboard],["Assigned Orders","/app/tailor/orders",ClipboardList],["My Profile","/app/tailor/profile",UserCircle],["Availability","/app/tailor/availability",Settings],["Reports","/app/tailor/reports",Activity]
  ],
  deliver_partner: [
    ["Dashboard","/app",LayoutDashboard],["My Deliveries","/app/delivery/orders",Truck],["My Profile","/app/delivery/profile",UserCircle],["Availability","/app/delivery/availability",Settings],["Reports","/app/delivery/reports",Activity]
  ]
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menu = roleMenus[user?.role] || [];
  function signOut() { logout(); navigate("/login"); }

  return <div className="min-h-screen bg-[#faf7f5]">
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-plum-900 px-4 py-5 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="mb-8 flex items-center justify-between px-2">
        <span className="font-display text-2xl tracking-[.2em]">LUVENZA</span>
        <button className="lg:hidden" onClick={() => setOpen(false)}><X/></button>
      </div>
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-plum-200">Workspace · {user?.role?.replace("_"," ")}</p>
      <nav className="space-y-1">
        {menu.map(([label,path,Icon]) => <NavLink key={path} to={path} end={path === "/app"} onClick={() => setOpen(false)}
          className={({isActive}) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${isActive ? "bg-white/15 text-white" : "text-plum-100 hover:bg-white/10"}`}>
          <Icon size={17}/>{label}
        </NavLink>)}
      </nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="truncate text-sm font-semibold">{user?.username || user?.name || user?.email}</p>
        <p className="mt-1 text-xs capitalize text-plum-200">{user?.role?.replace("_"," ")}</p>
        <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-plum-100 hover:text-white"><LogOut size={14}/> Sign out</button>
      </div>
    </aside>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)}/>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200/80 bg-white/90 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <button className="text-plum-800 lg:hidden" onClick={() => setOpen(true)}><Menu/></button>
          <span className="font-display text-lg tracking-[.18em] text-plum-800 lg:hidden">LUVENZA</span>
          <span className="hidden text-sm text-stone-500 lg:block">Personalized fashion, thoughtfully made.</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative text-stone-500" title="Notifications"><Bell size={19}/><i className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-plum-600"/></button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-plum-100 text-plum-800"><UserCircle size={20}/></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-4 md:p-8"><Outlet/></main>
    </div>
  </div>;
}
