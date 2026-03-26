CREATE TABLE IF NOT EXISTS nature_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,        -- 'ssaki' | 'owady' | 'drzewa'
  item_name TEXT NOT NULL,      -- Polish name e.g. "Lis"
  latin_name TEXT,
  audience TEXT NOT NULL,       -- 'przedszkolak' | 'szkolny' | 'dorosly'
  description TEXT NOT NULL,
  fun_fact TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section, item_name, audience)
);

ALTER TABLE nature_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_nature_descriptions" ON nature_descriptions FOR SELECT USING (true);
CREATE POLICY "insert_nature_descriptions" ON nature_descriptions FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS nature_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  item_name TEXT NOT NULL,
  audience TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section, item_name, audience)
);

ALTER TABLE nature_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_nature_audio" ON nature_audio FOR SELECT USING (true);
CREATE POLICY "insert_nature_audio" ON nature_audio FOR INSERT WITH CHECK (true);
