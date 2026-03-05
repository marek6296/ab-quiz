CREATE TABLE IF NOT EXISTS public.higher_lower_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.higher_lower_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.higher_lower_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    image TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.higher_lower_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.higher_lower_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read hl categories" ON public.higher_lower_categories FOR
SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admins to manage hl categories" ON public.higher_lower_categories FOR ALL USING (
    (
        SELECT is_admin
        FROM public.profiles
        WHERE id = auth.uid()
    ) = true
);
CREATE POLICY "Allow authenticated users to read hl items" ON public.higher_lower_items FOR
SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admins to manage hl items" ON public.higher_lower_items FOR ALL USING (
    (
        SELECT is_admin
        FROM public.profiles
        WHERE id = auth.uid()
    ) = true
);