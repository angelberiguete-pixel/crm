import CrmWorkspace from "@/components/crm-workspace";
import CrmSales360 from "@/components/crm-sales-360";
import OmnichannelInbox from "@/components/omnichannel-inbox";
import TenantPermissionGate from "@/components/tenant-permission-gate";

export default async function CrmPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const section = slug[0] ?? "";
  return (
    <TenantPermissionGate section={section}>
      {section === "sales" ? <CrmSales360 /> : section === "inbox" ? <OmnichannelInbox /> : <CrmWorkspace slug={slug} />}
    </TenantPermissionGate>
  );
}
