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

-- ── Fase 2: contador de descargas diario por uid (anti-abuso real) ────
-- El límite ya no vive en localStorage (borrable). Vive aquí, atado al uid:
--   gratis = 3/día (+1 bonus por compartir) · premium = 20/día.
-- `dia` es 'YYYY-MM-DD' en UTC; una fila por usuario y día.
CREATE TABLE IF NOT EXISTS user_download_counts (
  uid        TEXT    NOT NULL,
  dia        TEXT    NOT NULL,
  descargas  INTEGER NOT NULL DEFAULT 0,
  bonus      INTEGER NOT NULL DEFAULT 0,   -- +1 por compartir (máx. 1 al día)
  PRIMARY KEY (uid, dia)
);

-- ── Fase 3: biblioteca de descargas sincronizada por uid ─────────────
-- Solo guarda la LISTA de capítulos descargados (libro+capítulo). El audio
-- vive en R2; esto permite reconstruir "Mis descargas" en otro dispositivo o
-- tras borrar los datos del navegador. Lista diminuta = prácticamente gratis.
CREATE TABLE IF NOT EXISTS user_downloads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT    NOT NULL,
  libro      TEXT    NOT NULL,
  capitulo   INTEGER NOT NULL,
  creado_en  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(uid, libro, capitulo)              -- un mismo capítulo no se duplica
);
CREATE INDEX IF NOT EXISTS idx_downloads_uid ON user_downloads(uid, creado_en DESC);

-- ── Fase 2: Listas de reproducción del Podcast (likes + playlists) ────
-- Los episodios se identifican por su `content_id` (= content_items.id, el
-- mismo entero que el frontend usa en EPISODES[].contentId). Aquí solo se
-- guardan referencias (qué episodio), nunca el audio.

-- "Me gusta": un episodio marcado por un usuario (favoritos rápidos).
CREATE TABLE IF NOT EXISTS user_liked_episodes (
  uid         TEXT    NOT NULL,
  content_id  INTEGER NOT NULL,
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (uid, content_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_uid ON user_liked_episodes(uid, creado_en DESC);

-- Listas de reproducción. `id` es un token aleatorio no adivinable: sirve a la
-- vez de clave primaria y de enlace público (/?lista=<id>). Una lista solo se
-- expone públicamente si `publica = 1`; por defecto es privada.
CREATE TABLE IF NOT EXISTS user_playlists (
  id              TEXT    PRIMARY KEY,
  uid             TEXT    NOT NULL,
  nombre          TEXT    NOT NULL,
  publica         INTEGER NOT NULL DEFAULT 0,
  creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_playlists_uid ON user_playlists(uid, actualizado_en DESC);

-- Episodios dentro de una lista, con orden. `orden` permite reordenar; al
-- añadir se usa (máximo actual + 1). Un episodio no se duplica en la misma lista.
CREATE TABLE IF NOT EXISTS user_playlist_items (
  playlist_id  TEXT    NOT NULL,
  content_id   INTEGER NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 0,
  creado_en    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playlist_id, content_id)
);
CREATE INDEX IF NOT EXISTS idx_pl_items ON user_playlist_items(playlist_id, orden);

-- ── Premium: catálogo de contenido protegido servido por el portero ───
-- El archivo vive en un bucket R2 PRIVADO; solo el Worker (tras verificar
-- token + premium) lo entrega. Nunca se expone una URL pública.
CREATE TABLE IF NOT EXISTS content_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo       TEXT    NOT NULL,             -- 'audio', 'devocional', ...
  titulo     TEXT    NOT NULL,
  r2_key     TEXT    NOT NULL,             -- ruta dentro del bucket privado
  es_premium INTEGER NOT NULL DEFAULT 1,
  metadata   TEXT,                          -- JSON opcional
  creado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Después (mismo molde scoped por uid; descomentar al construir cada fase) ──
-- CREATE TABLE user_notes      ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, libro TEXT, capitulo INTEGER, versiculo INTEGER, texto TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')) );
-- CREATE TABLE user_progress   ( uid TEXT NOT NULL, libro TEXT NOT NULL, capitulo INTEGER NOT NULL, posicion REAL DEFAULT 0, actualizado_en TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (uid, libro) );
-- CREATE TABLE user_prayers    ( id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, texto TEXT NOT NULL, respondida INTEGER DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now')), respondida_en TEXT );
-- CREATE TABLE content_items   ( id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, titulo TEXT NOT NULL, r2_key TEXT NOT NULL, es_premium INTEGER DEFAULT 1, metadata TEXT );
