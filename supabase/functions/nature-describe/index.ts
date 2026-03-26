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

const AUDIENCE_PROMPTS: Record<string, string> = {
  przedszkolak: 'Napisz opis dla dziecka w wieku 4-6 lat. Używaj prostych słów, krótkich zdań. Max 3 zdania. Bądź wesoły i ciekawy!',
  szkolny: 'Napisz opis dla dziecka w wieku 7-12 lat. Użyj ciekawostek przyrodniczych. Max 5 zdań.',
  dorosly: 'Napisz szczegółowy opis przyrodniczy. Zawrzyj informacje o biologii, środowisku i zachowaniu. Max 8 zdań.',
};

const SECTION_CONTEXT: Record<string, string> = {
  ssaki: 'ssak żyjący w Polsce',
  owady: 'owad lub inny bezkręgowiec żyjący w Polsce',
  drzewa: 'drzewo lub krzew rosnący w Polsce',
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { itemName, latinName, section, audience } = await req.json();

    if (!itemName || !section || !audience) {
      return new Response(JSON.stringify({ error: 'itemName, section, audience required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check cache
    const { data: cached } = await supabase
      .from('nature_descriptions')
      .select('description, fun_fact')
      .eq('section', section)
      .eq('item_name', itemName)
      .eq('audience', audience)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate with OpenAI
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY not set');

    const sectionCtx = SECTION_CONTEXT[section] || section;
    const audiencePrompt = AUDIENCE_PROMPTS[audience] || AUDIENCE_PROMPTS.dorosly;

    const prompt = `${itemName} (${latinName || ''}) to ${sectionCtx}.
${audiencePrompt}
Na końcu dodaj jedną krótką ciekawostkę zaczynającą się od "Ciekawostka:".
Odpowiedz w formacie JSON: {"description": "...", "fun_fact": "..."}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      }),
    });

    const openaiData = await openaiRes.json();
    const content = JSON.parse(openaiData.choices[0].message.content);

    // Cache result
    await supabase.from('nature_descriptions').upsert({
      section,
      item_name: itemName,
      latin_name: latinName,
      audience,
      description: content.description,
      fun_fact: content.fun_fact,
    });

    return new Response(JSON.stringify(content), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
