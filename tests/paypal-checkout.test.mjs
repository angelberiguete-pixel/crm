import {test} from "node:test";
import assert from "node:assert/strict";
import {
  buildSandboxOrderPayload,formatPayPalUsdCents,parsePayPalUsdCents,
  loadPaypalSandboxCredentials,createPaypalSandboxOrder,verifyPaypalSandboxWebhook,
  evaluatePaypalCapture,PAYPAL_SANDBOX_API
} from "../lib/paypal-checkout.ts";

const invoice={id:"123e4567-e89b-42d3-a456-426614174000",
  tenant_id:"123e4567-e89b-42d3-a456-426614174001",status:"open",currency:"USD",
  amount_due_cents:12345,total_cents:12345};
const cfg={clientId:"testClient",clientSecret:"sandboxOnly",webhookId:"WH-ABCDEF",
  merchantId:"PAYEEMERCHANT0001"};
const approval="https://www.sandbox.paypal.com/checkoutnow?token=ABCD12345678";
const returnUrl="https://crm.example.com/paypal/return";
const cancelUrl="https://crm.example.com/paypal/cancel";

test("denies unconfigured sandbox and never accepts live credentials",()=>{
  assert.throws(()=>loadPaypalSandboxCredentials({}),/sandbox_not_enabled/);
  assert.throws(()=>loadPaypalSandboxCredentials({PAYPAL_MODE:"live",
    PAYPAL_ARM_SANDBOX_ENABLED:"true"}),/sandbox_not_enabled/);
  assert.throws(()=>loadPaypalSandboxCredentials({PAYPAL_MODE:"sandbox",
    PAYPAL_ARM_SANDBOX_ENABLED:"true"}),/config_incomplete/);
  assert.deepEqual(loadPaypalSandboxCredentials({PAYPAL_MODE:"sandbox",
    PAYPAL_ARM_SANDBOX_ENABLED:"true",PAYPAL_SANDBOX_CLIENT_ID:cfg.clientId,
    PAYPAL_SANDBOX_CLIENT_SECRET:cfg.clientSecret,
    PAYPAL_SANDBOX_MERCHANT_ID:cfg.merchantId,
    PAYPAL_SANDBOX_WEBHOOK_ID:cfg.webhookId}),cfg);
});
test("invoice amounts and supported currency must be strictly server authoritative",()=>{
  assert.equal(formatPayPalUsdCents(12345),"123.45");
  assert.equal(parsePayPalUsdCents("123.45"),12345);
  for(const amount of [0,-100,0.1,Number.MAX_SAFE_INTEGER,NaN])
    assert.throws(()=>formatPayPalUsdCents(amount));
  for(const value of ["1e3","12.1","012.00","-2.00","Infinity",null,0])
    assert.throws(()=>parsePayPalUsdCents(value));
  assert.equal(buildSandboxOrderPayload(invoice,returnUrl,cancelUrl).purchase_units[0].amount.value,"123.45");
  assert.throws(()=>buildSandboxOrderPayload({...invoice,currency:"DOP"},returnUrl,cancelUrl),/currency_unsupported/);
  assert.throws(()=>buildSandboxOrderPayload({...invoice,status:"paid"},returnUrl,cancelUrl),/not_eligible/);
  assert.throws(()=>buildSandboxOrderPayload(invoice,"http://localhost:3000/return",cancelUrl),/invalid_redirect/);
  assert.throws(()=>buildSandboxOrderPayload(invoice,"https://user:pass@example.com/return",cancelUrl),/invalid_redirect/);
});
test("PayPal create order uses sandbox only, valid URL and deterministic idempotency",async()=>{
  let calls=0;
  const fetcher=async(url,init)=>{
    calls++;
    assert.equal(url,PAYPAL_SANDBOX_API+"/v2/checkout/orders");
    assert.equal(init.headers["PayPal-Request-Id"],invoice.id);
    const body=JSON.parse(init.body);
    assert.equal(body.purchase_units[0].custom_id,invoice.id);
    assert.equal(body.purchase_units[0].amount.value,"123.45");
    return new Response(JSON.stringify({id:"5O190127TN364715T",status:"PAYER_ACTION_REQUIRED",
      links:[{rel:"payer-action",href:approval}]}),{status:201});
  };
  const result=await createPaypalSandboxOrder({invoice,returnUrl,cancelUrl,token:"sandbox-token",fetcher});
  assert.deepEqual(result,{orderId:"5O190127TN364715T",
    approvalUrl:approval,providerStatus:"PAYER_ACTION_REQUIRED"});
  assert.equal(calls,1);
  await assert.rejects(()=>createPaypalSandboxOrder({invoice,returnUrl,cancelUrl,
    token:"a",fetcher:async()=>new Response(JSON.stringify({id:"5O190127TN364715T",
      links:[{rel:"payer-action",href:"https://attacker.example.com/steal"}]}),{status:201})}),/invalid_approval_url/);
});
test("verified sandbox webhook must pass PayPal postback, not just JSON shape",async()=>{
  const event={id:"WH-EVENT123",event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:"CAPTURE123"}};
  const h=new Headers({
    "paypal-transmission-id":"BROADCAST123",
    "paypal-transmission-time":new Date().toISOString(),
    "paypal-transmission-sig":"testbase64",
    "paypal-auth-algo":"SHA256withRSA",
    "paypal-cert-url":"https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1234"
  });
  let requests=0;
  const testFetch=async(url,init)=>{
    requests++;
    assert.equal(url,PAYPAL_SANDBOX_API+"/v1/notifications/verify-webhook-signature");
    const payload=JSON.parse(init.body);
    assert.equal(payload.webhook_id,cfg.webhookId);
    assert.equal(payload.webhook_event.id,event.id);
    return new Response(JSON.stringify({verification_status:"SUCCESS"}),{status:200});
  };
  const result=await verifyPaypalSandboxWebhook({rawBody:JSON.stringify(event),
    headers:h,config:cfg,token:"sandbox-token",fetcher:testFetch});
  assert.equal(result.id,event.id);
  assert.equal(requests,1);
  await assert.rejects(()=>verifyPaypalSandboxWebhook({rawBody:JSON.stringify(event),
    headers:h,config:cfg,token:"sandbox-token",
    fetcher:async()=>new Response(JSON.stringify({verification_status:"FAILURE"}),{status:200})}),/not_verified/);
  h.delete("paypal-transmission-sig");
  await assert.rejects(()=>verifyPaypalSandboxWebhook({rawBody:JSON.stringify(event),
    headers:h,config:cfg,token:"sandbox-token",fetcher:testFetch}),/missing_webhook_signature/);
});
test("a verified capture must still match order, payee, invoice amount and exact USD",()=>{
  const event={id:"WH-EVENT456",event_type:"PAYMENT.CAPTURE.COMPLETED",
    resource:{id:"CAPTURE123",status:"COMPLETED",amount:{value:"123.45",currency_code:"USD"},
      payee:{merchant_id:cfg.merchantId},
      supplementary_data:{related_ids:{order_id:"5O190127TN364715T"}}}};
  const opts={event,expectedOrderId:"5O190127TN364715T",
    expectedInvoice:invoice,expectedMerchantId:cfg.merchantId};
  assert.deepEqual(evaluatePaypalCapture(opts),{accepted:true,
    reason:"verified_capture_requires_idempotent_ledger_commit",
    captureId:"CAPTURE123",eventId:"WH-EVENT456"});
  assert.equal(evaluatePaypalCapture({...opts,expectedOrderId:"OTHER12345678"}).reason,"order_mismatch");
  assert.equal(evaluatePaypalCapture({...opts,expectedMerchantId:"OTHER"}).reason,"merchant_mismatch");
  assert.equal(evaluatePaypalCapture({...opts,expectedInvoice:{...invoice,amount_due_cents:12445}}).reason,"amount_mismatch");
  assert.equal(evaluatePaypalCapture({...opts,event:{...event,resource:{...event.resource,status:"PENDING"}}}).reason,"capture_not_completed");
});
