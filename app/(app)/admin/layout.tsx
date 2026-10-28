import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wide space-y-5">
      <AdminNav />
      {children}
    </div>
  );
}
