import CrmWorkspace from "@/components/crm-workspace";

export default async function CrmPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <CrmWorkspace slug={slug} />;
}
