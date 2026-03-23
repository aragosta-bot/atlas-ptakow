import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': 'https://atlas-ptakow.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { latinName } = await req.json()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Check cache (store as JSON array in photo_url)
  const { data: cached } = await supabase
    .from('bird_content')
    .select('photo_url')
    .eq('latin_name', latinName)
    .eq('audience', 'photo')
    .not('photo_url', 'is', null)
    .maybeSingle()

  if (cached?.photo_url) {
    try {
      const urls = JSON.parse(cached.photo_url)
      return new Response(JSON.stringify({ urls, cached: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    } catch {}
  }

  // Fetch from iNaturalist — get taxon with multiple photos
  const res = await fetch(
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(latinName)}&per_page=1`,
    { headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' } }
  )
  const data = await res.json()
  const taxon = data.results?.[0]
  
  // Collect up to 5 photo URLs
  const urls: string[] = []
  
  // Default photo
  if (taxon?.default_photo?.medium_url) urls.push(taxon.default_photo.medium_url)
  
  // Additional taxon photos
  if (taxon?.taxon_photos) {
    for (const tp of taxon.taxon_photos.slice(0, 4)) {
      const url = tp.photo?.medium_url
      if (url && !urls.includes(url)) urls.push(url)
    }
  }

  // Also fetch observations for more variety
  if (urls.length < 5) {
    const obsRes = await fetch(
      `https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(latinName)}&quality_grade=research&per_page=5&photos=true&order_by=votes`,
      { headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' } }
    )
    const obsData = await obsRes.json()
    for (const obs of obsData.results || []) {
      for (const photo of obs.photos || []) {
        const url = photo.url?.replace('square', 'medium')
        if (url && !urls.includes(url) && urls.length < 5) urls.push(url)
      }
    }
  }

  if (urls.length > 0) {
    await supabase.from('bird_content').upsert(
      { bird_name: latinName, latin_name: latinName, audience: 'photo', photo_url: JSON.stringify(urls), description: '' },
      { onConflict: 'bird_name,audience' }
    )
  }

  return new Response(JSON.stringify({ urls: urls.slice(0, 5), cached: false }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
