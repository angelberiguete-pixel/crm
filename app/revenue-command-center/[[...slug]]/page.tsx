import SalesHub from "@/components/sales-hub";

export default async function RevenuePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const mapped = slug.map((value) => value === "prospects" ? "prospectos" : value);
  return <SalesHub slug={mapped} />;
}
