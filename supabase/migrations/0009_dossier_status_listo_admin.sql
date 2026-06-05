-- Separada de 0010: Postgres no permite añadir un valor de enum y usarlo en la
-- misma transacción.
alter type public.dossier_status add value if not exists 'listo_admin';
