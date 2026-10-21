# Il server di Wisper per il NAS. Node 24 e basta: nessuna dipendenza npm da scaricare.
#   docker compose build && docker compose up -d
FROM node:24-slim

ENV NODE_ENV=production \
    TZ=Europe/Rome

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY strumenti ./strumenti

# I dati (database, file, copie) stanno nel volume /data, di proprieta' dell'utente
# "node" dell'immagine (uid 1000): il server non gira come root.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]

EXPOSE 8400

# Il controllo del NAS: /salute risponde senza accesso e prova anche il database.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8400/salute').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/avvio.js", "--dati", "/data", "--porta", "8400"]
