#!/usr/bin/env bash
# ==============================================================================
# JARVIS EC2 Instance Setup Script
# Run ON the EC2 instance (as root via sudo)
# ==============================================================================
set -euo pipefail

echo "=== JARVIS EC2 Setup ==="
echo "Running as: $(whoami)"
date

# ── Ensure Docker is running ─────────────────────────────────────────────────
echo "[1/7] Ensuring Docker is installed and running..."
if ! command -v docker &>/dev/null; then
    dnf install -y docker
fi
systemctl enable docker
systemctl start docker

# Install Docker Compose if not present
if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    echo "Installing Docker Compose..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
fi

# Add ec2-user to docker group
usermod -aG docker ec2-user || true

# ── Install nginx ────────────────────────────────────────────────────────────
echo "[2/7] Setting up nginx..."
if ! command -v nginx &>/dev/null; then
    dnf install -y nginx
fi
systemctl enable nginx

# Create SSL directory for certbot (will be populated later)
mkdir -p /etc/nginx/ssl
mkdir -p /var/www/certbot

# Generate self-signed cert for initial HTTPS (replaced by certbot later)
if [[ ! -f /etc/nginx/ssl/selfsigned.crt ]]; then
    echo "Generating self-signed certificate for initial setup..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/selfsigned.key \
        -out /etc/nginx/ssl/selfsigned.crt \
        -subj "/C=US/ST=State/L=City/O=JARVIS/CN=localhost"
fi

# Remove default config
rm -f /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/sites-enabled/default

# Test and start nginx
nginx -t && systemctl restart nginx

# ── Install certbot ──────────────────────────────────────────────────────────
echo "[3/7] Installing certbot for SSL..."
if ! command -v certbot &>/dev/null; then
    dnf install -y certbot python3-certbot-nginx
fi

# Set up auto-renewal cron
cat > /etc/cron.d/certbot-renew <<'CRON'
# Renew Let's Encrypt certificates twice daily
0 0,12 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
CRON

# ── Configure firewall ───────────────────────────────────────────────────────
echo "[4/7] Configuring firewall..."

# Use iptables rules (Amazon Linux 2023 compatible)
# Flush existing rules
iptables -F INPUT 2>/dev/null || true

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH (port 22)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP and HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow Docker bridge traffic
iptables -A INPUT -i docker0 -j ACCEPT

# Block direct access to app port (must go through nginx)
iptables -A INPUT -p tcp --dport 3000 -j DROP

# Save iptables rules
if command -v iptables-save &>/dev/null; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
fi

# ── Automatic security updates ───────────────────────────────────────────────
echo "[5/7] Configuring automatic security updates..."
if ! rpm -q dnf-automatic &>/dev/null; then
    dnf install -y dnf-automatic
fi

cat > /etc/dnf/automatic.conf <<'DNFAUTO'
[commands]
upgrade_type = security
random_sleep = 0
download_updates = yes
apply_updates = yes

[emitters]
system_name = jarvis-ec2
emit_via = stdio

[email]
email_from = root@localhost
email_to = root
email_host = localhost

[command]
[command_email]
[base]
debuglevel = 1
DNFAUTO

systemctl enable --now dnf-automatic-install.timer

# ── App directory structure ──────────────────────────────────────────────────
echo "[6/7] Setting up app directory structure..."
mkdir -p /opt/jarvis/logs
mkdir -p /opt/jarvis/backups
mkdir -p /opt/jarvis/uploads
chown -R ec2-user:ec2-user /opt/jarvis

# ── Log rotation ─────────────────────────────────────────────────────────────
echo "[7/7] Configuring log rotation..."

cat > /etc/logrotate.d/jarvis <<'LOGROTATE'
/opt/jarvis/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 ec2-user ec2-user
    sharedscripts
    postrotate
        docker compose -f /opt/jarvis/docker-compose.yml restart app 2>/dev/null || true
    endscript
}
LOGROTATE

# Docker log rotation
cat > /etc/docker/daemon.json <<'DOCKERLOG'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    }
}
DOCKERLOG

# Restart Docker to apply log settings
systemctl restart docker

# ── Create backup script ─────────────────────────────────────────────────────
cat > /opt/jarvis/backup.sh <<'BACKUP'
#!/usr/bin/env bash
# JARVIS Database Backup Script
set -euo pipefail

BACKUP_DIR="/opt/jarvis/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/jarvis_db_${DATE}.sql.gz"

# Load env vars
set -a
source /opt/jarvis/.env
set +a

# Dump database via docker
docker compose -f /opt/jarvis/docker-compose.yml exec -T db \
    mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
    | gzip > "$BACKUP_FILE"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "jarvis_db_*.sql.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
BACKUP
chmod +x /opt/jarvis/backup.sh
chown ec2-user:ec2-user /opt/jarvis/backup.sh

# Set up daily backup cron
cat > /etc/cron.d/jarvis-backup <<'CRON'
# Daily database backup at 2 AM
0 2 * * * ec2-user /opt/jarvis/backup.sh >> /opt/jarvis/logs/backup.log 2>&1
CRON

echo ""
echo "=== EC2 Setup Complete ==="
echo "Docker:    $(docker --version)"
echo "Compose:   $(docker compose version 2>/dev/null || docker-compose --version 2>/dev/null)"
echo "Nginx:     $(nginx -v 2>&1)"
echo "Certbot:   $(certbot --version 2>&1 || echo 'not installed')"
date
