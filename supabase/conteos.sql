-- ORGANIZADO$ · cuántos usuarios y cuántos movimientos (solo conteos, sin montos ni descripciones)
-- Pégalo en Supabase → SQL Editor → New query → Run.
select row_number() over (order by u.created_at)                          as n,
       left(split_part(u.email,'@',1),2)||'***@'||split_part(u.email,'@',2) as correo,
       u.created_at::date                                                  as alta,
       u.last_sign_in_at::date                                             as ultimo_login,
       u.email_confirmed_at is not null                                    as confirmado,
       coalesce(jsonb_array_length(e.data->'movs'),0)                      as movimientos,
       e.updated_at::date                                                  as ultima_sincronizacion
from auth.users u left join public.estados e on e.user_id = u.id
order by u.created_at;

-- Totales
select count(*)                                             as usuarios,
       count(e.user_id)                                     as con_datos_en_la_nube,
       coalesce(sum(jsonb_array_length(e.data->'movs')),0)  as movimientos
from auth.users u left join public.estados e on e.user_id = u.id;
