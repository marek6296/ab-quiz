-- We need to drop existing tables if they depend on this to cleanly apply
-- This is a destructive migration for platform_lobbies, so we will drop and recreate
-- in a specific order to avoid dependency issues.

-- Drop constraints first
ALTER TABLE IF EXISTS platform_lobbies DROP CONSTRAINT IF EXISTS fk_active_match;

DROP TABLE IF EXISTS match_players CASCADE;
DROP TABLE IF EXISTS platform_matches CASCADE;
DROP TABLE IF EXISTS lobby_members CASCADE;

-- We already have platform_lobbies and platform_players.
-- Let's rename platform_players to lobby_members logically by dropping and creating
DROP TABLE IF EXISTS platform_players CASCADE;

-- Recreate types safely
DO $$ BEGIN
    CREATE TYPE platform_lobby_status AS ENUM ('waiting', 'starting', 'in_game', 'post_game', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE platform_lobby_game AS ENUM ('quiz', 'bilionar', 'higher_lower');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lobby_member_role AS ENUM ('host', 'member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lobby_member_state AS ENUM ('in_lobby', 'in_game', 'disconnected', 'left', 'invited');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE platform_match_type AS ENUM ('quiz', 'bilionar', 'higher_lower');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE platform_match_status AS ENUM ('preparing', 'live', 'finished', 'aborted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_end_reason AS ENUM ('normal', 'forfeit', 'host_left', 'timeout', 'aborted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_player_state AS ENUM ('active', 'eliminated', 'left', 'disconnected', 'finished');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Alter platform_lobbies
ALTER TABLE platform_lobbies DROP COLUMN IF EXISTS status;
ALTER TABLE platform_lobbies ADD COLUMN status platform_lobby_status DEFAULT 'waiting';

ALTER TABLE platform_lobbies DROP COLUMN IF EXISTS selected_game; 
ALTER TABLE platform_lobbies ADD COLUMN selected_game platform_lobby_game DEFAULT 'quiz';

ALTER TABLE platform_lobbies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE platform_lobbies ADD COLUMN IF NOT EXISTS active_match_id UUID DEFAULT NULL;
ALTER TABLE platform_lobbies ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE platform_lobbies ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE platform_lobbies ADD COLUMN IF NOT EXISTS lobby_ttl_expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create lobby_members
CREATE TABLE lobby_members (
    lobby_id UUID REFERENCES platform_lobbies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role lobby_member_role DEFAULT 'member',
    state lobby_member_state DEFAULT 'in_lobby',
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    connected_client_id TEXT,
    joined_at TIMESTAMPTZ DEFAULT now(),
    left_at TIMESTAMPTZ DEFAULT NULL,
    PRIMARY KEY (lobby_id, user_id)
);

-- 3. Create platform_matches
CREATE TABLE platform_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lobby_id UUID REFERENCES platform_lobbies(id) ON DELETE CASCADE,
    game_type platform_match_type NOT NULL,
    status platform_match_status DEFAULT 'preparing',
    started_at TIMESTAMPTZ DEFAULT NULL,
    finished_at TIMESTAMPTZ DEFAULT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    winner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason_end match_end_reason DEFAULT NULL,
    min_players INT DEFAULT 2,
    max_players INT DEFAULT 4,
    seed INT DEFAULT floor(random() * 1000000)::int,
    snapshot_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK securely
BEGIN;
ALTER TABLE platform_lobbies ADD CONSTRAINT fk_active_match FOREIGN KEY (active_match_id) REFERENCES platform_matches(id) ON DELETE SET NULL;
COMMIT;

-- 4. Create match_players
CREATE TABLE match_players (
    match_id UUID REFERENCES platform_matches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    state match_player_state DEFAULT 'active',
    score INT DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now(),
    left_at TIMESTAMPTZ DEFAULT NULL,
    forfeit BOOLEAN DEFAULT false,
    PRIMARY KEY (match_id, user_id)
);

-- 5. Helper Function for Host Transfer
CREATE OR REPLACE FUNCTION transfer_host_on_leave()
RETURNS TRIGGER AS $$
DECLARE
    new_host UUID;
BEGIN
    IF OLD.role = 'host' AND NEW.state = 'left' THEN
        -- Find the oldest remaining member who is not 'left'
        SELECT user_id INTO new_host
        FROM lobby_members
        WHERE lobby_id = NEW.lobby_id
          AND state != 'left'
        ORDER BY joined_at ASC
        LIMIT 1;

        IF new_host IS NOT NULL THEN
            UPDATE lobby_members SET role = 'host' WHERE lobby_id = NEW.lobby_id AND user_id = new_host;
            UPDATE platform_lobbies SET host_user_id = new_host WHERE id = NEW.lobby_id;
        ELSE
            -- No one left, close lobby
            UPDATE platform_lobbies SET status = 'closed', closed_at = now() WHERE id = NEW.lobby_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_host_transfer ON lobby_members;
CREATE TRIGGER trigger_host_transfer
AFTER UPDATE OF state ON lobby_members
FOR EACH ROW
WHEN (OLD.state != 'left' AND NEW.state = 'left')
EXECUTE FUNCTION transfer_host_on_leave();

-- Setup RLS (Basic)
ALTER TABLE lobby_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON lobby_members;
CREATE POLICY "Public profiles are viewable by everyone." ON lobby_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own lobby membership." ON lobby_members;
CREATE POLICY "Users can insert their own lobby membership." ON lobby_members FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own lobby membership." ON lobby_members;
CREATE POLICY "Users can update their own lobby membership." ON lobby_members FOR UPDATE USING (auth.uid() = user_id);
-- Allow host to update others (e.g. kicking, if later implemented), but for now anyone can update for simplicity or rely on server

DROP POLICY IF EXISTS "Enable read access for all" ON platform_matches;
CREATE POLICY "Enable read access for all" ON platform_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert access for all" ON platform_matches;
CREATE POLICY "Enable insert access for all" ON platform_matches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Enable update access for all" ON platform_matches;
CREATE POLICY "Enable update access for all" ON platform_matches FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Enable read access for all" ON match_players;
CREATE POLICY "Enable read access for all" ON match_players FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert access for all" ON match_players;
CREATE POLICY "Enable insert access for all" ON match_players FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Enable update access for all" ON match_players;
CREATE POLICY "Enable update access for all" ON match_players FOR UPDATE USING (true);

