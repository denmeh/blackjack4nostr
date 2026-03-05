# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Build the app
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Copy built app and production dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "build/index.js"]
