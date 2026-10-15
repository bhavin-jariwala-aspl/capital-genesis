# AWS Deployment Guide for Genesis

Genesis is a **Fastify (Node.js) backend + React (Vite) frontend + MySQL (RDS) + Redis** stack. This guide covers
deploying the application on AWS using ECS Fargate.

The same images serve a short-lived **client sandbox** (one small server or service, its own database). The
checklist for that case, including accounts, email mode, reset and deletion, is
[GENESIS-CAPITAL/CLIENT_SANDBOX.md](GENESIS-CAPITAL/CLIENT_SANDBOX.md).

---

## Phase 1: Prerequisites

1. **Create an AWS account** and install the [AWS CLI](https://aws.amazon.com/cli/).
2. **Install Docker** locally for building container images.
3. **Set up an IAM user** with programmatic access and the following permissions:
   - EC2, ECS, RDS, S3, ElastiCache, ECR, ALB, Route 53, ACM, Secrets Manager

---

## Phase 2: Database & Cache

### MySQL RDS

An RDS instance already exists (`smartsure-mysql` in `us-east-2`). Ensure:

- It is in a **private subnet** (not publicly accessible).
- Security group allows inbound on port `3306` only from the app's security group.
- Automated backups are enabled.
- Multi-AZ is enabled for production.

The demo laptop does not use this instance day to day. It runs a local MySQL copy of the RDS `genesis` database, and
the RDS URL is kept commented out in `backend/.env`. See
[Local demo database](getting-started/INSTALLATION.md#local-demo-database-macos).

### Redis (ElastiCache)

Create an ElastiCache Redis cluster:

- Engine: Redis 7.x
- Node type: `cache.t3.micro` (start small, scale as needed)
- Place in the same VPC/private subnet as RDS.
- Update the `REDIS_HOST` environment variable to point to the ElastiCache endpoint.

---

## Phase 3: Containerize the Application

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
EXPOSE 3001
CMD ["node", "src/index.js"]
```

### Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Nginx Configuration (`frontend/nginx.conf`)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> **Note:** If using an ALB to route `/api` traffic directly to the backend service, the Nginx proxy block for `/api` is
> not needed.

---

## Phase 4: Push Images to ECR

### Create ECR Repositories

```bash
aws ecr create-repository --repository-name genesis-backend
aws ecr create-repository --repository-name genesis-frontend
```

### Build and Push Images

```bash
# Authenticate Docker with ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-2.amazonaws.com

# Backend
cd backend
docker build -t genesis-backend .
docker tag genesis-backend:latest <account-id>.dkr.ecr.us-east-2.amazonaws.com/genesis-backend:latest
docker push <account-id>.dkr.ecr.us-east-2.amazonaws.com/genesis-backend:latest

# Frontend
cd ../frontend
docker build -t genesis-frontend .
docker tag genesis-frontend:latest <account-id>.dkr.ecr.us-east-2.amazonaws.com/genesis-frontend:latest
docker push <account-id>.dkr.ecr.us-east-2.amazonaws.com/genesis-frontend:latest
```

> Replace `<account-id>` with your AWS account ID.

---

## Phase 5: Deploy with ECS Fargate

### 1. Create an ECS Cluster

- Go to **ECS Console** > Create Cluster > Select **AWS Fargate**.

### 2. Create Task Definitions

**Backend Task:**

| Setting              | Value                                      |
| -------------------- | ------------------------------------------ |
| Container image      | ECR backend image URI                      |
| Port                 | `3001`                                     |
| CPU                  | `512` (0.5 vCPU)                           |
| Memory               | `1024` (1 GB)                              |
| Environment variables| `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `NODE_ENV=production` |

**Frontend Task:**

| Setting         | Value                     |
| --------------- | ------------------------- |
| Container image | ECR frontend image URI    |
| Port            | `80`                      |
| CPU             | `256` (0.25 vCPU)         |
| Memory          | `512` (0.5 GB)            |

### 3. Store Secrets

Use **AWS Secrets Manager** or **SSM Parameter Store** for sensitive values:

- `DATABASE_URL`
- `JWT_SECRET`
- `REDIS_PASSWORD`

Reference them in task definitions using `valueFrom` instead of hardcoding.

### 4. Create ECS Services

- **Backend service:** 1-2 tasks, deployed in private subnets.
- **Frontend service:** 1-2 tasks, deployed in public subnets.
- Enable auto-scaling based on CPU/memory utilization.

### 5. Create an Application Load Balancer (ALB)

- **Listener:** Port `443` (HTTPS) with an ACM SSL certificate.
- **Target Group 1:** Frontend service (port `80`) — default route.
- **Target Group 2:** Backend service (port `3001`) — path pattern `/api/*`.
- **Health check:** Use the `/health` endpoint for the backend target group.

---

## Phase 6: Networking & Security

### VPC Architecture

| Subnet Type    | Components                        |
| -------------- | --------------------------------- |
| Public subnets | ALB, NAT Gateway                  |
| Private subnets| ECS tasks, RDS, ElastiCache       |

### Security Groups

| Resource  | Inbound Rule                              |
| --------- | ----------------------------------------- |
| ALB       | Allow `80`/`443` from `0.0.0.0/0`        |
| Backend   | Allow `3001` from ALB security group only |
| Frontend  | Allow `80` from ALB security group only   |
| RDS       | Allow `3306` from backend SG only         |
| Redis     | Allow `6379` from backend SG only         |

### DNS (Route 53)

- Create an A record (alias) pointing your domain to the ALB.
- Use ACM to provision and attach an SSL certificate.

---

## Phase 7: Run Database Migrations

Before going live, run Prisma migrations using a one-off ECS task or a bastion host:

```bash
npx prisma migrate deploy
npx prisma db seed
```

---

## Phase 8: CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml` for automated deployments:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-2
  ECR_BACKEND: genesis-backend
  ECR_FRONTEND: genesis-frontend
  ECS_CLUSTER: genesis-cluster

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Test Backend
        run: cd backend && npm ci && npm test
      - name: Test Frontend
        run: cd frontend && npm ci && npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build & Push Backend
        run: |
          cd backend
          docker build -t ${{ steps.ecr.outputs.registry }}/${{ env.ECR_BACKEND }}:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/${{ env.ECR_BACKEND }}:${{ github.sha }}

      - name: Build & Push Frontend
        run: |
          cd frontend
          docker build -t ${{ steps.ecr.outputs.registry }}/${{ env.ECR_FRONTEND }}:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/${{ env.ECR_FRONTEND }}:${{ github.sha }}

      - name: Update ECS Backend Service
        run: |
          aws ecs update-service --cluster ${{ env.ECS_CLUSTER }} --service genesis-backend --force-new-deployment

      - name: Update ECS Frontend Service
        run: |
          aws ecs update-service --cluster ${{ env.ECS_CLUSTER }} --service genesis-frontend --force-new-deployment
```

> **Required GitHub Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

---

## Environment Variables Reference

| Variable           | Description                      | Example                              |
| ------------------ | -------------------------------- | ------------------------------------ |
| `DATABASE_URL`     | MySQL connection string          | `mysql://user:pass@host:3306/genesis`|
| `JWT_SECRET`       | Token signing key (32+ chars)    | Random secure string                 |
| `JWT_EXPIRY`       | Token expiry duration            | `8h`                                 |
| `REDIS_HOST`       | ElastiCache endpoint             | `redis-cluster.xxx.cache.amazonaws.com` |
| `REDIS_PORT`       | Redis port                       | `6379`                               |
| `REDIS_PASSWORD`   | Redis auth password              | Secure string                        |
| `REDIS_DB`         | Redis database number            | `0`                                  |
| `PORT`             | Backend server port              | `3001`                               |
| `HOST`             | Backend bind address             | `0.0.0.0`                            |
| `NODE_ENV`         | Environment mode                 | `production`                         |
| `CACHE_TTL_METADATA` | Metadata cache TTL (seconds)  | `3600`                               |
| `CACHE_TTL_SESSION`  | Session cache TTL (seconds)   | `28800`                              |
| `APP_URL`          | Public web address; base of password-reset, web-form and client upload links | `https://crm.example.com` |
| `API_URL`          | Public API address; OAuth callbacks and the email-open pixel (else `APP_URL`) | `https://api.example.com` |
| `UPLOAD_LINK_SECRET` | Optional key for client upload links (default derived from `JWT_SECRET`) | Random secure string |

---

## Alternative Deployment Options

| Option               | Best For                        | Trade-off                              |
| -------------------- | ------------------------------- | -------------------------------------- |
| **EC2 + PM2 + Nginx**| Budget-friendly, simple setup   | Manual scaling, server management      |
| **ECS Fargate**      | Production-grade, auto-scaling  | Moderate complexity                    |
| **AWS App Runner**   | Simplest container deployment   | Less control, higher per-request cost  |
| **Elastic Beanstalk**| Quick deploy with managed infra | Less flexibility than ECS              |

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random value (32+ characters)
- [ ] Set `NODE_ENV=production`
- [ ] Set `APP_URL` (and `API_URL` if the API has its own host) so emailed links and tracking point at the public address
- [ ] Enable HTTPS via ACM certificate on the ALB
- [ ] Enable RDS automated backups and Multi-AZ
- [ ] Set up CloudWatch alarms for CPU, memory, and error rates
- [ ] Configure ALB health checks using the `/health` endpoint
- [ ] Enable ALB access logging to S3
- [ ] Set up log aggregation with CloudWatch Logs
- [ ] Configure ECS auto-scaling policies
- [ ] Restrict all database and cache access to private subnets
- [ ] Store all secrets in AWS Secrets Manager or SSM Parameter Store
- [ ] Test disaster recovery and rollback procedures
