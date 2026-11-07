-- Migrazione 012 (07/11/2026): i rapportini di prima della 1.2 diventano rapportini del loro giorno.
-- La 011 aveva fatto di ogni riga un rapportino con un lavoro solo. Andrea: "gli 8 rapportini dovevano essere
-- raggruppati con il nuovo sistema a giornate". Il lavoro lo fa 012-raggruppa-giornate.js, con la copia
-- wisper.db.prima-12 fatta prima dal server.
SELECT 1;
