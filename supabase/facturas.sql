-- ORGANIZADO$ · Facturas e historial de precios (fase 1, v3.0)
-- Solo administradores: toda tabla exige auth.uid() = user_id Y es_admin().
-- Se puede correr más de una vez.

-- 1. Administradores (nadie la lee por la API; se consulta con es_admin())
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid())
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- 2. Productos canónicos ("Crema de leche") con su unidad base
create table if not exists public.productos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  unidad     text not null default 'und' check (unidad in ('kg','l','und')),
  created_at timestamptz not null default now()
);
create unique index if not exists productos_nombre_u on public.productos (user_id, lower(nombre));

-- 3. Alias: texto tal como sale en la factura -> producto (se aprende al confirmar)
create table if not exists public.alias_productos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 120),
  producto_id bigint not null references public.productos(id) on delete cascade,
  unique (user_id, texto)
);
create index if not exists alias_producto_i on public.alias_productos (producto_id);

-- 4. Facturas
create table if not exists public.facturas (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tienda     text check (char_length(tienda) <= 80),
  fecha      date not null,
  total      numeric(14,2),
  created_at timestamptz not null default now()
);
create index if not exists facturas_user_fecha on public.facturas (user_id, fecha desc);

-- 5. Líneas de la factura. precio_base = precio por kg, litro o unidad
create table if not exists public.items_factura (
  id             bigint generated always as identity primary key,
  factura_id     bigint not null references public.facturas(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  producto_id    bigint references public.productos(id) on delete set null,
  texto_original text check (char_length(texto_original) <= 120),
  cantidad       numeric(10,3) not null default 1 check (cantidad > 0),
  contenido      numeric(10,3) not null default 1 check (contenido > 0),
  precio_total   numeric(14,2) not null check (precio_total >= 0),
  precio_base    numeric(14,2) generated always as (precio_total / (cantidad * contenido)) stored
);
create index if not exists items_factura_i on public.items_factura (factura_id);
create index if not exists items_producto_i on public.items_factura (producto_id);

-- 6. Registro de lecturas con IA (para el tope diario de la Edge Function)
create table if not exists public.lecturas_factura (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lecturas_user_t on public.lecturas_factura (user_id, created_at desc);

-- 7. Seguridad por fila: lo propio y solo si eres administrador
do $$ declare t text; begin
  foreach t in array array['productos','alias_productos','facturas','items_factura','lecturas_factura'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin lo propio" on public.%I', t);
    execute format('create policy "admin lo propio" on public.%I for all to authenticated
                    using ((select auth.uid()) = user_id and (select public.es_admin()))
                    with check ((select auth.uid()) = user_id and (select public.es_admin()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke update, delete on public.lecturas_factura from authenticated;

-- 8. Resumen de precios por producto (últimos 90 días; respeta RLS)
create or replace view public.precios_resumen with (security_invoker = true) as
select p.id as producto_id, p.nombre, p.unidad,
       count(i.id)                                                         as n,
       percentile_cont(0.5) within group (order by i.precio_base)          as mediana,
       min(i.precio_base)                                                  as minimo,
       max(i.precio_base)                                                  as maximo,
       (array_agg(i.precio_base order by f.fecha desc, i.id desc))[1]      as ultimo,
       (array_agg(f.tienda      order by f.fecha desc, i.id desc))[1]      as ultima_tienda,
       max(f.fecha)                                                        as ultima_fecha
from public.productos p
join public.items_factura i on i.producto_id = p.id
join public.facturas f      on f.id = i.factura_id and f.fecha >= current_date - 90
group by p.id, p.nombre, p.unidad;
revoke all on public.precios_resumen from anon;
grant select on public.precios_resumen to authenticated;

-- 9. Guardar una factura revisada en una sola transacción
--    p = {tienda, fecha, total, items:[{texto, producto, unidad, cantidad, contenido, precio_total}]}
create or replace function public.guardar_factura(p jsonb) returns bigint
language plpgsql security invoker set search_path = public as $$
declare fid bigint; it jsonb; pid bigint; nom text; txt text;
begin
  if not public.es_admin() then raise exception 'solo administrador'; end if;
  if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then raise exception 'la factura no tiene productos'; end if;
  insert into facturas (tienda, fecha, total)
  values (nullif(left(trim(p->>'tienda'),80),''), coalesce(nullif(p->>'fecha','')::date, current_date), nullif(p->>'total','')::numeric)
  returning id into fid;
  for it in select * from jsonb_array_elements(p->'items') loop
    nom := nullif(left(trim(it->>'producto'),80),'');
    txt := nullif(left(lower(trim(it->>'texto')),120),'');
    pid := null;
    if nom is not null then
      select id into pid from productos where user_id = auth.uid() and lower(nombre) = lower(nom);
      if pid is null then
        insert into productos (nombre, unidad)
        values (nom, coalesce(nullif(it->>'unidad',''),'und')) returning id into pid;
      end if;
      if txt is not null then
        insert into alias_productos (texto, producto_id) values (txt, pid)
        on conflict (user_id, texto) do update set producto_id = excluded.producto_id;
      end if;
    end if;
    insert into items_factura (factura_id, producto_id, texto_original, cantidad, contenido, precio_total)
    values (fid, pid, left(it->>'texto',120),
            coalesce(nullif(it->>'cantidad','')::numeric, 1),
            coalesce(nullif(it->>'contenido','')::numeric, 1),
            (it->>'precio_total')::numeric);
  end loop;
  return fid;
end $$;
revoke all on function public.guardar_factura(jsonb) from public, anon;
grant execute on function public.guardar_factura(jsonb) to authenticated;

-- 10. Dar permiso de administrador (corre esto aparte con el correo de la cuenta):
-- insert into public.admins (user_id) select id from auth.users where email = 'TU_CORREO' on conflict do nothing;
