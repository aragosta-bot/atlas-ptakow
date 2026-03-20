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

  // Check cache in bird_content
  const { data: cached } = await supabase
    .from('bird_content')
    .select('photo_url')
    .eq('latin_name', latinName)
    .eq('audience', 'photo')
    .not('photo_url', 'is', null)
    .maybeSingle()

  if (cached?.photo_url) {
    return new Response(JSON.stringify({ url: cached.photo_url, cached: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Fetch from iNaturalist API (no auth needed for read)
  const res = await fetch(
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(latinName)}&per_page=1`,
    { headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' } }
  )
  const data = await res.json()
  const taxon = data.results?.[0]
  const photoUrl = taxon?.default_photo?.medium_url || null

  if (photoUrl) {
    await supabase.from('bird_content').upsert(
      { bird_name: latinName, latin_name: latinName, audience: 'photo', photo_url: photoUrl, description: '' },
      { onConflict: 'bird_name,audience' }
    )
  }

  return new Response(JSON.stringify({ url: photoUrl, cached: false }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
