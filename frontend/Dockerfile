# =============================================================================
# NetMap Frontend - Production Dockerfile
# =============================================================================
# API key injected server-side via nginx proxy (never in browser)
# =============================================================================

FROM node:24.19-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base
RUN apk upgrade --no-cache

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN npm run build

FROM nginx:1.30.4-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 AS runner
RUN apk upgrade --no-cache && apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

RUN mkdir -p /etc/nginx/templates && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
ENV NGINX_ENVSUBST_FILTER=API_KEY|API_HOST

RUN rm -f .env .env.*

USER nginx

EXPOSE 3021

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3021/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
