import CrmWorkspace from "@/components/crm-workspace";
import CrmSales360 from "@/components/crm-sales-360";
import CrmCustomers from "@/components/crm-customers";
import CrmCommercialDashboard from "@/components/crm-commercial-dashboard";
import OmnichannelInbox from "@/components/omnichannel-inbox";
import CrmChannelSetup from "@/components/crm-channel-setup";
import DigitalEmployeeStudio from "@/components/digital-employee-studio";
import CrmIntegrationCenter from "@/components/crm-integration-center";
import CrmMarketingPerformance from "@/components/crm-marketing-performance";
import TenantPermissionGate from "@/components/tenant-permission-gate";

export default async function CrmPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const section = slug[0] ?? "";
  return (
    <TenantPermissionGate section={section}>
      {section === ""
        ? <CrmCommercialDashboard />
        : section === "sales" || section === "revenue"
        ? <CrmSales360 />
        : section === "companies" || section === "contacts"
          ? <CrmCustomers kind={section} />
          : section === "inbox"
            ? <OmnichannelInbox />
            : section === "channels"
              ? <CrmChannelSetup />
            : section === "integrations"
              ? <CrmIntegrationCenter />
            : section === "marketing"
              ? <CrmMarketingPerformance />
            : section === "employees"
              ? <DigitalEmployeeStudio />
            : <CrmWorkspace slug={slug} />}
    </TenantPermissionGate>
  );
}
