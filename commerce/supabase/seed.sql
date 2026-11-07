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

insert into public.commerce_products(slug,name,description,category,price_cents,currency,published,delivery_note) values
('plantilla-presupuesto','Plantilla de presupuesto empresarial','Plantilla original editable para gestionar finanzas de negocio.','digital',1900,'USD',false,'Entrega digital'),
('curso-ventas','Curso de ventas digitales para pymes','Programa privado con recursos y lecciones.','curso',4900,'USD',false,'Acceso a curso'),
('regalo-personalizado','Regalo personalizado por pedido','Producto físico bajo pedido y disponibilidad.','fisico',2900,'USD',false,'Entrega física')
on conflict(slug) do nothing;

-- Ajustes comerciales LATAM de noviembre de 2026 (no publicar automáticamente)
update public.commerce_products set name='CV que Impacta', description='CV de una página y carta breve para una vacante.', price_cents=1500 where slug='cv-profesional';
update public.commerce_products set name='Excel Sin Caos', description='Depuración y organización de hasta 1,000 filas en un archivo.', price_cents=1900 where slug='limpieza-excel';
update public.commerce_products set name='Catálogo que Vende', description='Catálogo profesional con hasta 15 productos.', price_cents=2500 where slug='catalogo-comercial';
update public.commerce_products set name='Radar de Competencia', description='Análisis de hasta 10 competidores y oportunidades.', price_cents=2900 where slug='investigacion-competencia';
update public.commerce_products set name='Activa tu Cobro Online', description='Preparación de cobros en la cuenta propia del negocio.', price_cents=3500 where slug='configuracion-paypal';
update public.commerce_products set name='Video que Atrapa Clientes', description='Video promocional de hasta 20 segundos con una revisión.', price_cents=3900 where slug='video-publicitario';
update public.commerce_products set name='Pack Promoción Explosiva', description='Cuatro piezas para una campaña estacional.', price_cents=4500 where slug='anuncios-estacionales';
update public.commerce_products set name='5 Reels que Venden', description='Cinco videos verticales de hasta 25 segundos cada uno.', price_cents=4900 where slug='edicion-reels';
update public.commerce_products set name='Página que Convierte', description='Landing page sencilla con formulario de contacto.', price_cents=7900 where slug='landing-page';
update public.commerce_products set name='Tienda Lista para Vender', description='Organización y carga de hasta 20 productos para ecommerce.', price_cents=8900 where slug='catalogo-ecommerce';
update public.commerce_products set name='Automatiza y Ahorra Tiempo', description='Un flujo de formulario y registro con avisos.', price_cents=9900 where slug='automatizacion-formularios';
update public.commerce_products set name='Contenido Magnético Mensual', description='Ocho piezas de contenido mensuales, requiere acuerdo de servicio.', price_cents=7900 where slug='contenido-mensual';
update public.commerce_products set published=false where category in ('curso','fisico','membresia');
