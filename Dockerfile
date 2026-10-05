FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir /app/data /app/backups && chown node:node /app/data /app/backups
USER node
ENV HOST=0.0.0.0 PORT=3080 DATA_DIR=/app/data BACKUP_DIR=/app/backups
EXPOSE 3080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
