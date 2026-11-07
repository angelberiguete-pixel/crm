import { createClient } from "@supabase/supabase-js";
export const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
export function db() {
 if (!configured()) throw new Error("Database not configured");
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
}
export async function viewer(request) {
 const value=request.headers.get("authorization")||"";
 const token=value.startsWith("Bearer ") ? value.slice(7) : "";
 if (!token) throw Object.assign(new Error("Sign in required"),{status:401});
 const client=db();
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user) throw Object.assign(new Error("Invalid session"),{status:401});
 return user;
}
export async function isAdmin(userId) {
 const {data,error}=await db().from("commerce_roles").select("role").eq("user_id",userId).eq("role","admin").maybeSingle();
 if(error) throw error;
 return Boolean(data);
}
export function failure(error) {
 const status = error?.status || 500;
 return Response.json({error:status===500?"Server error":error.message}, {status});
}
export async function paypal(path,method="GET",body,requestId) {
 if(!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw Object.assign(new Error("PayPal is not configured"),{status:503});
 const base=process.env.PAYPAL_MODE==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";
 const basic=Buffer.from(process.env.PAYPAL_CLIENT_ID+":"+process.env.PAYPAL_CLIENT_SECRET).toString("base64");
 const tokenResponse=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{"Authorization":"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials",cache:"no-store"});
 if(!tokenResponse.ok) throw new Error("PayPal token request failed");
 const {access_token}=await tokenResponse.json();
 const headers={"Authorization":"Bearer "+access_token,"Content-Type":"application/json"};
 if(requestId)headers["PayPal-Request-Id"]=requestId;
 const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw Object.assign(new Error("PayPal returned "+response.status),{paypal:data,status:502});
 return data;
}
export function extractCapture(data) {
 return data.purchase_units?.flatMap(unit=>unit.payments?.captures||[])?.find(c=>c.status==="COMPLETED");
}
export async function fulfill(order,capture) {
 if(!capture || capture.status!=="COMPLETED") throw new Error("Payment is not completed");
 const amount=Number(capture.amount?.value);
 if(capture.amount?.currency_code!==order.currency || Math.round(amount*100)!==order.amount_cents) throw new Error("PayPal amount mismatch");
 const admin=db();
 const {data:current,error:loadError}=await admin.from("commerce_orders").select("status").eq("id",order.id).single();
 if(loadError)throw loadError;
 if(current.status==="refunded"||current.status==="cancelled")throw new Error("Order was revoked");
 const {error}=await admin.from("commerce_orders").update({status:"paid", capture_id:capture.id, updated_at:new Date().toISOString()}).eq("id",order.id).in("status",["pending","paid"]);
 if(error)throw error;
 const {data:product,error:productError}=await admin.from("commerce_products").select("category").eq("id",order.product_id).single();
 if(productError)throw productError;
 if(["digital","curso"].includes(product.category)){
 const result=await admin.from("commerce_entitlements").upsert({order_id:order.id,buyer_id:order.buyer_id,product_id:order.product_id,status:"active"},{onConflict:"order_id"});
 if(result.error)throw result.error;
 }
 return true;
}
