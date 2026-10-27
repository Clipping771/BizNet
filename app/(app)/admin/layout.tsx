import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20">
      <AdminNav />
      {children}
    </div>
  );
}
