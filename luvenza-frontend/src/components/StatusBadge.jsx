export default function StatusBadge({ status = "pending" }) {
  const value = String(status).replaceAll("_", " ");
  const color = {
    delivered:"bg-emerald-50 text-emerald-700", completed:"bg-emerald-50 text-emerald-700",
    approved:"bg-emerald-50 text-emerald-700", customer_confirmed:"bg-emerald-50 text-emerald-700",
    rejected:"bg-rose-50 text-rose-700", cancelled:"bg-rose-50 text-rose-700",
    in_progress:"bg-blue-50 text-blue-700", tailoring:"bg-blue-50 text-blue-700",
    out_for_delivery:"bg-blue-50 text-blue-700", pending_review:"bg-amber-50 text-amber-700",
    delivery_assigned:"bg-amber-50 text-amber-700", tailor_assigned:"bg-amber-50 text-amber-700"
  }[status] || "bg-stone-100 text-stone-600";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${color}`}>{value}</span>;
}
