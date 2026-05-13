// api/tts.js — Función serverless de Vercel
// La clave de OpenAI vive en variables de entorno, nunca llega al navegador.

export default async function handler(req, res) {
    // Solo aceptamos POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, ref } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Falta el texto a convertir' });
    }

    // Límite de seguridad: un versículo no debería pasar de 2000 caracteres
    if (text.length > 2000) {
        return res.status(400).json({ error: 'Texto demasiado largo' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key no configurada en el servidor' });
    }

    try {
        const fullText = ref ? `${ref}. ${text}` : text;

        const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini-tts',
                voice: 'nova',
                input: fullText,
                response_format: 'mp3',
                instructions: 'Habla en español latinoamericano con un tono cálido, pausado y reverente, como si estuvieras leyendo la Biblia en voz alta.'
            })
        });

        if (!openaiRes.ok) {
            const err = await openaiRes.json();
            return res.status(openaiRes.status).json({ error: err.error?.message || 'Error de OpenAI' });
        }

        // Recibimos el MP3 binario y lo reenviamos al cliente
        const audioBuffer = await openaiRes.arrayBuffer();

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', 'attachment; filename="versiculo.mp3"');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(Buffer.from(audioBuffer));

    } catch (e) {
        console.error('TTS error:', e);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
