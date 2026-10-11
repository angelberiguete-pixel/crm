import TenantPermissionGate from "@/components/tenant-permission-gate";
import SalesHub from "@/components/sales-hub";

export default async function SalesPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <TenantPermissionGate section="sales"><SalesHub slug={slug} /></TenantPermissionGate>;
}
