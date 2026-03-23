# Atlas Polskich Ptaków — PROJECT.md

## O projekcie
Interaktywny atlas edukacyjny dla dzieci (4-12 lat) i rodziców. 96 gatunków polskich ptaków ze zdjęciami, dźwiękami i opisami generowanymi przez AI w 3 grupach wiekowych.

## Status
✅ Gotowy do publicznego wypuszczenia (po spending limits)

## Linki
- Live: https://atlas-ptakow.vercel.app
- Repo: https://github.com/aragosta-bot/atlas-ptakow
- Supabase: cbathyxszczmajuwdrll

## Stack
- Frontend: HTML/JS/CSS (statyczny, GitHub Pages + Vercel)
- Supabase Edge Functions: bird-describe, bird-tts, bird-sound, bird-photo
- OpenAI gpt-5.4-mini — generowanie opisów per grupa wiekowa
- ElevenLabs (głos Maria) — TTS z cachowaniem
- iNaturalist API — zdjęcia ptaków
- Xeno-canto v3 API — nagrania dźwięków (proxy przez Edge Function — Xeno-canto nie ma CORS)

## Pliki kluczowe
- `birds.json` — dane 96 ptaków (rank, name, latin, emoji, habitat, teaser, coverPhoto, soundUrl)
- `index.html` — cała aplikacja
- `supabase/functions/` — 4 Edge Functions
- `DESIGN.md` — dokumentacja nie istnieje (TODO)
- `SECURITY_AUDIT.md` — raport bezpieczeństwa

## Ustalenia / Decyzje

### 2026-03-20
- Wybrany design: "Living Scrapbook" z Google Stitch — ciepły różowy (Kinetic Hearth)
- Zdjęcia: iNaturalist API (darmowe, bez CORS)
- Dźwięki: Xeno-canto v3 z kluczem API (wybieramy MP3 zamiast WAV)
- TTS: ElevenLabs głos Maria (Quiet and Gentle), model eleven_multilingual_v2
- Cachowanie audio: base64 w tabeli bird_audio (Supabase Storage niedostępne na free tier)
- Font: Nunito (Fredoka One nie obsługuje polskich znaków)

### 2026-03-21
- OCR faktur rozważany ale odrzucony z powodów GDPR
- Lightbox zamiast galerii w modalu
- 3 taby opisów: Maluch (4-6 lat) / Szkoła (7-9 lat) / Dorosły
- birds.json zamiast hardcoded danych w HTML

### Dźwięki Xeno-canto (2026-03-23)
Xeno-canto nie ma nagłówków CORS — przeglądarka blokuje direct Audio() z ich URL.
Rozwiązanie: Edge Function bird-sound streamuje audio serwerowo jako proxy (`audio/mpeg`).
Frontend wysyła `soundUrl` z birds.json → Edge Function pobiera z Xeno-canto → streamuje do przeglądarki.

### Security (2026-03-23)
- Security audit: 2 krytyczne, 3 wysokie
- Naprawione: RLS writes, CORS restricted, input validation
- Remaining: spending limits (ręcznie w OpenAI/ElevenLabs), rate limiting (nice to have)
- Verdict: bezpieczny do release po spending limits

## TODO
- [ ] Ustawić spending limits: OpenAI ($20 hard limit) + ElevenLabs
- [ ] Dodać rate limiting na Edge Functions (Upstash Redis lub DB counter)
- [ ] Dodać więcej ptaków (cel: 100)
- [ ] Opisać design system w DESIGN.md
