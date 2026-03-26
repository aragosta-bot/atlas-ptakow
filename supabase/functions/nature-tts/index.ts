import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = [
    'https://atlas-ptakow.vercel.app',
    'https://dzieciosferka.vercel.app',
    'https://atlas-ptakow-repo.vercel.app',
  ];
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { itemName, section, text, audience } = await req.json()

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'text is required' }), { status: 400, headers: cors })
    }
    if (text.length > 2000) {
      return new Response(JSON.stringify({ error: 'text too long (max 2000 chars)' }), { status: 400, headers: cors })
    }
    if (!itemName || typeof itemName !== 'string' || itemName.length > 100) {
      return new Response(JSON.stringify({ error: 'invalid itemName' }), { status: 400, headers: cors })
    }
    if (!section || typeof section !== 'string') {
      return new Response(JSON.stringify({ error: 'section is required' }), { status: 400, headers: cors })
    }

    const aud = audience || 'dorosly'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check cache
    const { data: cached } = await supabase
      .from('nature_audio')
      .select('audio_url')
      .eq('section', section)
      .eq('item_name', itemName)
      .eq('audience', aud)
      .maybeSingle()

    if (cached?.audio_url) {
      // Decode base64 in chunks to avoid stack overflow
      const dataUrl = cached.audio_url
      const base64 = dataUrl.split(',')[1]
      const binaryStr = atob(base64)
      const len = binaryStr.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      return new Response(bytes.buffer, {
        headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' }
      })
    }

    // Generate with ElevenLabs
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')!
    const voiceId = 'd4Z5Fvjohw3zxGpV8XUV'

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    })

    if (!response.ok) throw new Error(`ElevenLabs: ${response.status}`)

    const buf = await response.arrayBuffer()

    // Cache as base64
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    const dataUrl = `data:audio/mpeg;base64,${base64}`

    supabase.from('nature_audio').upsert(
      { section, item_name: itemName, audience: aud, audio_url: dataUrl },
      { onConflict: 'section,item_name,audience' }
    ).then(() => {}).catch(() => {})

    return new Response(buf, {
      headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
})
