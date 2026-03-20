import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { birdName, latinName, audience } = await req.json()
  // audience: 'przedszkolak' | 'szkolny' | 'dorosly'

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Check cache
  const { data: cached } = await supabase
    .from('bird_content')
    .select('description')
    .eq('bird_name', birdName)
    .eq('audience', audience)
    .not('description', 'is', null)
    .maybeSingle()

  if (cached?.description) {
    return new Response(JSON.stringify({ description: cached.description, cached: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Fetch Wikipedia summary (English)
  const wikiRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(latinName.replace(' ', '_'))}`,
    { headers: { 'User-Agent': 'AtlasPtakow/1.0 (educational)' } }
  )
  const wikiData = await wikiRes.json()
  const wikiText = wikiData.extract || `${birdName} is a bird species found in Poland.`

  const audiencePrompts: Record<string, string> = {
    przedszkolak: `Jesteś pomocnym asystentem piszącym o ptakach dla dzieci w wieku 4-6 lat. Napisz opis ptaka "${birdName}" po polsku używając BARDZO prostych słów, krótkich zdań, wesołego tonu. Maks 3-4 zdania. Możesz dodać jeden lub dwa emoji. Nie używaj trudnych słów naukowych.`,
    szkolny: `Jesteś pomocnym asystentem piszącym o ptakach dla dzieci w klasach 1-3 (7-9 lat). Napisz popularno-naukowy opis ptaka "${birdName}" po polsku. Używaj prostego języka ale możesz wspomnieć kilka ciekawych faktów. Maks 4-5 zdań. Pisz w przystępny, ciekawy sposób.`,
    dorosly: `Napisz popularno-naukowy opis ptaka "${birdName}" po polsku dla dorosłych. Styl: przystępny, informacyjny, bez żargonu naukowego. Wspomnij o wyglądzie, siedlisku, zwyczajach. Maks 5-6 zdań.`
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')!
  const aiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      instructions: audiencePrompts[audience] || audiencePrompts['dorosly'],
      input: `Na podstawie tych informacji z Wikipedii napisz opis:\n${wikiText}`,
      max_output_tokens: 200,
      temperature: 0.7,
      store: false,
    })
  })
  const aiData = await aiRes.json()
  const description = aiData.output?.[0]?.content?.[0]?.text?.trim()
    || aiData.output_text?.trim()
    || `Informacje o ptaku ${birdName} są niedostępne.`

  // Save to cache
  await supabase.from('bird_content').upsert(
    { bird_name: birdName, latin_name: latinName, audience, description },
    { onConflict: 'bird_name,audience' }
  )

  return new Response(JSON.stringify({ description, cached: false }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
