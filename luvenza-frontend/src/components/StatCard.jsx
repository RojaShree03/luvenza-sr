export default function StatCard({ title, value, note, icon: Icon }) {
  return <div className="panel p-5">
    <div className="flex items-center justify-between">
      <p className="text-sm text-stone-500">{title}</p>
      {Icon && <span className="rounded-xl bg-plum-50 p-2 text-plum-700"><Icon size={18}/></span>}
    </div>
    <p className="mt-3 text-2xl font-bold text-plum-900">{value ?? "—"}</p>
    {note && <p className="mt-1 text-xs text-stone-400">{note}</p>}
  </div>;
}
