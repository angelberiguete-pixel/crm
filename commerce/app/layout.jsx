import "./globals.css";
export const metadata={
 title:"Ángel Berigüete Commerce | Ideas grandes, precios pequeños",
 description:"Recursos digitales y servicios accesibles para Latinoamérica. Currículums desde US$4.90, plantillas, contenido, páginas web y más.",
 applicationName:"Ángel Berigüete Commerce",
 metadataBase:new URL("https://angel-commerce.vercel.app"),
 openGraph:{
  title:"Ángel Berigüete Commerce — digital para todos",
  description:"Soluciones digitales prácticas a precios pensados para Latinoamérica. Explora servicios, recursos y cursos.",
  locale:"es_419",type:"website",siteName:"Ángel Berigüete Commerce"
 },
 twitter:{card:"summary_large_image"},
 robots:{index:true,follow:true}
};
export default function RootLayout({children}){return <html lang="es"><body>{children}</body></html>;}
