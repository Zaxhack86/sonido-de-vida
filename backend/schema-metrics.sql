-- Sonido de Vida — Métricas (analytics propio + SEO)
-- Tablas independientes de las user_*; nada aquí va scoped por uid salvo el
-- embudo (registro/premium), que cuenta usuarios únicos por su uid.
--
-- Aplicar:  npx wrangler@3 d1 execute sonido-de-vida-db --remote --file backend/schema-metrics.sql

-- ── Visitas (anónimo, agregable) ─────────────────────────────────────
-- Una fila por carga de página. Sin IP cruda: `visitor` es un hash que ROTA
-- cada día (no permite seguir a nadie entre días). De aquí salen visitas,
-- únicos, fuentes ("vino de Instagram"), top páginas y países.
CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dia            TEXT NOT NULL,                          -- 'YYYY-MM-DD' (UTC)
  ts             TEXT NOT NULL DEFAULT (datetime('now')),
  path           TEXT,                                   -- ruta visitada (sin query)
  source         TEXT,                                   -- 'instagram','facebook','google','directo',utm_source...
  medium         TEXT,                                   -- 'social' | 'organic' | 'referral' | 'direct' | 'campaign'
  referrer_host  TEXT,                                   -- host del referrer (detalle de "referral")
  visitor        TEXT,                                   -- hash diario anónimo (cuenta únicos), NUNCA la IP
  country        TEXT,                                   -- país (cabecera CF-IPCountry)
  device         TEXT                                    -- 'mobile' | 'desktop'
);
CREATE INDEX IF NOT EXISTS idx_pv_dia    ON analytics_pageviews(dia);
CREATE INDEX IF NOT EXISTS idx_pv_src    ON analytics_pageviews(dia, source);
CREATE INDEX IF NOT EXISTS idx_pv_visit  ON analytics_pageviews(dia, visitor);

-- ── Embudo: registro y conversión a premium ──────────────────────────
-- Una fila por usuario y tipo (índice único): el primer /api/me de un uid deja
-- el 'registro'; la primera suscripción activa deja el 'premium'. INSERT OR
-- IGNORE garantiza que cada uid cuenta una sola vez. `dia` = primera vez.
CREATE TABLE IF NOT EXISTS analytics_events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  dia    TEXT NOT NULL,                                  -- 'YYYY-MM-DD' (UTC) de la primera vez
  ts     TEXT NOT NULL DEFAULT (datetime('now')),
  tipo   TEXT NOT NULL,                                  -- 'registro' | 'premium'
  uid    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ev_unq ON analytics_events(tipo, uid);
CREATE INDEX IF NOT EXISTS idx_ev_dia ON analytics_events(tipo, dia);

-- ── SEO (Search Console) — Fase 2 ────────────────────────────────────
-- Las llena el cron nocturno del Worker llamando a la API de Search Console.
-- Quedan vacías (inertes) hasta configurar SEARCH_CONSOLE_SITE y dar acceso a
-- la cuenta de servicio. Search Console tiene ~2-3 días de retraso en sus datos.
CREATE TABLE IF NOT EXISTS seo_daily (
  dia          TEXT PRIMARY KEY,                         -- 'YYYY-MM-DD'
  impresiones  INTEGER NOT NULL DEFAULT 0,
  clics        INTEGER NOT NULL DEFAULT 0,
  ctr          REAL,                                     -- clics/impresiones
  posicion     REAL                                      -- posición media en Google
);

CREATE TABLE IF NOT EXISTS seo_queries (
  dia          TEXT NOT NULL,                            -- 'YYYY-MM-DD'
  query        TEXT NOT NULL,                            -- término que buscó la gente
  impresiones  INTEGER NOT NULL DEFAULT 0,
  clics        INTEGER NOT NULL DEFAULT 0,
  posicion     REAL,
  PRIMARY KEY (dia, query)
);
CREATE INDEX IF NOT EXISTS idx_seoq_dia ON seo_queries(dia);
