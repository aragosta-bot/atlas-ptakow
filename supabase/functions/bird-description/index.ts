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
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { birdName, description } = await req.json()
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
  const openaiKey = Deno.env.get('OPENAI_API_KEY')!
  
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check cache first
  const { data: cached } = await supabase
    .from('bird_descriptions')
    .select('description_child')
    .eq('bird_name', birdName)
    .single()

  if (cached) {
    return new Response(JSON.stringify({ description: cached.description_child, cached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Generate with AI
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini-2026-03-17',
      instructions: 'Jesteś pomocnym asystentem który pisze opisy ptaków dla dzieci w wieku 4-7 lat. Używasz bardzo prostych słów, krótkich zdań, pozytywnego tonu. Maks 3 zdania. Możesz dodać jeden emoji na końcu.',
      input: `Przepisz ten opis ptaka "${birdName}" dla dziecka w wieku 4-7 lat, bardzo prosto i radośnie:\n${description}`,
      max_output_tokens: 150,
      store: false,
    })
  })
  
  const data = await response.json()
  const childDescription = data.output?.[0]?.content?.[0]?.text?.trim() ?? data.output_text?.trim()

  // Save to cache
  await supabase.from('bird_descriptions').insert({ bird_name: birdName, description_child: childDescription })

  return new Response(JSON.stringify({ description: childDescription, cached: false }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
