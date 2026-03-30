#!/usr/bin/env bash
# ==============================================================================
# JARVIS Business Command Center - AWS Deployment Script
# ==============================================================================
set -euo pipefail

# ── Color output ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[JARVIS]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }

# ── Default values ───────────────────────────────────────────────────────────
STACK_NAME="${1:-jarvis-prod}"
KEY_PAIR="${2:-}"
SSH_IP="${3:-}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
ADMIN_EMAIL="mjsullivan0910@gmail.com"
ADMIN_PASSWORD="Cadets2024!!"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: $0 <stack-name> <key-pair-name> <allowed-ssh-ip>

Arguments:
  stack-name       CloudFormation stack name (default: jarvis-prod)
  key-pair-name    Existing EC2 key pair name (required)
  allowed-ssh-ip   Your IP for SSH access in CIDR notation (e.g. 203.0.113.50/32)

Environment variables:
  AWS_DEFAULT_REGION   AWS region (default: us-east-1)
  INSTANCE_TYPE        EC2 instance type: t3.micro or t3.small (default: t3.small)

Example:
  $0 jarvis-prod my-key-pair 203.0.113.50/32
  INSTANCE_TYPE=t3.micro $0 jarvis-prod my-key-pair 203.0.113.50/32
EOF
    exit 1
}

# ── Validate prerequisites ───────────────────────────────────────────────────
check_prerequisites() {
    log "Checking prerequisites..."

    local missing=0

    if ! command -v aws &>/dev/null; then
        error "AWS CLI is not installed. Install from https://aws.amazon.com/cli/"
        missing=1
    fi

    if ! command -v jq &>/dev/null; then
        error "jq is not installed. Install with: brew install jq (macOS) or apt install jq (Ubuntu)"
        missing=1
    fi

    if ! command -v ssh &>/dev/null; then
        error "SSH client not found."
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        exit 1
    fi

    # Verify AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        error "AWS credentials not configured. Run: aws configure"
        exit 1
    fi

    local account_id
    account_id=$(aws sts get-caller-identity --query Account --output text)
    log "AWS Account: $account_id"
    log "Region: $REGION"
}

# ── Validate parameters ─────────────────────────────────────────────────────
validate_params() {
    if [[ -z "$KEY_PAIR" ]]; then
        error "Key pair name is required."
        echo ""
        echo "Available key pairs in $REGION:"
        aws ec2 describe-key-pairs --region "$REGION" --query 'KeyPairs[*].KeyName' --output text 2>/dev/null || echo "  (none found)"
        echo ""
        usage
    fi

    if [[ -z "$SSH_IP" ]]; then
        warn "No SSH IP specified. Attempting to detect your public IP..."
        SSH_IP="$(curl -s https://checkip.amazonaws.com)/32"
        if [[ -z "$SSH_IP" || "$SSH_IP" == "/32" ]]; then
            error "Could not detect public IP. Please provide it manually."
            usage
        fi
        log "Detected SSH IP: $SSH_IP"
    fi

    # Validate CIDR format
    if ! [[ "$SSH_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; then
        error "Invalid CIDR notation: $SSH_IP (expected format: 203.0.113.50/32)"
        exit 1
    fi

    # Verify key pair exists
    if ! aws ec2 describe-key-pairs --key-names "$KEY_PAIR" --region "$REGION" &>/dev/null; then
        error "Key pair '$KEY_PAIR' not found in region $REGION"
        echo "Available key pairs:"
        aws ec2 describe-key-pairs --region "$REGION" --query 'KeyPairs[*].KeyName' --output text
        exit 1
    fi
}

# ── Deploy CloudFormation ────────────────────────────────────────────────────
deploy_stack() {
    log "Deploying CloudFormation stack: $STACK_NAME"

    local stack_exists
    stack_exists=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null && echo "yes" || echo "no")

    local action="create-stack"
    local wait_action="stack-create-complete"
    if [[ "$stack_exists" == "yes" ]]; then
        warn "Stack '$STACK_NAME' already exists. Updating..."
        action="update-stack"
        wait_action="stack-update-complete"
    fi

    aws cloudformation "$action" \
        --stack-name "$STACK_NAME" \
        --template-body "file://${SCRIPT_DIR}/cloudformation.yml" \
        --parameters \
            ParameterKey=EnvironmentName,ParameterValue="$STACK_NAME" \
            ParameterKey=InstanceType,ParameterValue="$INSTANCE_TYPE" \
            ParameterKey=KeyPairName,ParameterValue="$KEY_PAIR" \
            ParameterKey=AllowedSSHIP,ParameterValue="$SSH_IP" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION" \
        --tags \
            Key=Project,Value=jarvis \
            Key=Environment,Value=production

    log "Waiting for stack $wait_action (this takes 3-5 minutes)..."
    if ! aws cloudformation wait "$wait_action" \
        --stack-name "$STACK_NAME" \
        --region "$REGION"; then
        error "Stack deployment failed!"
        aws cloudformation describe-stack-events \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
            --output table
        exit 1
    fi

    log "Stack deployed successfully!"
}

# ── Get stack outputs ────────────────────────────────────────────────────────
get_outputs() {
    log "Retrieving stack outputs..."

    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output json)

    EC2_IP=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="EC2PublicIP") | .OutputValue')
    USER_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="CognitoUserPoolId") | .OutputValue')
    APP_CLIENT_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="CognitoAppClientId") | .OutputValue')
    COGNITO_DOMAIN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="CognitoDomain") | .OutputValue')
    EC2_INSTANCE_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="EC2InstanceId") | .OutputValue')

    info "EC2 Public IP:       $EC2_IP"
    info "Cognito User Pool:   $USER_POOL_ID"
    info "Cognito Client ID:   $APP_CLIENT_ID"
    info "Cognito Domain:      $COGNITO_DOMAIN"
}

# ── Create Cognito admin user ────────────────────────────────────────────────
create_cognito_user() {
    log "Creating Cognito admin user: $ADMIN_EMAIL"

    # Check if user already exists
    if aws cognito-idp admin-get-user \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --region "$REGION" &>/dev/null; then
        warn "User $ADMIN_EMAIL already exists. Resetting password..."
    else
        aws cognito-idp admin-create-user \
            --user-pool-id "$USER_POOL_ID" \
            --username "$ADMIN_EMAIL" \
            --user-attributes \
                Name=email,Value="$ADMIN_EMAIL" \
                Name=email_verified,Value=true \
                Name=name,Value="Mr. Sullivan" \
            --message-action SUPPRESS \
            --region "$REGION"
        log "User created."
    fi

    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --password "$ADMIN_PASSWORD" \
        --permanent \
        --region "$REGION"

    log "Password set for $ADMIN_EMAIL"
}

# ── Wait for EC2 to be ready ────────────────────────────────────────────────
wait_for_ec2() {
    log "Waiting for EC2 instance to be reachable..."

    local max_attempts=30
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes \
            "ec2-user@${EC2_IP}" "echo ready" &>/dev/null; then
            log "EC2 is reachable via SSH."
            return 0
        fi
        attempt=$((attempt + 1))
        info "Attempt $attempt/$max_attempts - waiting 10s..."
        sleep 10
    done

    error "EC2 instance not reachable after $max_attempts attempts."
    info "You can try connecting manually: ssh ec2-user@${EC2_IP}"
    info "Or use SSM: aws ssm start-session --target $EC2_INSTANCE_ID"
    return 1
}

# ── Deploy application to EC2 ───────────────────────────────────────────────
deploy_to_ec2() {
    log "Deploying application to EC2..."

    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32)

    # Create .env file locally
    local env_file
    env_file=$(mktemp)
    cat > "$env_file" <<ENVEOF
# JARVIS Production Configuration
# Generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Database (MySQL via Docker)
MYSQL_HOST=db
MYSQL_PORT=3306
MYSQL_USER=jarvis
MYSQL_PASSWORD=$(openssl rand -base64 24)
MYSQL_DATABASE=jarvis

# Auth - Local fallback
JWT_SECRET=${JWT_SECRET}
AUTH_USERNAME=sullivan
AUTH_PASSWORD=$(openssl rand -base64 16)

# Auth Mode
AUTH_MODE=cognito

# AWS Cognito
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_APP_CLIENT_ID=${APP_CLIENT_ID}
COGNITO_REGION=${REGION}

# AI
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_PROVIDER=deepseek
JARVIS_DAILY_REQUEST_LIMIT=50

# Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://${EC2_IP}/api/calendar/google/callback
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=https://${EC2_IP}/api/calendar/microsoft/callback

# App
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://${EC2_IP}
CORS_ORIGIN=https://${EC2_IP}
ENVEOF

    # Copy files to EC2
    info "Copying project files to EC2..."

    # Copy setup script and nginx config
    scp -o StrictHostKeyChecking=no \
        "${SCRIPT_DIR}/setup-ec2.sh" \
        "${SCRIPT_DIR}/nginx.conf" \
        "ec2-user@${EC2_IP}:/tmp/"

    # Copy env file
    scp -o StrictHostKeyChecking=no \
        "$env_file" \
        "ec2-user@${EC2_IP}:/tmp/.env"

    rm -f "$env_file"

    # Copy project files (tar and send to avoid many scp calls)
    info "Packaging and copying project..."
    tar -czf /tmp/jarvis-project.tar.gz \
        -C "$PROJECT_DIR" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='aws' \
        --exclude='.env' \
        .

    scp -o StrictHostKeyChecking=no \
        /tmp/jarvis-project.tar.gz \
        "ec2-user@${EC2_IP}:/tmp/"

    rm -f /tmp/jarvis-project.tar.gz

    # Run setup on EC2
    info "Running setup on EC2..."
    ssh -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" <<'REMOTE'
        set -euo pipefail

        # Extract project
        mkdir -p /opt/jarvis
        cd /opt/jarvis
        tar -xzf /tmp/jarvis-project.tar.gz

        # Move env file
        mv /tmp/.env /opt/jarvis/.env

        # Move nginx config
        sudo mv /tmp/nginx.conf /etc/nginx/conf.d/jarvis.conf
        # Remove default nginx config that conflicts
        sudo rm -f /etc/nginx/conf.d/default.conf
        sudo rm -f /etc/nginx/sites-enabled/default

        # Run setup script
        chmod +x /tmp/setup-ec2.sh
        sudo /tmp/setup-ec2.sh

        # Start the application
        cd /opt/jarvis
        docker compose up -d --build

        echo "=== Application started ==="
        docker compose ps
REMOTE

    log "Application deployed to EC2."
}

# ── Print summary ────────────────────────────────────────────────────────────
print_summary() {
    echo ""
    echo "============================================================"
    echo -e "${GREEN}  JARVIS Business Command Center - Deployed!${NC}"
    echo "============================================================"
    echo ""
    echo "  Access URL:         http://${EC2_IP}"
    echo "  (HTTPS available after setting up domain + certbot)"
    echo ""
    echo "  Cognito Login:"
    echo "    Email:            ${ADMIN_EMAIL}"
    echo "    Password:         ${ADMIN_PASSWORD}"
    echo ""
    echo "  AWS Resources:"
    echo "    EC2 IP:           ${EC2_IP}"
    echo "    User Pool ID:     ${USER_POOL_ID}"
    echo "    App Client ID:    ${APP_CLIENT_ID}"
    echo "    Cognito Domain:   ${COGNITO_DOMAIN}"
    echo ""
    echo "  SSH Access:"
    echo "    ssh ec2-user@${EC2_IP}"
    echo ""
    echo "  SSM Access (no SSH key needed):"
    echo "    aws ssm start-session --target ${EC2_INSTANCE_ID}"
    echo ""
    echo "  Next Steps:"
    echo "    1. Point your domain DNS A record to ${EC2_IP}"
    echo "    2. SSH in and run: sudo certbot --nginx -d yourdomain.com"
    echo "    3. Update FRONTEND_URL in /opt/jarvis/.env with your domain"
    echo "    4. Restart: cd /opt/jarvis && docker compose restart"
    echo ""
    echo "  Estimated Monthly Cost:"
    echo "    EC2 ${INSTANCE_TYPE}: ~\$7-15/mo"
    echo "    EBS 20GB gp3:     ~\$1.60/mo"
    echo "    Elastic IP:       \$0 (attached to running instance)"
    echo "    Cognito:          \$0 (free tier: 50K MAU)"
    echo "    Total:            ~\$9-17/mo"
    echo ""
    echo "============================================================"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo "============================================================"
    echo "  JARVIS AWS Deployment"
    echo "============================================================"
    echo ""

    check_prerequisites
    validate_params
    deploy_stack
    get_outputs
    create_cognito_user

    if wait_for_ec2; then
        deploy_to_ec2
    else
        warn "Skipping EC2 deployment - instance not reachable."
        warn "Run setup manually after the instance is ready."
    fi

    print_summary
}

main "$@"
