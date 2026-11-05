# Hostinger release — 5 November 2026

Historical initial migration report. For current implementation and verification, see [PREDEPLOY-LATEST.md](PREDEPLOY-LATEST.md).

Status: PHP/MySQL release prepared and verified locally. NOT deployed to Hostinger, not approved for real payment operation yet. No production credentials were supplied. The existing SQLite database and Python server were not migrated or replaced.

## Changes
- Added PHP 8.2+ PDO MySQL API with the same frontend route/response contracts. InnoDB transactional booking, authoritative pricing, six-digit references, private slip/ticket access, image/file limits, optimistic settings revisions, hero typography and poster CRUD retained.
- Added persistent hashed admin sessions, logout, exact configured-origin POST policy and per-client rate limits using the web server's REMOTE_ADDR. Hostinger must provide the actual client address; untrusted forwarded headers are never accepted.
- Admin order name/phone/items/delivery/address/table corrections require a reason and retain an audit record. Cancellation retains the order and returns tables. Old price snapshots are preserved; older records without snapshots preserve their amount for contact corrections and require explicit current-price selection before changing quantities/delivery.
- Dashboard totals aggregate the entire database; list supports 100-row pagination and search by reference/name/phone. Old legacy donations are included after migration.
- Added one-time ticket redemption for confirmed dinner bookings and pickup shirts. Staff searches the reference and records redemption; repeat use is rejected. This consumes the entire order, not individual seats/shirts or partial fulfillment. No camera scanner is included.
- Explicit demo/live payment setting defaults to demo. Admin can enable live only after uploading all four real QR images. This is not bank transaction verification; staff must check actual bank records.
- Removed blessing text interpolation into JavaScript inline handler arguments. Remaining inline handlers are static actions; CSP still allows inline scripts for compatibility and can be tightened in a separate frontend refactor.
- Original frontend layout/assets retained. Added admin controls and limited form styles only. Python reference remains available.

## Evidence
- Original Python suite: 12/12 tests passed after frontend integration.
- PHP + real disposable MySQL 9.6: 10/10 integration tests passed, including 4 simultaneous bookings, rollback, pricing, tickets, redemption, images, auth/origin/rate limits, legacy pricing corrections, SQLite migration, backup/restore and packaged API execution.
- 501 additional fixture orders verified totals beyond 500 and pagination/search. Persistent admin session verified across a separate PHP process.
- Restore to a separate empty database matched order counts, total amounts and image SHA-256; restoring onto a populated database was refused. Legacy migration retained original reference, amount, status, slip and tracking hash.
- CSS build passed; PHP source and changed JS syntax checks passed.
- Browser QA using PHP: home assets loaded; no broken images or horizontal overflow at desktop and 390px mobile. Shirt reservation with dummy PDF, blessing modal, actual PNG download, admin name correction passed.
- Screenshots: prototype/hostinger-home-desktop.png, prototype/hostinger-home-mobile.png, prototype/hostinger-admin-preview.png. Fake data only.
- Package test checks frontend bytes, manifest SHA-256, ZIP integrity, exclusions and API private-library path from extracted release.

## Still required on Hostinger
- Configure a dedicated database/user, private config.php, admin password hash, canonical HTTPS origin, SSL/Force HTTPS, PHP extensions, permissions and PHP body/memory limits.
- Validate .htaccess/API rewrites on actual Hostinger LiteSpeed; local PHP CLI preview uses a development router and does not test Hostinger rewrite handling.
- Test on the configured PHP/MySQL or MariaDB versions. Local integration used PHP 8.5/MySQL 9.6; source targets PHP 8.2+ and portable InnoDB SQL, but a separate PHP 8.2/MariaDB matrix was not run.
- Choose new empty data or migrate actual SQLite with the provided read-only exporter; verify counts and balances before switching. Migration was tested only with synthetic fixtures; actual data remains untouched.
- Configure automated offsite backups/retention and restore on staging. JSON helper tools load substantial data in memory; for large slip databases use complete hPanel/phpMyAdmin or MySQL backups with appropriate resources.
- Confirm QR recipients, final wording/assets, expected traffic and handling of pending reservations (no automatic expiry). No peak-load claim is made from functional tests.
- Verify HTTPS login, private file protection, real mobile browsers/downloads and staging submissions before enabling live payment mode.
