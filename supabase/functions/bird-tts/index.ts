import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { birdName, text } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check cache
    const { data: cached } = await supabase
      .from('bird_descriptions')
      .select('audio_url')
      .eq('bird_name', birdName)
      .not('audio_url', 'is', null)
      .maybeSingle()

    if (cached?.audio_url) {
      return new Response(JSON.stringify({ url: cached.audio_url, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate with ElevenLabs
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')!
    const voiceId = 'd4Z5Fvjohw3zxGpV8XUV' // Maria - Quiet and Gentle

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    })

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`)

    const audioBuffer = await response.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)))
    const dataUrl = `data:audio/mpeg;base64,${base64}`

    // Cache as data URL in bird_descriptions table
    await supabase.from('bird_descriptions')
      .upsert(
        { bird_name: birdName, audio_url: dataUrl, description_child: '' },
        { onConflict: 'bird_name' }
      )

    return new Response(JSON.stringify({ url: dataUrl, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
