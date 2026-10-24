-- ORGANIZADO$ · configuración inicial de Supabase
-- Pégalo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

-- 1. Tabla: una fila por usuario con todo el estado S de la app
create table if not exists public.estados (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null,
  version    bigint      not null default 1,
  updated_at timestamptz not null default now()
);

-- 2. Seguridad por fila: cada usuario solo ve y modifica su propia fila
alter table public.estados enable row level security;

drop policy if exists "leer lo propio"      on public.estados;
drop policy if exists "crear lo propio"     on public.estados;
drop policy if exists "actualizar lo propio" on public.estados;
drop policy if exists "borrar lo propio"    on public.estados;

create policy "leer lo propio"       on public.estados for select using (auth.uid() = user_id);
create policy "crear lo propio"      on public.estados for insert with check (auth.uid() = user_id);
create policy "actualizar lo propio" on public.estados for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "borrar lo propio"     on public.estados for delete using (auth.uid() = user_id);

-- 2b. Permiso de acceso por la API solo para usuarios con sesión iniciada
--     (necesario si en la creación del proyecto desmarcaste "Automatically expose new tables")
grant select, insert, update, delete on public.estados to authenticated;

-- 3. updated_at se pone solo en cada cambio
create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists estados_updated_at on public.estados;
create trigger estados_updated_at before update on public.estados
  for each row execute function public.tocar_updated_at();

-- 4. Endurecimiento (v2.4.1): quita permisos que la app no usa
revoke all on public.estados from anon;
revoke truncate, trigger, references on public.estados from authenticated;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 5. Tope de tamaño por fila (5 MB): evita que una cuenta llene el plan gratis (500 MB)
alter table public.estados drop constraint if exists estados_tamano;
alter table public.estados add constraint estados_tamano check (pg_column_size(data) < 5242880);

-- Después, en la consola (no es SQL):
--  · Authentication → Sign In / Providers → Email: activado (enlace mágico / código).
--  · Authentication → URL Configuration → Site URL: https://fisicoelectrico.github.io/organizado/
--    y agrega esa misma URL en Redirect URLs.
--  · Opcional: Authentication → Settings → desactivar "Allow new users to sign up"
--    después de que entren los 6, para que nadie más cree cuenta.
--  · Authentication → Providers → Email: activar "Prevent use of leaked passwords"
--    y subir la longitud mínima de contraseña a 10.
