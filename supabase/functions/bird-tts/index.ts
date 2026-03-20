import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { birdName, text, audience } = await req.json()
    const aud = audience || 'dorosly'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check cache in dedicated audio table
    const { data: cached } = await supabase
      .from('bird_audio')
      .select('audio_url')
      .eq('bird_name', birdName)
      .eq('audience', aud)
      .maybeSingle()

    if (cached?.audio_url) {
      return new Response(JSON.stringify({ url: cached.audio_url, cached: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Generate with ElevenLabs
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')!
    const voiceId = 'd4Z5Fvjohw3zxGpV8XUV' // Maria

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
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    const dataUrl = `data:audio/mpeg;base64,${base64}`

    // Save to dedicated audio cache table
    const { error: insertError } = await supabase
      .from('bird_audio')
      .upsert({ bird_name: birdName, audience: aud, audio_url: dataUrl }, { onConflict: 'bird_name,audience' })
    
    if (insertError) console.error('Cache insert error:', insertError.message)

    return new Response(JSON.stringify({ url: dataUrl, cached: false }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
