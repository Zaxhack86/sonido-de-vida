-- Sonido de Vida — esquema D1 (plataforma del usuario)
-- El `uid` proviene del JWT de Firebase YA verificado por el Worker (api-worker.js).
-- Regla invariable: toda lectura/escritura de tablas user_* va scoped por uid.

-- ── MVP (Fase 2): versículos guardados ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_saved_verses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT    NOT NULL,
  libro      TEXT    NOT NULL,
  capitulo   INTEGER NOT NULL,
  versiculo  INTEGER NOT NULL,
  texto      TEXT    NOT NULL,
  coleccion  TEXT,                          -- NULL = sin colección (capa gratis). Colecciones = premium.
  creado_en  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(uid, libro, capitulo, versiculo)   -- evita guardar el mismo versículo dos veces
);
CREATE INDEX IF NOT EXISTS idx_saved_uid ON user_saved_verses(uid, creado_en DESC);

-- ── Después (mismo molde scoped por uid; descomentar al construir cada fase) ──
-- CREATE TABLE user_notes      ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, libro TEXT, capitulo INTEGER, versiculo INTEGER, texto TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')) );
-- CREATE TABLE user_progress   ( uid TEXT NOT NULL, libro TEXT NOT NULL, capitulo INTEGER NOT NULL, posicion REAL DEFAULT 0, actualizado_en TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (uid, libro) );
-- CREATE TABLE user_prayers    ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, texto TEXT NOT NULL, respondida INTEGER DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now')), respondida_en TEXT );
-- CREATE TABLE content_items   ( id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, titulo TEXT NOT NULL, r2_key TEXT NOT NULL, es_premium INTEGER DEFAULT 1, metadata TEXT );
