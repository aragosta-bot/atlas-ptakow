import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { latinName } = await req.json()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Check cache
  const { data: cached } = await supabase
    .from('bird_content')
    .select('photo_url')
    .eq('latin_name', latinName)
    .eq('audience', 'sound')
    .not('photo_url', 'is', null)
    .maybeSingle()

  if (cached?.photo_url) {
    return new Response(JSON.stringify({ url: cached.photo_url, cached: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Fetch from Xeno-canto v3 — get more results to find MP3
  const xcKey = Deno.env.get('XENOCANTO_API_KEY')!
  const query = encodeURIComponent(`sp:"${latinName}"`)
  const res = await fetch(
    `https://xeno-canto.org/api/3/recordings?query=${query}&per_page=50&key=${xcKey}`,
    { headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' } }
  )
  const data = await res.json()
  const recordings = data.recordings || []

  if (recordings.length === 0) {
    return new Response(JSON.stringify({ url: null, error: 'no recordings' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Prefer MP3 over WAV
  const mp3 = recordings.find((r: any) => r['file-name']?.toLowerCase().endsWith('.mp3'))
  const chosen = mp3 || recordings[0]
  const soundUrl = chosen.file

  // Cache
  await supabase.from('bird_content').upsert(
    { bird_name: latinName, latin_name: latinName, audience: 'sound', photo_url: soundUrl, description: '' },
    { onConflict: 'bird_name,audience' }
  )

  return new Response(JSON.stringify({ url: soundUrl, cached: false }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
