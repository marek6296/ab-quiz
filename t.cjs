const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://qhyctkfiycvjmjryofag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoeWN0a2ZpeWN2am1qcnlvZmFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njc1MTEsImV4cCI6MjA4ODA0MzUxMX0.w0YpyWP0Vtvf_tQcB2SO4ERkOSdON-f5Xld78VMdtto'
);
(async () => {
   const { data: lobbies } = await supabase.from('platform_lobbies').select('id').limit(1);
   const id = lobbies[0]?.id;
   if (!id) return;
   const { data, error } = await supabase.from('platform_lobbies').update({ status: 'countdown' }).eq('id', id);
   console.log('Update return:', { data, error });
})();
