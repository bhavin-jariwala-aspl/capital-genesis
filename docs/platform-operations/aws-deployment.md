# AWS Deployment Guide for Genesis

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Platform operations](README.md)** › 4 of 4 · **For:** DevOps
> ← [Plans & features](plans-and-features.md) · [Architecture & setup](../developer-guide/architecture-and-setup.md) *(Developer guide)* →
> New to Genesis? Background: [Understanding Genesis › How a request travels](../understanding/04-how-a-request-travels.md)
<!-- /nav:top -->

Genesis is a **Fastify (Node.js) backend + React (Vite) frontend + MySQL (RDS) + Redis** stack. This guide covers
deploying the application on AWS using ECS Fargate.

The same images serve a short-lived **client sandbox** (one small server or service, its own database). The
checklist for that case, including accounts, email mode, reset and deletion, is
[genesis-capital/client-sandbox.md](../genesis-capital/client-sandbox.md).

---

## Phase 1: Prerequisites

1. **Create an AWS account** and install the [AWS CLI](https://aws.amazon.com/cli/).
2. **Install Docker** locally for building container images.
3. **Set up an IAM user** with programmatic access and the following permissions:
   - EC2, ECS, RDS, S3, ElastiCache, ECR, ALB, Route 53, ACM, Secrets Manager

---

## Phase 2: Database & Cache

### MySQL RDS

An RDS instance already exists in `us-east-2` (its endpoint is the `<rds-endpoint>` used in [Installation](../getting-started/installation.md#local-demo-database-macos)). Ensure:

- It is in a **private subnet** (not publicly accessible).
- Security group allows inbound on port `3306` only from the app's security group.
- Automated backups are enabled.
- Multi-AZ is enabled for production.

The demo laptop does not use this instance day to day. It runs a local MySQL copy of the RDS `genesis` database, and
the RDS URL is kept commented out in `backend/.env`. See
[Local demo database](../getting-started/installation.md#local-demo-database-macos).

### Redis (ElastiCache)

Create an ElastiCache Redis cluster:

- Engine: Redis 7.x
- Node type: `cache.t3.micro` (start small, scale as needed)
- Place in the same VPC/private subnet as RDS.
- Update the `REDIS_HOST` environment variable to point to the ElastiCache endpoint.

---

## Phase 3: Containerize the Application

### Backend Dockerfile (`backend/Dockerfile`)

The repository ships this file. In short:

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app
# ... copies node_modules, prisma, src, scripts; creates uploads/; runs as user node
EXPOSE 3001
HEALTHCHECK ... /health
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
```

The container applies pending migrations every time it starts.

### Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

### Nginx Configuration (`frontend/nginx.conf`)

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  client_max_body_size 25m;

  location /api/ {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }

  location /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }

  location / {
    try_files $uri /index.html;
    add_header Cache-Control "no-cache";
  }
}
```

`docker-compose.yml` at the repository root runs the same two images with MySQL 8.4 and Redis 7.4 for a local
full stack (web on port 8080, API on 3001); secrets come from `.env.docker` (template `.env.docker.example`).

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
| Environment variables| `DATABASE_URL`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `REDIS_HOST`, `ALLOWED_ORIGINS`, `APP_URL`, `NODE_ENV=production` |

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
- `FIELD_ENCRYPTION_KEY`
- `REDIS_PASSWORD`
- `SMTP_PASS`

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

The backend container runs `npx prisma migrate deploy` on every start, so migrations need no separate step.
To load the platform layer and the Genesis Capital demo workspace, run the seed once from a one-off ECS task or a
bastion host:

```bash
node prisma/seed.js --allow-remote
```

The seed **empties every table** first. It refuses a non-local `DATABASE_URL` unless `--allow-remote` (or
`SEED_ALLOW_REMOTE=1`) is given. Never run it against a database that holds real data.

---

## Phase 8: CI/CD with GitHub Actions

The repository already has `.github/workflows/ci.yml` (backend tests, frontend lint, tests and builds on Node 22).
There is no deploy workflow yet. A `.github/workflows/deploy.yml` could look like this:

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
          node-version: 22
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
| `TRUST_PROXY`      | Proxy hops to trust for the client IP (rate limits, audit). Unset = none | `1` (behind one ALB) |
| `JWT_SECRET`       | Token signing key (32+ chars)    | Random secure string                 |
| `JWT_EXPIRY`       | Access token expiry              | `8h`                                 |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime (days) | `14`                            |
| `FIELD_ENCRYPTION_KEY` | AES-256 key for encrypted fields, 64 hex chars (else derived from `JWT_SECRET`) | `openssl rand -hex 32` |
| `ALLOWED_ORIGINS`  | Comma-separated CORS origins in production (empty = no cross-origin calls) | `https://crm.example.com` |
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
| `PORTAL_SECRET`    | Optional key for client-portal tokens (default derived from `JWT_SECRET`) | Random secure string |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Outbound email; without `SMTP_HOST` mail is only logged | `smtp.example.com` |
| `STORAGE_DRIVER`   | Document storage: `local`, `s3`, `azure` or `gcs` (see `backend/.env.example`) | `s3` |
| `LOG_LEVEL`        | Log level                        | `info`                               |

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
- [ ] Set `FIELD_ENCRYPTION_KEY` and `ALLOWED_ORIGINS`
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

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Architecture & setup](../developer-guide/architecture-and-setup.md) *(Developer guide)* — Stack, structure, runtime loading pipeline, patterns, troubleshooting |
| **Previous** | [Plans & features](plans-and-features.md) |
| **Background** | [Understanding Genesis › How a request travels](../understanding/04-how-a-request-travels.md) |
| **Related** | [Installation & setup](../getting-started/installation.md) · [Client sandbox](../genesis-capital/client-sandbox.md) |
| **On these journeys** | [Platform operator](../README.md#platform-operator) (step 8 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Platform operations](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
