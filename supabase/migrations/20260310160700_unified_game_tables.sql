-- Unified game sessions for all game types
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_type TEXT NOT NULL CHECK (game_type IN ('higher_lower', 'quiz_duel', 'millionaire')),
  host_id UUID REFERENCES auth.users(id),
  join_code TEXT,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished','cancelled','abandoned')),
  state JSONB DEFAULT '{}',
  difficulty INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Players in a game session
CREATE TABLE IF NOT EXISTS game_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  player_name TEXT,
  score INTEGER DEFAULT 0,
  last_answer JSONB,
  answer_time REAL,
  alive BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unified game invites
CREATE TABLE IF NOT EXISTS game_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  from_user_id UUID REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game_sessions" ON game_sessions FOR SELECT USING (true);
CREATE POLICY "Auth users can insert game_sessions" ON game_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can update game_sessions" ON game_sessions FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can read game_players" ON game_players FOR SELECT USING (true);
CREATE POLICY "Auth users can insert game_players" ON game_players FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can update game_players" ON game_players FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can read game_invites" ON game_invites FOR SELECT USING (true);
CREATE POLICY "Auth users can insert game_invites" ON game_invites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can update game_invites" ON game_invites FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Enable Realtime
ALTER TABLE game_sessions REPLICA IDENTITY FULL;
ALTER TABLE game_players REPLICA IDENTITY FULL;
ALTER TABLE game_invites REPLICA IDENTITY FULL;
