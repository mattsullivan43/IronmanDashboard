#!/bin/bash
set -e

echo "=== JARVIS AWS Deployment ==="

# Clone the repo
cd /home/ec2-user
if [ -d "IronmanDashboard" ]; then rm -rf IronmanDashboard; fi
git clone https://github.com/mattsullivan43/IronmanDashboard.git
cd IronmanDashboard

# Create .env
cat > .env << 'ENVEOF'
MYSQL_HOST=db
MYSQL_PORT=3306
MYSQL_USER=jarvis
MYSQL_PASSWORD=JARVIS_MYSQL_SECRET_2026
MYSQL_DATABASE=jarvis

AUTH_MODE=cognito
JWT_SECRET=JWTPLACEHOLDER
AUTH_USERNAME=sullivan
AUTH_PASSWORD=cornerstone2024

COGNITO_USER_POOL_ID=us-east-1_d5tEb2cmW
COGNITO_APP_CLIENT_ID=5m0qp295q6heas42oq38l1dpo3
COGNITO_REGION=us-east-1

DEEPSEEK_API_KEY=sk-1e82e9f130d7474bb2b2820f34387505
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_PROVIDER=deepseek
JARVIS_DAILY_REQUEST_LIMIT=50

PORT=3000
NODE_ENV=production
FRONTEND_URL=http://54.84.209.149:3000
ENVEOF

# Generate real JWT secret
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s/JWTPLACEHOLDER/$JWT_SECRET/" .env

# Install docker-compose plugin if not present
docker compose version || (mkdir -p /usr/local/lib/docker/cli-plugins && curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) -o /usr/local/lib/docker/cli-plugins/docker-compose && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose)

# Build and start
docker compose up -d --build 2>&1

# Wait for startup
echo "Waiting for services..."
sleep 15

# Check health
docker compose ps
curl -sf http://localhost:3000/api/health && echo "" && echo "=== JARVIS IS ONLINE ===" || echo "=== HEALTH CHECK PENDING ==="
