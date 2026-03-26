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

  const { birdName, latinName, audience } = await req.json()

  if (!birdName || typeof birdName !== 'string' || birdName.length > 100) {
    return new Response(JSON.stringify({ error: 'invalid birdName' }), { status: 400, headers: cors })
  }
  if (!latinName || typeof latinName !== 'string' || latinName.length > 100) {
    return new Response(JSON.stringify({ error: 'invalid latinName' }), { status: 400, headers: cors })
  }
  const validAudiences = ['przedszkolak', 'szkolny', 'dorosly']
  if (!validAudiences.includes(audience)) {
    return new Response(JSON.stringify({ error: 'invalid audience' }), { status: 400, headers: cors })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Check cache
  const { data: cached } = await supabase
    .from('bird_content')
    .select('description, fun_fact')
    .eq('bird_name', birdName)
    .eq('audience', audience)
    .not('description', 'is', null)
    .maybeSingle()

  if (cached?.description) {
    return new Response(JSON.stringify({ description: cached.description, fun_fact: cached.fun_fact, cached: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Fetch Wikipedia (English)
  const wikiRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(latinName.replace(' ', '_'))}`,
    { headers: { 'User-Agent': 'AtlasPtakow/1.0 educational' } }
  )
  const wikiData = await wikiRes.json()
  const wikiText = wikiData.extract || `${birdName} is a bird species found in Poland.`

  const audiencePrompts: Record<string, string> = {
    przedszkolak: `Jesteś pomocnym asystentem piszącym o ptakach dla dzieci w wieku 4-6 lat. Napisz JSON z dwoma polami:
- "description": opis ptaka "${birdName}" po polsku, BARDZO proste słowa, krótkie zdania, wesoły ton, maks 3 zdania, można dodać emoji
- "fun_fact": jedno zdanie zaczynające się od "Czy wiesz, że..." — zabawny fakt dla maluszka

Odpowiedz TYLKO czystym JSON bez markdown.`,
    szkolny: `Jesteś pomocnym asystentem piszącym o ptakach dla dzieci w klasach 1-3. Napisz JSON z dwoma polami:
- "description": popularno-naukowy opis ptaka "${birdName}" po polsku, prosty język, ciekawe fakty, maks 4 zdania
- "fun_fact": jedno zdanie zaczynające się od "Czy wiesz, że..." — zaskakujący fakt naukowy dla ucznia

Odpowiedz TYLKO czystym JSON bez markdown.`,
    dorosly: `Napisz JSON z dwoma polami po polsku:
- "description": popularno-naukowy opis ptaka "${birdName}" dla dorosłych, przystępny styl, wygląd + siedlisko + zwyczaje, maks 5 zdań
- "fun_fact": jedno zdanie zaczynające się od "Czy wiesz, że..." — mniej znany, ciekawy fakt naukowy

Odpowiedz TYLKO czystym JSON bez markdown.`
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')!
  const aiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini-2026-03-17',
      instructions: audiencePrompts[audience] || audiencePrompts['dorosly'],
      input: `Na podstawie tych informacji z Wikipedii napisz opis:\n${wikiText}`,
      max_output_tokens: 300,
      temperature: 0.7,
      store: false,
    })
  })
  const aiData = await aiRes.json()
  const rawText = (aiData.output?.[0]?.content?.[0]?.text || aiData.output_text || "{}").trim()
  
  let description = `Informacje o ptaku ${birdName} są niedostępne.`
  let fun_fact = null
  
  try {
    const parsed = JSON.parse(rawText)
    description = parsed.description || description
    fun_fact = parsed.fun_fact || null
  } catch {
    description = rawText
  }

  await supabase.from('bird_content').upsert(
    { bird_name: birdName, latin_name: latinName, audience, description, fun_fact },
    { onConflict: 'bird_name,audience' }
  )

  return new Response(JSON.stringify({ description, fun_fact, cached: false }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
