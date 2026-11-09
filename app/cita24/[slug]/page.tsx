import Cita24PatientPortal from "@/components/cita24-patient-portal";
export default async function Cita24PublicPage({params}:{
 params:Promise<{slug:string}>
}){
 const {slug}=await params;
 return <Cita24PatientPortal slug={slug}/>;
}
