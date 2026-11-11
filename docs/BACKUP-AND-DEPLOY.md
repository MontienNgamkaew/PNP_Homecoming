# Production backup and deployment

Website: https://pnp2.montien.tech

## Daily database backup

`.github/workflows/backup-hostinger.yml` runs at **20:00 UTC / 03:00 Asia/Bangkok** each day, with a manual **Run workflow** option. GitHub may delay a scheduled run; check the Actions result and latest success record rather than assuming the schedule ran.

The workflow uses the existing `hostinger-production` SSH secrets. It runs `tools/backup_hostinger.sh`, which calls the deployed private `backup.php` on Hostinger. Database contents remain on the host and are not uploaded to GitHub or Actions artifacts.

Backups are stored outside `public_html` in:

`/home/u651170081/domains/pnp2.montien.tech/.database-backups/`

The directory is mode 700; backup and checksum files are mode 600. Each run has a separate UTC timestamp and Actions run ID. A lock prevents overlapping backups. A new backup becomes final only after JSON validation confirms all 12 required tables, including `tax_requests` and `tax_request_audit`. `latest-success.json` records the last successful filename, SHA-256, byte count and UTC time; it contains no donor records. Failed or incomplete backups do not replace this record. Existing backup files are retained.

The backup includes settings and account/QR details, orders and slips, booked tables, shirt items, order/settings audit history, blessings, posters, ticket redemptions and tax requests/history. Administrator sessions and transient rate-limit records are deliberately not restored. The host's private `config.php` credentials are not included in the JSON database backup.

Verify a backup's checksum before restoring. Use `restore.php` only with a **new empty database** and private configuration pointing to that new database. Never point a restore verification at production. Local restore checks can compare every table's restored contents to the original backup without printing personal data.

## Single deployment path

On 11 November 2026, hPanel automatic Git deployment for **pnp2.montien.tech** was disabled through that site's dashboard. Deploy code using the manually triggered **Deploy to Hostinger** GitHub Actions workflow on `main`.

Do not re-enable hPanel AutoDeploy or use hPanel's **Redeploy** button for this site: its raw Git checkout does not match this application's separate public/private deployment layout. The existing Git checkout remains in place; source/config access is blocked by the deployed `.htaccess`.

The database backup workflow does not deploy website files or change financial records. For backup status, inspect **Daily private database backup** in GitHub Actions. For code publication, inspect **Deploy to Hostinger**. Both use the protected existing production environment.
