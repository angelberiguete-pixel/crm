-- Suggested offer catalog. All start as DRAFT until actual fulfilment is possible.
insert into public.commerce_products(slug,name,description,category,price_cents,currency,published,delivery_note) values
('cv-profesional','CV profesional + carta','Currículum moderno y carta personalizada para una vacante.','servicio',3900,'USD',false,'Entrega personalizada'),
('limpieza-excel','Limpieza de Excel y datos','Depuración y estructura de hasta 1000 filas.','servicio',5900,'USD',false,'Servicio por encargo'),
('catalogo-comercial','Catálogo comercial digital','Catálogo profesional de hasta 15 productos.','servicio',7900,'USD',false,'Servicio por encargo'),
('investigacion-competencia','Análisis de 10 competidores','Investigación estructurada y resumen ejecutivo.','servicio',8900,'USD',false,'Servicio por encargo'),
('configuracion-paypal','Configuración comercial PayPal','Cobros en la cuenta propia del negocio.','servicio',9900,'USD',false,'Servicio por encargo'),
('video-publicitario','Video publicitario','Video promocional con una ronda de ajustes.','servicio',9900,'USD',false,'Servicio por encargo'),
('anuncios-estacionales','Paquete de anuncios estacionales','Piezas creativas para redes.','servicio',14900,'USD',false,'Servicio por encargo'),
('edicion-reels','Edición de 5 videos cortos','Reels o Shorts en formato vertical.','servicio',14900,'USD',false,'Servicio por encargo'),
('landing-page','Landing page comercial','Página de captación con formulario.','servicio',19700,'USD',false,'Servicio por encargo'),
('catalogo-ecommerce','Catálogo para ecommerce','Organización y carga inicial de productos.','servicio',24900,'USD',false,'Servicio por encargo'),
('automatizacion-formularios','Automatización de formularios','Flujo de registros y aviso automático conectado.','servicio',29900,'USD',false,'Servicio por encargo'),
('contenido-mensual','Contenido mensual para negocios','Plan de contenido recurrente, requiere configuración de suscripciones.','membresia',29900,'USD',false,'Mensual')
on conflict(slug) do nothing;
