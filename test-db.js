import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
supabase.from('games').select('*').eq('id', 'fec54a44-edd6-40ec-93d1-ee261c5d003d').then(res => console.log(res.data?.length))
