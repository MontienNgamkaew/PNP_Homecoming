#!/usr/bin/env bash
# Scheduled private DB backup. Data stays on Hostinger; never upload it to Actions artifacts.
set -euo pipefail
: "${HOSTINGER_SSH_HOST:?Set HOSTINGER_SSH_HOST}"
: "${HOSTINGER_SSH_USER:?Set HOSTINGER_SSH_USER}"
: "${HOSTINGER_SSH_PORT:?Set HOSTINGER_SSH_PORT}"
: "${HOSTINGER_DOMAIN_DIR:?Set HOSTINGER_DOMAIN_DIR}"
: "${HOSTINGER_SSH_PRIVATE_KEY:?Set HOSTINGER_SSH_PRIVATE_KEY}"
: "${HOSTINGER_SSH_KNOWN_HOSTS:?Set verified HOSTINGER_SSH_KNOWN_HOSTS}"
[[ "$HOSTINGER_SSH_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || exit 2
[[ "$HOSTINGER_SSH_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$HOSTINGER_SSH_PORT" =~ ^[0-9]{1,5}$ ]] || exit 2
((10#$HOSTINGER_SSH_PORT >= 1 && 10#$HOSTINGER_SSH_PORT <= 65535)) || exit 2
[[ "$HOSTINGER_DOMAIN_DIR" =~ ^/home/[a-zA-Z0-9_-]+/domains/[a-zA-Z0-9.-]+$ ]] || exit 2
run_id="${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "$run_id" =~ ^[0-9]+-[0-9]+$ ]] || exit 2
umask 077
ssh_dir="${RUNNER_TEMP:?}/pnp-backup-ssh"
mkdir -p "$ssh_dir"
printf '%s\n' "$HOSTINGER_SSH_PRIVATE_KEY" > "$ssh_dir/key"
printf '%s\n' "$HOSTINGER_SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
trap 'rm -f "$ssh_dir/key" "$ssh_dir/known_hosts"' EXIT
ssh -i "$ssh_dir/key" -p "$HOSTINGER_SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=20 "$HOSTINGER_SSH_USER@$HOSTINGER_SSH_HOST" bash -s -- "$HOSTINGER_DOMAIN_DIR" "$run_id" <<'REMOTE'
set -euo pipefail
umask 077
root="$1"
run_id="$2"
dir="$root/.database-backups"
mkdir -p "$dir"
chmod 700 "$dir"
exec 9>"$dir/.backup.lock"
flock -w 120 9
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$dir/backup-$stamp-$run_id.json"
partial="$dir/.pending-$stamp-$run_id.json"
test ! -e "$target"
test ! -e "$partial"
trap 'rm -f "$partial"' EXIT
php "$root/portal-private/backup.php" "$partial"
# Validate all current tables before publishing the backup filename.
php -r '
$d=json_decode(file_get_contents($argv[1]),true,512,JSON_THROW_ON_ERROR);
$tables=["app_settings","reference_counter","orders","table_bookings","order_items","order_audit","settings_audit","blessings","posters","ticket_redemptions","tax_requests","tax_request_audit"];
if(($d["format"]??"")!=="portal-backup-v1"||array_diff($tables,array_keys($d["tables"]??[])))throw new RuntimeException("Incomplete backup");
if(!isset($d["tables"]["app_settings"][0],$d["tables"]["reference_counter"][0]))throw new RuntimeException("Missing settings/counter");
echo "Validated 12 backup tables including tax data.\n";
' "$partial"
mv "$partial" "$target"
chmod 600 "$target"
php -r '
$p=$argv[1];$s=["created_utc"=>gmdate("c"),"file"=>basename($p),"sha256"=>hash_file("sha256",$p),"bytes"=>filesize($p),"table_count"=>12];
file_put_contents($p.".sha256",$s["sha256"]."  ".basename($p)."\n");
file_put_contents(dirname($p)."/.latest-success.tmp",json_encode($s,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n");
rename(dirname($p)."/.latest-success.tmp",dirname($p)."/latest-success.json");
echo "Private backup complete; ".$s["bytes"]." bytes; SHA256 ".$s["sha256"]."\n";
' "$target"
# Historical backups are retained. This job does not remove any existing backups.
REMOTE
