# PHF ERP API — production image
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply any pending migrations, then start.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
