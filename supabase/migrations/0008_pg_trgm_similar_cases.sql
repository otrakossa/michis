-- Similitud de texto entre casos (señal de copypasta/granja).
create extension if not exists pg_trgm with schema extensions;

create function public.find_similar_cases(p_texto text, p_exclude_case uuid)
returns table (case_id uuid, handle text, similarity real)
language sql
stable
as $$
  select c.id, c.handle,
         extensions.similarity(coalesce(c.notes, ''), p_texto) as similarity
  from public.cases c
  where c.id <> p_exclude_case
    and extensions.similarity(coalesce(c.notes, ''), p_texto) > 0.1
  order by similarity desc
  limit 5;
$$;

-- La llama solo el worker (service role); no se expone a clientes.
revoke execute on function public.find_similar_cases(text, uuid) from public, anon, authenticated;
grant execute on function public.find_similar_cases(text, uuid) to service_role;
