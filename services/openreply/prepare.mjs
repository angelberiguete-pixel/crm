import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const kit = dirname(fileURLToPath(import.meta.url)), repo = resolve(kit, "../..");
const source = resolve(process.argv[2] ?? "");
const manifest = JSON.parse(readFileSync(join(kit, "upstream.json"), "utf8"));
if (source === repo || !process.argv[2]) throw Error("Pass an independent, clean OpenReply checkout.");
if (execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== manifest.commit) throw Error("Unexpected upstream revision; review before updating the pin.");
for (const [path, expected] of Object.entries(manifest.files)) {
  const bytes = readFileSync(join(source, path));
  const sha = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
  if (sha !== expected) throw Error("Upstream file changed: " + path);
}
const bridgeDir = join(source, "lib/crm-bridge");
if (existsSync(bridgeDir)) throw Error("Bridge already installed; use a clean checkout.");
mkdirSync(bridgeDir, { recursive: true });
cpSync(join(kit, "extension/bridge.ts"), join(bridgeDir, "bridge.ts"));
cpSync(join(repo, "lib/openreply-events.ts"), join(bridgeDir, "contract.ts"));
cpSync(join(kit, "extension/integration.test.ts"), join(bridgeDir, "integration.test.ts"));
writeFileSync(join(source, "prisma/schema.prisma"), readFileSync(join(source, "prisma/schema.prisma"), "utf8") + readFileSync(join(kit, "extension/models.prisma"), "utf8"));
const migrationDir = join(source, "prisma/migrations/20261105000000_crm_event_outbox");
mkdirSync(migrationDir, { recursive: true });
cpSync(join(kit, "extension/migration.sql"), join(migrationDir, "migration.sql"));
let worker = readFileSync(join(source, "worker/dm-worker.ts"), "utf8");
if (!worker.includes("const worker = createDMWorker();") || !worker.includes("  await worker.close();")) throw Error("Worker lifecycle changed.");
worker = 'import { startCrmBridge } from "@/lib/crm-bridge/bridge";\n' + worker
  .replace("const worker = createDMWorker();", "const stopCrmBridge = startCrmBridge();\nconst worker = createDMWorker();")
  .replace("  await worker.close();", "  await stopCrmBridge();\n  await worker.close();");
writeFileSync(join(source, "worker/dm-worker.ts"), worker);
writeFileSync(join(source, "CRM-UPSTREAM.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared pinned OpenReply with a durable, disabled-by-default CRM exporter.");
