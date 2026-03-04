const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
      .from('bilionar_players')
      .select('game_id, bilionar_games!inner(*)')
      .limit(5);
  console.log(JSON.stringify({ data, error }, null, 2));
}
test();
