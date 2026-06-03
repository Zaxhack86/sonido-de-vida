// src/worker.js — Sonido de Vida Audio Worker
// Rutas:
//   /{libro}/{capitulo}              → audio RVA 1909 individual (mp3)
//   /sbll/{libro}/{capitulo}         → audio SBLL 2026 individual (mp3)
//   /stream/{libro}/{capitulo}       → stream RVA 1909 continuo desde ese punto
//   /stream/sbll/{libro}/{capitulo}  → stream SBLL 2026 continuo desde ese punto
//   ?modo=continuar (default) → resto del libro
//   ?modo=full                → resto del libro + libros siguientes hasta Apocalipsis

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

// Orden canónico de los libros (claves R2)
const BIBLE_ORDER = [
    "genesis","exodo","levitico","numeros","deuteronomio","josue","jueces","rut",
    "1-samuel","2-samuel","1-reyes","2-reyes","1-cronicas","2-cronicas","esdras",
    "nehemias","ester","job","salmos","proverbios","eclesiastes","cantares","isaias",
    "jeremias","lamentaciones","ezequiel","daniel","oseas","joel","amos","abdias",
    "jonas","miqueas","nahum","habacuc","sofonias","hageo","zacarias","malaquias",
    "mateo","marcos","lucas","juan","hechos","romanos","1-corintios","2-corintios",
    "galatas","efesios","filipenses","colosenses","1-tesalonicenses","2-tesalonicenses",
    "1-timoteo","2-timoteo","tito","filemon","hebreos","santiago","1-pedro","2-pedro",
    "1-juan","2-juan","3-juan","judas","apocalipsis",
];

const CHAPTER_COUNTS = {
    "genesis":50,"exodo":40,"levitico":27,"numeros":36,"deuteronomio":34,
    "josue":24,"jueces":21,"rut":4,"1-samuel":31,"2-samuel":24,
    "1-reyes":22,"2-reyes":25,"1-cronicas":29,"2-cronicas":36,
    "esdras":10,"nehemias":13,"ester":10,"job":42,"salmos":150,
    "proverbios":31,"eclesiastes":12,"cantares":8,"isaias":66,
    "jeremias":52,"lamentaciones":5,"ezequiel":48,"daniel":12,
    "oseas":14,"joel":3,"amos":9,"abdias":1,"jonas":4,
    "miqueas":7,"nahum":3,"habacuc":3,"sofonias":3,"hageo":2,
    "zacarias":14,"malaquias":4,
    "mateo":28,"marcos":16,"lucas":24,"juan":21,"hechos":28,
    "romanos":16,"1-corintios":16,"2-corintios":13,"galatas":6,
    "efesios":6,"filipenses":4,"colosenses":4,"1-tesalonicenses":5,
    "2-tesalonicenses":3,"1-timoteo":6,"2-timoteo":4,"tito":3,
    "filemon":1,"hebreos":13,"santiago":5,"1-pedro":5,"2-pedro":3,
    "1-juan":5,"2-juan":1,"3-juan":1,"judas":1,"apocalipsis":22,
};

// Devuelve las claves R2 a unir según punto inicial y modo
function buildSegmentKeys(isSBLL, book, chapter, mode) {
    const out = [];
    const prefix = isSBLL ? "audio_sbll" : "audio";
    const ext = "mp3"; // ambas traducciones son MP3 ahora
    const startIdx = BIBLE_ORDER.indexOf(book);
    if (startIdx < 0) return out;

    const limit = mode === "full" ? BIBLE_ORDER.length : startIdx + 1;
    for (let bi = startIdx; bi < limit; bi++) {
        const b = BIBLE_ORDER[bi];
        const total = CHAPTER_COUNTS[b] || 0;
        const startCh = (bi === startIdx) ? chapter : 1;
        for (let ch = startCh; ch <= total; ch++) {
            out.push(`${prefix}/${b}/${ch}.${ext}`);
        }
    }
    return out;
}

async function getR2Object(env, primaryKey, isSBLL, ext) {
    // Intenta varias variantes del key (con/sin zero-pad)
    const obj = await env.AUDIO_BUCKET.get(primaryKey).catch(() => null);
    if (obj) return obj;

    // Probar zero-pad
    const m = primaryKey.match(/^(.+)\/(\d+)\.([a-z0-9]+)$/);
    if (!m) return null;
    const base = m[1];
    const num = parseInt(m[2], 10);
    const candidates = [
        `${base}/${String(num).padStart(2, "0")}.${m[3]}`,
        `${base}/${String(num).padStart(3, "0")}.${m[3]}`,
    ];
    for (const k of candidates) {
        const o = await env.AUDIO_BUCKET.get(k).catch(() => null);
        if (o) return o;
    }
    return null;
}

async function handleFondo(env, key) {
    const obj = await env.AUDIO_BUCKET.get(key).catch(() => null);
    if (!obj) {
        return new Response(
            JSON.stringify({ error: "Sonido no encontrado", key }),
            { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
    }
    const headers = new Headers(CORS);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=604800, immutable");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
    return new Response(obj.body, { status: 200, headers });
}

async function handleSingle(env, isSBLL, book, chapter) {
    const prefix = isSBLL ? "audio_sbll" : "audio";
    const obj = await getR2Object(env, `${prefix}/${book}/${chapter}.mp3`, isSBLL, "mp3");
    if (!obj) {
        return new Response(
            JSON.stringify({ error: "Audio no encontrado", book, chapter }),
            { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
    }
    const headers = new Headers(CORS);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=86400");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
    return new Response(obj.body, { status: 200, headers });
}

async function handleStream(env, isSBLL, book, chapter, mode) {
    const segments = buildSegmentKeys(isSBLL, book, chapter, mode);
    if (segments.length === 0) {
        return new Response(
            JSON.stringify({ error: "Sin segmentos", book, chapter, mode }),
            { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
    }

    let segIdx = 0;
    let currentReader = null;

    const stream = new ReadableStream({
        async pull(controller) {
            while (true) {
                if (!currentReader) {
                    if (segIdx >= segments.length) {
                        controller.close();
                        return;
                    }
                    const key = segments[segIdx++];
                    const obj = await getR2Object(env, key, isSBLL, "mp3");
                    if (!obj || !obj.body) continue; // saltar capítulos faltantes
                    currentReader = obj.body.getReader();
                }
                const { done, value } = await currentReader.read();
                if (done) {
                    try { currentReader.releaseLock(); } catch(e) {}
                    currentReader = null;
                    continue;
                }
                controller.enqueue(value);
                return;
            }
        },
        cancel() {
            if (currentReader) {
                try { currentReader.releaseLock(); } catch(e) {}
            }
        },
    });

    const headers = new Headers(CORS);
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Sdv-Segments", String(segments.length));
    return new Response(stream, { status: 200, headers });
}

const worker_default = {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS });
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", { status: 405, headers: CORS });
        }

        const url = new URL(request.url);
        const pathname = url.pathname.replace(/^\//, "");
        const parts = pathname.split("/");
        const mode = url.searchParams.get("modo") || "continuar";

        // Sonidos de fondo: /fondos/{categoria}/{archivo}.mp3
        if (parts[0] === "fondos") {
            if (parts.length < 3) {
                return new Response("Bad Request", { status: 400, headers: CORS });
            }
            return handleFondo(env, pathname);
        }

        // Detectar /stream/...
        if (parts[0] === "stream") {
            let isSBLL = false;
            let book, chapter;
            if (parts[1] === "sbll" && parts.length >= 4) {
                isSBLL = true; book = parts[2]; chapter = parseInt(parts[3], 10);
            } else if (parts.length >= 3) {
                book = parts[1]; chapter = parseInt(parts[2], 10);
            } else {
                return new Response("Bad Request", { status: 400, headers: CORS });
            }
            if (!book || isNaN(chapter) || chapter < 1) {
                return new Response("Bad Request", { status: 400, headers: CORS });
            }
            return handleStream(env, isSBLL, book, chapter, mode);
        }

        // Single chapter: /sbll/{libro}/{cap} ó /{libro}/{cap}
        let isSBLL = false, bookPart, chapterPart;
        if (parts[0] === "sbll" && parts.length >= 3) {
            isSBLL = true; bookPart = parts[1]; chapterPart = parts[2];
        } else if (parts.length >= 2) {
            bookPart = parts[0]; chapterPart = parts[1];
        } else {
            return new Response("Bad Request", { status: 400, headers: CORS });
        }
        if (!bookPart) return new Response("Bad Request", { status: 400, headers: CORS });
        const chapter = parseInt(chapterPart, 10);
        if (isNaN(chapter) || chapter < 1) return new Response("Bad Request", { status: 400, headers: CORS });

        return handleSingle(env, isSBLL, bookPart, chapter);
    },
};

export { worker_default as default };
