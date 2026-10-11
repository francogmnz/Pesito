-- =====================================================================
-- Pesito · 0004 · Almacenamiento de capturas de sugerencias
-- Bucket privado: cada persona sube solo a su carpeta; el admin puede leer todo.
-- Límite de 5 MB y solo imágenes JPG, PNG o WEBP.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sugerencias', 'sugerencias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy sugerencias_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'sugerencias' and (storage.foldername(name))[1] = auth.uid()::text);

create policy sugerencias_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'sugerencias' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
