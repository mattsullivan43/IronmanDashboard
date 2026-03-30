# JARVIS AWS Deployment Guide

## Prerequisites

1. **AWS CLI** installed and configured with credentials
   ```bash
   brew install awscli        # macOS
   aws configure               # Set up access key, secret, region
   ```

2. **jq** for JSON parsing
   ```bash
   brew install jq             # macOS
   ```

3. **EC2 Key Pair** created in your target region
   ```bash
   aws ec2 create-key-pair --key-name jarvis-key --query 'KeyMaterial' --output text > ~/.ssh/jarvis-key.pem
   chmod 400 ~/.ssh/jarvis-key.pem
   ```

## Quick Deploy

```bash
cd aws/

# Basic deployment (auto-detects your IP for SSH)
./deploy.sh jarvis-prod jarvis-key

# With explicit SSH IP
./deploy.sh jarvis-prod jarvis-key 203.0.113.50/32

# Use t3.micro to save money (~$8/mo vs ~$16/mo)
INSTANCE_TYPE=t3.micro ./deploy.sh jarvis-prod jarvis-key
```

The script will:
- Deploy the CloudFormation stack (VPC, EC2, Cognito)
- Create the admin Cognito user (mjsullivan0910@gmail.com)
- Copy project files to EC2
- Start the application via Docker Compose

## Access

After deployment:
- **HTTP:** `http://<EC2-IP>` (redirects to HTTPS)
- **HTTPS:** `https://<EC2-IP>` (self-signed cert until domain is set up)
- **SSH:** `ssh -i ~/.ssh/jarvis-key.pem ec2-user@<EC2-IP>`
- **SSM:** `aws ssm start-session --target <instance-id>` (no SSH key needed)

## SSL Setup with Let's Encrypt

Once you have a domain pointed to the EC2 IP:

```bash
ssh -i ~/.ssh/jarvis-key.pem ec2-user@<EC2-IP>

# Get a real SSL certificate
sudo certbot --nginx -d yourdomain.com

# Update the app URL
cd /opt/jarvis
# Edit .env: FRONTEND_URL=https://yourdomain.com
docker compose restart
```

Certificates auto-renew via cron.

## Architecture

```
Internet
    |
[Elastic IP]
    |
[EC2 Instance - t3.small]
    |--- nginx (ports 80/443, reverse proxy)
    |--- Docker
    |      |--- app (Node.js, port 3000)
    |      |--- db  (MySQL 8.0, port 3306)
    |
[Cognito User Pool] (auth, free tier)
```

## Monthly Cost Estimate

| Resource         | t3.micro  | t3.small  |
|-----------------|-----------|-----------|
| EC2             | ~$7.60    | ~$15.20   |
| EBS 20GB gp3    | ~$1.60    | ~$1.60    |
| Elastic IP       | $0        | $0        |
| Cognito          | $0        | $0        |
| **Total**        | **~$9**   | **~$17**  |

## Monitoring and Maintenance

**View logs:**
```bash
ssh ec2-user@<IP>
cd /opt/jarvis
docker compose logs -f app    # Application logs
docker compose logs -f db     # Database logs
sudo tail -f /var/log/nginx/access.log
```

**Database backup** (runs daily at 2 AM automatically):
```bash
/opt/jarvis/backup.sh         # Manual backup
ls /opt/jarvis/backups/       # List backups
```

**Update the application:**
```bash
cd /opt/jarvis
# Pull latest code or copy new files
docker compose down
docker compose up -d --build
```

**Security updates** are applied automatically via dnf-automatic.

## Teardown

```bash
aws cloudformation delete-stack --stack-name jarvis-prod
```

This removes all AWS resources. Database data on the EBS volume will be deleted.
