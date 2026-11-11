# Empresia native ERP — Odoo and Dolibarr reference implementation

Reviewed 2026-11-11, continuing branch `feat/erp-native-postgres-20261111` and PR #198.
No production deployment, hosted migration, customer payment, fiscal issuance or
Family Power data mutation is authorized or performed in this work.

## Source/version/license verification

Odoo was cloned from **https://github.com/odoo/odoo.git**, single branch `20.0`,
depth one, blob filtered and sparse, at **24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e**.
Checkout is `/workspace/odoo-reference`, outside Empresia's repository.
`odoo/release.py` declares `version_info=(20,0,0,FINAL,0,'')`, Production/Stable and
LGPL-3. Python minimum 3.12 and PostgreSQL minimum 16 are *upstream requirements*,
not new Empresia requirements. No Odoo dependency was installed or executed.

Additional Dolibarr reference: **https://github.com/Dolibarr/dolibarr.git**,
branch `24.0`, commit **f8eda351f716da7d0852be3d15e0a00fba582b31**, version **24.0.3**,
at `/workspace/dolibarr-reference`. The inspected stock/invoice classes are GPL-3.0-or-later.
No PHP, MariaDB, Dolibarr service or backend was installed.

Licenses, copyright notices and future incorporation requirements are preserved in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and unmodified files in
`docs/third-party/`. No application source from either project is vendored here.
The selected Odoo module manifests all explicitly declare LGPL-3; bundled assets,
other add-ons, Enterprise code and dependencies must not inherit that assumption.

## Repository structure and reviewed modules

Odoo's `odoo/` contains its Python ORM/server and infrastructure. `addons/` contains
module manifests, Python models, wizards, XML views/reports, CSV ACLs, security
rules and web assets. `stock` depends on product/barcode infrastructure;
`purchase_stock` and `sale_stock` link the commercial documents to stock/accounting.
Their models cannot be dropped into Next.js without the ORM, environment and
module graph. Empresia maps those responsibilities to SQL transactions, RLS and
React components using the existing Supabase Auth session.

| Area | Reviewed upstream behavior | Existing Empresia baseline | Native changes / remaining scope |
| --- | --- | --- | --- |
| Inventory | Quant availability is physical minus reserved; assignment is distinct from completion, with company/location checks | Atomic item/location balances, general reservations, transfers and immutable movements | Added order-owned reservations, protected reservation floor, immutable allocated order lines/product mapping, atomic full shipment; lots/serials/FEFO/backorders remain unimplemented |
| Purchasing | Separate PO, receipts, returns and supplier billing; receipts linked to stock moves | Native approved PO, idempotent receipt/return, proportional return rounding and AP | Creation now locks items in the same UUID order as receipts/fulfillment; further receiving UI and three-way matching remain pending |
| Sales | Accepted quotation/order, warehouse assignment and delivery linked by source document | Safe quote-to-order RPC with line snapshots; production/delivery screens | UI now uses the native conversion RPC, reserves/releases stock by order and confirms delivery through one transaction |
| Invoicing | Posted documents, payment registration and residual balances are distinct | Immutable commercial invoices, partial payment RPC and AR view; old UI still wrote payments directly | Replaced direct payment/amount_paid writes with checked RPC; added invoice issuance, human-confirmed referenced partial payment, exact decimal strings, same-key retry and native PDF |
| Accounting | Balanced posted moves and explicit linked reversals | Deterministic BigInt helpers/workpapers and reversal drafts | Reference validated existing direction; persisted journal, posting/reversal authorization, bank reconciliation, reporting periods and fiscal localizations are not implemented by this change |

Exact Odoo source anchors (all at the pinned commit):

- [`stock_quant.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/stock/models/stock_quant.py): `_get_available_quantity`, `_update_reserved_quantity`.
- [`stock_move.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/stock/models/stock_move.py): `_action_assign`, `_action_done`, `_check_company` checks.
- [`purchase_order.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/purchase_stock/models/purchase_order.py): receipt/picking relations, `_compute_receipt_status`.
- [`sale_order.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/sale/models/sale_order.py): `_prepare_invoice`, `_create_invoices`.
- [`account_move.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/account/models/account_move.py): `_check_balanced`, `_post`, `_reverse_moves`.
- [`account_payment_register.py`](https://github.com/odoo/odoo/blob/24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e/addons/account/wizard/account_payment_register.py): `action_create_payments`, company-bound journal selection.

Dolibarr source anchors:

- [`mouvementstock.class.php`](https://github.com/Dolibarr/dolibarr/blob/f8eda351f716da7d0852be3d15e0a00fba582b31/htdocs/product/stock/class/mouvementstock.class.php): `_create`, `reception`, `livraison`; explicit stock document references and movement history.
- [`facture.class.php`](https://github.com/Dolibarr/dolibarr/blob/f8eda351f716da7d0852be3d15e0a00fba582b31/htdocs/compta/facture/class/facture.class.php): `validate`, `setPaid`; distinct document/payment states. Empresia retains its stricter evidence requirement and calculates paid balance from payment rows instead of exposing a forced-paid action.

## Reusable code evaluation

Odoo's selected LGPL-3 modules are candidates for incorporation *only after*
file/dependency review and preservation of relevant obligations. The ORM business
classes, Owl components, QWeb reports, XML ACLs and wizards are tightly coupled to
Odoo. `odoo/tools/float_utils.py` is a reference for rounding semantics, but its
binary-float implementation was not imported or translated: Empresia keeps NUMERIC
and decimal strings/BigInt. Dolibarr stock/invoice classes and PHP report modules
are similarly coupled and carry GPL obligations; they were not copied.

**Application source fragments directly reused: none.** Functional ideas were
independently implemented in native SQL/TypeScript and existing Empresia modules
were reused. This avoids pretending that a complete Odoo module works outside
its ORM, or that a source translation removes licensing obligations.

## Transaction and compatibility details

New migration: `20261111052948_erp_native_order_fulfillment.sql` adds
`order_inventory_allocations`, `order_inventory_requests`, protected writes and
`erp_order_inventory_command(tenant,order,action,key,warehouse)`.

- Authorizes current membership, role and active tenant; excludes machine actors.
- Locks order, products in UUID order, items in UUID order, then locations.
- A reserve action allocates all mapped stock lines or rolls back the entire order.
- A release action releases only that order's quantities, retaining history.
- A ship action requires ready status plus completed, design-approved production
  and passed quality control. Consumption, delivery, order state, idempotency and
  audit all commit together. Full-order delivery only in this version.
- Generic stock release/consume cannot reduce reserved quantities below active
  order allocations. Changing allocated lines, mapping, tracking policy or
  deactivating reserved items is rejected.
- A stock product must map to exactly one inventory item. Migration's unique index
  intentionally fails rather than silently choosing/rewriting duplicate mappings.
- Explicit service products use manager-maintained `products.metadata.erp_stock_policy='service'`;
  unmapped free-text/physical products cannot silently bypass stock checks.
- Prior pending purchasing migration has a small UUID-lock ordering correction.
  Do not silently edit an already-applied hosted migration; compare migration
  history and issue a forward function replacement if one was applied externally.
- Supplier/PO/receipt/return commands now also write explicit audit entries;
  retries do not duplicate them. Trusted machine-actor claims are rejected before
  any purchase approval or mutation, including supplier-only commands.
- Existing payment consumer in `crm-operations.tsx` now uses commercial RPCs;
  it no longer inserts `customer_payments` or updates `orders.amount_paid` directly.
  Historical paid orders still require reconciliation before commercial invoicing.
- Commercial money is requested from PostgREST as text, sent as decimal strings
  and validated without floating-point balance calculations. Invoice PDF uses the
  persisted tenant-bound snapshot, not an editable UI quotation or invented data.

Rollback before first use: `supabase/rollback/20261111052948_erp_native_order_fulfillment.sql`.
After any allocation/request exists it refuses destructive rollback. Retain ledger
and use a reviewed forward correction after use. Undo this migration before the
older inventory rollback because it references inventory/location tables.

## Verification and activation boundary

Validation performed for the native changes:

- **57/57** selected unit/contract regressions passed, including real PDF byte/xref
  checks, pagination, tenant matching, exact high-value decimal amounts and partial
  payment bounds. Existing brand/Family Power contracts continue to pass.
- **13/13** PostgreSQL harness tests passed, covering four SQL suites, real races
  for inventory withdrawals, duplicate requests, two competing orders, concurrent
  delivery confirmations, delivery retries, reverse-input purchase creation versus
  a receipt holding the first item, and pre-use/protected fulfillment rollback.
- `npm run typecheck` passed and `npm run build` generated the existing 34 pages.
- `node tests/erp-native-commercial-browser.test.mjs` passed on a local production
  build: invoice creation, referenced human confirmation, decimal partial payment,
  same-key retry after a simulated 503, PDF download, reservation/delivery RPCs,
  390px mobile layout and tenant switching. Every Supabase call is intercepted;
  fake identities/payments verify UI behavior, not real bank collections.
- License/copyright copies were compared byte-for-byte with their pinned clones.
- The existing ERP CI workflow now covers native changes, PostgreSQL and the browser
  test. Remote checks must be evaluated against the final pushed SHA; local success
  is not a claim that the remote CI or production deployment has finished.

Initial validation errors were corrected without loosening API permissions:
the browser fixture's exact select-label locator did not match the generated
accessible label; its selector was corrected. A purchasing race fixture initially
attempted a direct authenticated row lock, correctly rejected by revoked UPDATE
permissions; the fixture now pauses under the test database owner and then invokes
the authorized RPC, without granting extra application privileges.

Tests use synthetic fixtures and a disposable local PostgreSQL 17 container. The
reference clones are not running applications and are not included in Empresia's
build or production dependencies. Final commits are recorded in PR #198 and the
execution's final response.

No production migrations are applied. Before activation: inspect live schema and
triggers, resolve duplicate product mappings without altering customer data during
tests, inventory external API consumers, verify grants/RLS and test the exact
release against a disposable schema reflecting the relevant production triggers.
Do not assert the public portal runs this code until a separately authorized,
tested deployment and authenticated verification have occurred.

Remaining ERP scope is material: purchasing UI, persistent accounting/finance,
partial shipments/backorders, lots/serials, stock valuation, fiscal certification,
DGII XSD/signature/connectivity and live AI authorization are not completed by
cloning a Community source repository. No fiscal credentials or services were used.
