import test from "node:test";import assert from "node:assert/strict";
import {reviewOpenReplyDraft,providerEventApprovesQuote} from "../lib/commercial/openreply-quote-adapter.ts";
const q={id:"q",tenant_id:"a",contact_id:"c",status:"draft",metadata:{origin:"openreply",requires_human_review:true}};
test("CRM contact_id is preserved",()=>assert.equal(reviewOpenReplyDraft(q,"a").contactId,"c"));
test("cross tenant blocked",()=>assert.equal(reviewOpenReplyDraft(q,"b").reason,"wrong_tenant"));
test("unverified drafts blocked",()=>assert.equal(reviewOpenReplyDraft({...q,metadata:{}},"a").ok,false));
test("no customer consent inferred from provider",()=>assert.equal(providerEventApprovesQuote(),false));
