import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': 'https://atlas-ptakow.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { latinName, soundUrl } = await req.json()
    
    if (!latinName || typeof latinName !== 'string' || latinName.length > 100) {
      return new Response(JSON.stringify({ error: 'invalid latinName' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // If soundUrl provided directly from birds.json, use it
    // We fetch it server-side to bypass browser CORS restrictions on Xeno-canto
    if (soundUrl && typeof soundUrl === 'string' && soundUrl.startsWith('https://xeno-canto.org/')) {
      // Verify the URL works by fetching it (Supabase edge is not blocked)
      const resp = await fetch(soundUrl, {
        headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' },
        redirect: 'follow',
      })
      
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: 'sound not available' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      
      // Stream the audio back
      return new Response(resp.body, {
        headers: {
          ...cors,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
        }
      })
    }

    return new Response(JSON.stringify({ error: 'soundUrl required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
