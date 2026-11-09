import { redirect } from "next/navigation";

export const metadata = {
  title: "Empresia",
  description: "Configura una vista previa de tu CRM y seguimiento comercial antes de activar integraciones o servicios."
};

export default function LookSocialMediaStartPage() {
  redirect("/empresia/start");
}
