-- Catálogo Ángel Berigüete Commerce (LATAM). Todas las ofertas permanecen borradores.
-- Ejecutar en Supabase exclusivo de Commerce; nunca en la base del CRM.
-- Productos publicados conservan sus precios y descripciones hasta revisión individual.
insert into public.commerce_products(slug,name,description,category,price_cents,currency,published,delivery_note) values
('cv-profesional','CV Express','Currículum profesional de una página, adaptado a tu información y listo para postular.','servicio',490,'USD',false,'PDF + archivo editable · 1 ajuste'),
('impulso-laboral','Impulso Laboral','Mejoramos tu presentación laboral y te orientamos para postular mejor. No garantizamos entrevistas ni contratación.','servicio',2490,'USD',false,'CV + carta + guía de búsqueda · 1 revisión'),
('limpieza-excel','Excel en Orden','Limpieza y organización de hasta 1,000 filas de un archivo Excel.','servicio',900,'USD',false,'1 archivo · hasta 1,000 filas'),
('catalogo-comercial','Catálogo Digital','Presenta hasta 15 productos con diseño limpio en un catálogo PDF fácil de compartir.','servicio',1490,'USD',false,'PDF digital · hasta 15 productos'),
('investigacion-competencia','Radar de Competencia','Resumen de cómo comunican hasta 10 competidores y oportunidades para tu negocio.','servicio',1900,'USD',false,'Informe breve · hasta 10 negocios'),
('configuracion-paypal','Prepara tu PayPal','Te orientamos para configurar enlaces de cobro en tu propia cuenta PayPal, sujeto a disponibilidad del país.','servicio',1900,'USD',false,'1 cuenta · guía personalizada'),
('video-publicitario','Video Corto para Redes','Edición de un video breve con material aportado por ti para presentar una oferta.','servicio',1500,'USD',false,'Hasta 20 segundos · 1 revisión'),
('anuncios-estacionales','Mini Pack Promocional','Tres piezas gráficas para una misma promoción o campaña en redes sociales.','servicio',1200,'USD',false,'3 diseños · 1 campaña'),
('edicion-reels','5 Reels Editados','Editamos cinco clips verticales a partir del material que nos compartas.','servicio',3900,'USD',false,'5 clips · hasta 25 segundos cada uno'),
('landing-page','Tu Primera Landing','Página web de una sola sección larga con información del negocio y formulario de contacto.','servicio',5900,'USD',false,'1 página · formulario simple'),
('catalogo-ecommerce','Catálogo para Tienda','Organización y carga inicial de hasta 20 productos con imágenes y textos aportados por ti.','servicio',7900,'USD',false,'Hasta 20 productos · carga inicial'),
('automatizacion-formularios','Automatización Inicial','Un flujo básico que registra formularios y envía un aviso a tu equipo.','servicio',6900,'USD',false,'1 flujo · 1 integración'),
('contenido-mensual','Contenido Mensual','Ocho piezas gráficas mensuales bajo acuerdo de servicio. El cobro recurrente aún no está habilitado.','membresia',4900,'USD',false,'8 piezas al mes · coordinación manual'),
('plantilla-presupuesto','Plantilla de Gastos','Plantilla editable para anotar ingresos, gastos y organizar tu presupuesto.','digital',290,'USD',false,'Archivo editable · pendiente de publicar'),
('kit-whatsapp','Kit de Mensajes WhatsApp','Guiones editables para responder consultas, confirmar pedidos y hacer seguimiento.','digital',390,'USD',false,'Respuestas editables · pendiente de publicar'),
('ideas-contenido','Ideas para tus Redes','Banco de 50 ideas de publicaciones para emprendedores y marcas personales.','digital',390,'USD',false,'50 ideas · pendiente de publicar'),
('curso-ventas','Ventas Digitales desde Cero','Mini curso introductorio sobre ofertas, contenido y primeros pasos comerciales.','curso',990,'USD',false,'Lecciones en preparación')
on conflict (slug) do update set
 name=excluded.name,
 description=excluded.description,
 category=excluded.category,
 price_cents=excluded.price_cents,
 delivery_note=excluded.delivery_note
 where commerce_products.published=false;

-- No habilitar automáticamente membresías, cursos o bienes físicos.
update public.commerce_products set published=false where category in ('curso','fisico','membresia');
