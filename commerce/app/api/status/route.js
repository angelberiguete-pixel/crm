export const dynamic="force-dynamic";
export async function GET(){
 const database=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);
 const paypal=Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET&&process.env.PAYPAL_WEBHOOK_ID);
 return Response.json({service:"angel-commerce",status:"online",storefront:"latam",buyersRequireAccounts:false,paymentsConfigured:database&&paypal,databaseConfigured:database,paypalMode:process.env.PAYPAL_MODE||"sandbox",recurringBilling:false,shipping:false},{headers:{"Cache-Control":"no-store"}});
}
