import CrmWorkspace from "@/components/crm-workspace";
import TenantPermissionGate from "@/components/tenant-permission-gate";

export default async function CrmPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const section = slug[0] ?? "";
  return <TenantPermissionGate section={section}><CrmWorkspace slug={slug} /></TenantPermissionGate>;
}
