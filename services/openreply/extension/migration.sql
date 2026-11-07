CREATE TABLE "CrmBridgeOutbox" (
 "eventId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL,
 "instagramAccountId" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK("status" IN ('PENDING','PROCESSING','DELIVERED','DEAD')),
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK("attempts">=0),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT, "lockedUntil" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
 "lastErrorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CrmBridgeOutbox_status_nextAttemptAt_idx" ON "CrmBridgeOutbox"("status","nextAttemptAt");
CREATE INDEX "CrmBridgeOutbox_workspaceId_instagramAccountId_idx" ON "CrmBridgeOutbox"("workspaceId","instagramAccountId");
CREATE TABLE "CrmBridgeSourceReceipt" (
 "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("sourceType","sourceId")
);
