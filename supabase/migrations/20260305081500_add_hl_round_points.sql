ALTER TABLE public.higher_lower_players
ADD COLUMN IF NOT EXISTS round_points_awarded INTEGER DEFAULT 0;