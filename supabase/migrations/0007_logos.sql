-- =====================================================================
-- Pesito · 0007 · Logos de comercios
-- Bucket público (los logos se ven en la app) donde solo el admin sube.
-- Hasta 1 MB, PNG/JPG/WEBP. El logo solo se muestra si merchants.logo_authorized.
-- Íconos de rubro nuevos: transporte → colectivo, educación → libro.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_admin_insert on storage.objects;
create policy logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_admin());

drop policy if exists logos_admin_update on storage.objects;
create policy logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_admin());

drop policy if exists logos_admin_delete on storage.objects;
create policy logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_admin());

update public.categories set icon = 'bus'  where slug = 'transporte';
update public.categories set icon = 'book' where slug = 'educacion';
