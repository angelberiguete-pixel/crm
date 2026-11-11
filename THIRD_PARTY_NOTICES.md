# ERP reference sources

Empresia remains a native Next.js/TypeScript/PostgreSQL application. The following
Community projects were inspected as external references. No Odoo or Dolibarr
application source, translations, images, fonts, Python/PHP runtime, ORM or database
backend was incorporated into this repository by this work. The checked-in copies
are their unmodified copyright/license notices, reproduced below by reference.
New native business rules and PDF generation are independently implemented.

## Odoo Community

- Official repository: https://github.com/odoo/odoo
- Branch: `20.0`; reviewed commit: `24f007f4f8a2dbdab05c1b4aecf48bd4e9c4251e`.
- Release metadata: `20.0`, `FINAL`, `Production/Stable`, `LGPL-3`.
- Main copyright notice: most files Copyright (c) 2004–2015 Odoo S.A.; third-party
  contributions have their own notices or attribution in version history.
- Reviewed manifests for `stock`, `purchase`, `purchase_stock`, `sale`, `sale_stock`,
  `account`, `stock_account` explicitly declare `LGPL-3`. This is not a blanket
  declaration for all bundled libraries/assets or any Enterprise source.
- Exact upstream notices: [LICENSE](docs/third-party/odoo-20.0-LICENSE.txt) and
  [COPYRIGHT](docs/third-party/odoo-20.0-COPYRIGHT.txt).

## Dolibarr

- Official repository: https://github.com/Dolibarr/dolibarr
- Branch: `24.0`; reviewed commit: `f8eda351f716da7d0852be3d15e0a00fba582b31`.
- Version metadata: `24.0.3` in `htdocs/version.inc.php`.
- Reviewed stock and invoice classes state GNU GPL version 3 or later, including
  the individual author notices in each file. Bundled components require their
  own file-level/dependency license review.
- Exact upstream notices: [COPYING](docs/third-party/dolibarr-24.0-COPYING.txt) and
  [COPYRIGHT](docs/third-party/dolibarr-24.0-COPYRIGHT.txt).

## Reuse boundary

Source copying or translation has not been used for the native implementations.
Before incorporating any future source fragment or component, record its upstream
commit/path, actual file/dependency license, copyright and modifications. Preserve
required notices, supply corresponding source and satisfy linking/distribution
conditions where required by LGPL/GPL. Do not assume a Python-to-TypeScript or
PHP-to-TypeScript translation removes those obligations. Do not copy Enterprise
code, unknown-license assets or third-party bundles under a Community label.

Functional comparison, exact source symbols and implemented changes are recorded
in [the reference report](docs/erp/odoo-community-reference-2026-11-11.md).
