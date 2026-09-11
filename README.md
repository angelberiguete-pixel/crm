# Revenue Command Center — RD$1M

Módulo ejecutivo sobre el CRM existente para gestionar el plan hacia RD$1,000,000 de MRR.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth/Postgres/RLS
- Recharts
- Vercel

## Inicio
1. Copia `.env.example` a `.env.local`.
2. Configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. `npm install`
4. `npm run dev`

El primer usuario crea su tenant desde onboarding. La app invoca `initialize_revenue_command_center` para crear el pipeline y sus etapas de forma idempotente.

## Seguridad
La aplicación usa únicamente la publishable key en cliente. El acceso a filas se controla por las políticas RLS del CRM. No existe service role en frontend.
