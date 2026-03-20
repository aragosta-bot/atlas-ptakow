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

    const fileName = `${birdName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')}.mp3`

    // Check cache
    const { data: existing } = await supabase.storage.from('bird-audio').list('', { search: fileName })

    if (existing && existing.length > 0) {
      const { data: { publicUrl } } = supabase.storage.from('bird-audio').getPublicUrl(fileName)
      return new Response(JSON.stringify({ url: publicUrl, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate with ElevenLabs
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')!
    const voiceId = 'cgSgspJ2msm6clMCkdW9' // Jessica - Playful, Bright, Warm

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`)
    }

    const audioBuffer = await response.arrayBuffer()

    // Create bucket if not exists, then upload
    await supabase.storage.createBucket('bird-audio', { public: true }).catch(() => {})

    await supabase.storage.from('bird-audio').upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    })

    const { data: { publicUrl } } = supabase.storage.from('bird-audio').getPublicUrl(fileName)

    return new Response(JSON.stringify({ url: publicUrl, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
