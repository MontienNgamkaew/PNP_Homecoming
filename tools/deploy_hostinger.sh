#!/usr/bin/env bash
# Used only by the manually dispatched GitHub deployment workflow.
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
[[ "$HOSTINGER_DOMAIN_DIR" =~ ^/home/[a-zA-Z0-9_-]+/domains/[a-zA-Z0-9.-]+$ ]] || { echo 'Use the dedicated domain parent directory, not public_html'; exit 2; }
stage="${RUNNER_TEMP:?}/pnp-hostinger-stage"
python3 tools/prepare_hostinger_tree.py "$stage"
umask 077
ssh_dir="$RUNNER_TEMP/pnp-ssh"
mkdir -p "$ssh_dir"
printf '%s\n' "$HOSTINGER_SSH_PRIVATE_KEY" > "$ssh_dir/key"
printf '%s\n' "$HOSTINGER_SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
trap 'rm -f "$ssh_dir/key" "$ssh_dir/known_hosts"' EXIT
remote="$HOSTINGER_SSH_USER@$HOSTINGER_SSH_HOST"
ssh_opts=(-i "$ssh_dir/key" -p "$HOSTINGER_SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=20)
# Preflight first. Do not initialize, migrate or alter production database from CI.
ssh "${ssh_opts[@]}" "$remote" bash -s -- "$HOSTINGER_DOMAIN_DIR" <<'REMOTE'
set -euo pipefail
root="$1"
test -d "$root/public_html"
test -f "$root/portal-private/config.php" || { echo 'Create private config.php and install the database on the host first'; exit 1; }
command -v php >/dev/null
command -v rsync >/dev/null
php -r 'exit(version_compare(PHP_VERSION,"8.2.0",">=")?0:1);'
umask 077
backup="$root/.deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
tar -czf "$backup/code-before-deploy.tar.gz" -C "$root" public_html portal-private
REMOTE
rsync_ssh="ssh -i $ssh_dir/key -p $HOSTINGER_SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$ssh_dir/known_hosts"
# Deliberately no --delete: host config, uploads and unrelated existing files are preserved.
rsync -az --delay-updates -e "$rsync_ssh" "$stage/portal-private/" "$remote:$HOSTINGER_DOMAIN_DIR/portal-private/"
rsync -az --delay-updates -e "$rsync_ssh" "$stage/public_html/" "$remote:$HOSTINGER_DOMAIN_DIR/public_html/"
ssh "${ssh_opts[@]}" "$remote" php "$HOSTINGER_DOMAIN_DIR/portal-private/check.php"
echo 'Source deployed; review website, SSL, API and bank settings before opening to visitors.'
