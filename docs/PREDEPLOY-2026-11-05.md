# Pre-deploy review — 5 November 2026

Historical pre-migration assessment. The PHP implementation and local release verification are now recorded in HOSTINGER-RELEASE-2026-11-05.md. Host-specific staging checks remain required.

Decision: NOT READY for public production on the user's Hostinger Web / Business / Cloud plan. This is a source/test review, not a live Hostinger account or domain audit. No deployment performed; no production data changed.

## Verified locally
- Python standard-library HTTP backend + SQLite; frontend static HTML/JS + built Tailwind/daisyUI CSS.
- All 12 automated tests passed using disposable databases: submission/access, pricing, concurrent booking, transactional table restoration, private ticket status, shirt sizes/delivery, settings persistence/validation, poster upload limits/delete/restart, six-digit references.
- CSS build and JavaScript syntax checks passed for app, hero, posters, ticket and blessing modules.
- API authentication, same-origin POST checks, HttpOnly/SameSite cookies, private slip downloads, hashed tracking tokens and transaction-based table ownership exist.
- These checks do not establish production load capacity, browser/device coverage or restore readiness.

## Deployment blockers
1. Runtime mismatch: server.py requires a long-running Python process. Hostinger documents Python as VPS-only. Uploading prototype/ to public_html would omit all database/API functionality.
   Official source: https://www.hostinger.com/support/which-programming-languages-and-frameworks-are-supported-at-hostinger/
   For the user's existing plan, proposed target is PHP + MySQL/MariaDB, keeping the current frontend and API response contract. This is a migration requiring implementation and regression tests, not an upload setting.
2. Payment mode is explicitly demo: index banner and qr() retain demo/no-real-payment text even for uploaded QR. Need explicit live-mode setting and verified recipient/account/QR for each payment category before real payments.
3. Admin order editing requirements are incomplete: current API/UI support status changes, but no order-detail correction workflow for name, phone, shirt items, address or tables. Implement validated edits, audit and atomic repricing/table reassignment. Add recoverable cancellation rather than destroying financial history.
4. Dashboard totals derive from /api/admin/orders limited to 500 newest records. Beyond 500, overview becomes incomplete. Add database-wide aggregation and paginated search/list API. Legacy donations are separate and are not included in this dashboard.
5. Operational deployment configuration absent: no production environment template, deployment/rollback procedure, tested automated backup/restore, monitoring or documented retention process. Database contains slip/poster blobs; backups must cover both records and binary data. Do not upload local data/, tests, screenshots, node_modules or secret values as public files.
6. Proxy readiness: current limiter keys the socket address and ignores forwarded IP. Behind a reverse proxy, all visitors share limits (15 orders / 15 minutes). Resolve trusted proxy/client IP handling in target backend; never trust arbitrary forwarded headers.
7. Public security configuration: local development origins are always accepted; OPTIONS reflects arbitrary origins (actual responses restrict CORS). Production needs explicit canonical origin, HTTPS-only cookies, trusted hosts/proxies, consistent origin policy, request timeouts and request/body/concurrency limits. Current backend is a local ThreadingHTTPServer, bound to loopback, not a completed production hosting stack.

## Further release acceptance checks
- Inline JavaScript handlers remain, including a blessing message interpolated into an onclick argument. Replace data-containing inline handlers with event listeners; HTML escaping alone is not safe JavaScript-string encoding. Remove unsafe-inline script policy once handlers are migrated.
- Secure admin login/logout lifecycle on target HTTPS domain; current sessions are process-memory only and shared admin password. Backend has logout endpoint but frontend has no visible logout control.
- E-ticket download works; no server-side check-in/redemption state or duplicate-use prevention. Decide and implement entry/collection validation if tickets will be used as admission/collection credentials; a downloaded image may be stale after cancellation.
- Confirm actual shirt size measurements, event wording, contact details, final poster assets, table layout, payment destinations and delivery fees. Pending table reservations have no automatic expiry; define handling for abandoned/unverified bookings.
- Upload limits must allow base64 overhead: current file limit 5 MiB, JSON request near 7 MiB; configure target web/PHP request and memory limits accordingly. QR currently 1 MiB per category.
- Test restore to a separate database, migration record counts/status/amounts, representative Unicode text, mobile booking and PNG download, invalid/expired authentication, duplicate slips, simultaneous reservations and correction conflict handling on staging.
- Determine expected peak traffic and test accordingly. Current 12 tests are functional regressions, not a load test.

## Recommended next work for current hosting plan
Preserve current Python version as reference. Build compatible PHP API and SQL schema/migration with persistent sessions, per-client rate limits, safe private uploads, full totals/pagination and audited order edits; keep existing visual assets/frontend routes. Then stage under HTTPS, verify acceptance checks and backup/restore before enabling real payment mode. Confirm exact plan capabilities and database/PHP settings in hPanel before implementation deployment configuration is finalized.
