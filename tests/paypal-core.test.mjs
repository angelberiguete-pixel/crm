import test from "node:test";
import assert from "node:assert/strict";
import {
  minorToPayPalAmount,payPalAmountToMinor,isPayPalCurrency,extractPayPalCapture
} from "../lib/paypal-core.ts";

test("minor units never use floating point at checkout",()=>{
  assert.equal(minorToPayPalAmount(1),"0.01");
  assert.equal(minorToPayPalAmount(105),"1.05");
  assert.equal(minorToPayPalAmount(10000000),"100000.00");
  for(const invalid of [-1,0,1.2,Number.POSITIVE_INFINITY,10000001])
    assert.throws(()=>minorToPayPalAmount(invalid));
});

test("PayPal decimals require two exact fractional digits",()=>{
  assert.equal(payPalAmountToMinor("0.01"),1);
  assert.equal(payPalAmountToMinor("150.50"),15050);
  for(const invalid of ["1","1.1","1.000","-2.00","01.00","Infinity","100000.01","1e3"])
    assert.throws(()=>payPalAmountToMinor(invalid));
});

test("unsupported or unapproved currencies cannot be charged",()=>{
  assert.equal(isPayPalCurrency("USD"),true);
  assert.equal(isPayPalCurrency("EUR"),true);
  assert.equal(isPayPalCurrency("DOP"),false);
});

const event={
 id:"WH-TEST-12345",
 event_type:"PAYMENT.CAPTURE.COMPLETED",
 resource:{
   id:"CAPTURE123456",
   status:"COMPLETED",
   amount:{value:"89.90",currency_code:"USD"},
   payee:{merchant_id:"SELLER123"},
   supplementary_data:{related_ids:{order_id:"ORDER123456"}}
 }
};

test("completed capture requires matching typed status and order linkage",()=>{
  assert.deepEqual(extractPayPalCapture(event),{
    orderId:"ORDER123456",captureId:"CAPTURE123456",
    amountMinor:8990,currency:"USD",merchantId:"SELLER123",status:"COMPLETED"
  });
  assert.equal(extractPayPalCapture({...event,event_type:"PAYMENT.CAPTURE.PENDING"}),null);
  assert.equal(extractPayPalCapture({...event,resource:{...event.resource,amount:{value:"89.901",currency_code:"USD"}}}),null);
  assert.equal(extractPayPalCapture({...event,resource:{...event.resource,supplementary_data:{related_ids:{}}}}),null);
  assert.equal(extractPayPalCapture({...event,resource:{...event.resource,amount:{value:"89.90",currency_code:"DOP"}}}),null);
  assert.equal(extractPayPalCapture(null),null);
});
