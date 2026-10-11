-- =====================================================================
-- Pesito · 0005 · Publicación atómica de promociones
-- Crea o actualiza una promoción con su comercio, medios de pago y detalle
-- (cupón / cumpleaños) en una sola transacción. Lo usan el panel admin
-- (al publicar una sugerencia aprobada) y la automatización (service role).
-- =====================================================================

create or replace function public.can_publish() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or public.is_admin();
$$;

create or replace function public.write_promotion_children(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.promotion_payment_methods where promotion_id = p_id;
  insert into public.promotion_payment_methods (promotion_id, payment_method_id)
  select p_id, pm.id from public.payment_methods pm
   where pm.slug in (select jsonb_array_elements_text(coalesce(p->'paymentMethodSlugs', '[]'::jsonb)));

  delete from public.coupon_details where promotion_id = p_id;
  if jsonb_typeof(p->'coupon') = 'object' then
    insert into public.coupon_details (promotion_id, redemption, code, new_customers_only, requires_external_signup, external_platform)
    values (p_id, p->'coupon'->>'redemption', nullif(p->'coupon'->>'code', ''),
            coalesce((p->'coupon'->>'newCustomersOnly')::boolean, true),
            coalesce((p->'coupon'->>'requiresExternalSignup')::boolean, false),
            nullif(p->'coupon'->>'externalPlatform', ''));
  end if;

  delete from public.birthday_details where promotion_id = p_id;
  if jsonb_typeof(p->'birthday') = 'object' then
    insert into public.birthday_details (promotion_id, window_kind, days_before, days_after, benefit, loyalty_program)
    values (p_id, p->'birthday'->>'windowKind',
            coalesce((p->'birthday'->>'daysBefore')::smallint, 0),
            coalesce((p->'birthday'->>'daysAfter')::smallint, 0),
            p->'birthday'->>'benefit', nullif(p->'birthday'->>'loyaltyProgram', ''));
  end if;
end $$;

create or replace function public.promotion_columns_from_payload(p jsonb)
returns table (
  kind public.promo_kind, audience public.promo_audience, title text, summary text,
  discount_kind public.discount_kind, discount_value numeric, cap_amount numeric, cap_period public.cap_period,
  min_purchase numeric, valid_from date, valid_until date, days_of_week smallint[], channel public.sales_channel,
  conditions text, requirements text[], source_url text, external_id text
)
language sql immutable as $$
  select
    (p->>'kind')::public.promo_kind,
    coalesce(p->>'audience', 'todos')::public.promo_audience,
    p->>'title',
    nullif(p->>'summary', ''),
    (p->>'discountKind')::public.discount_kind,
    (p->>'discountValue')::numeric,
    (p->>'capAmount')::numeric,
    case when p->>'capAmount' is null then 'sin_tope' else coalesce(p->>'capPeriod', 'mes') end::public.cap_period,
    (p->>'minPurchase')::numeric,
    (p->>'validFrom')::date,
    (p->>'validUntil')::date,
    case when jsonb_typeof(p->'daysOfWeek') = 'array'
         then array(select jsonb_array_elements_text(p->'daysOfWeek')::smallint) end,
    coalesce(p->>'channel', 'ambos')::public.sales_channel,
    nullif(p->>'conditions', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'requirements', '[]'::jsonb))), '{}'),
    nullif(p->>'sourceUrl', ''),
    nullif(p->>'externalId', '');
$$;

create or replace function public.publish_promotion(
  p_payload jsonb, p_fingerprint text, p_merchant_slug text,
  p_source_id uuid default null, p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_id uuid; c record;
begin
  if not public.can_publish() then
    raise exception 'No tenés permiso para publicar' using errcode = '42501';
  end if;

  insert into public.merchants (slug, name, category_id)
  values (p_merchant_slug, p_payload->>'merchantName',
          (select id from public.categories where slug = p_payload->>'categorySlug'))
  on conflict (slug) do update set name = public.merchants.name
  returning id into v_merchant;

  select * into c from public.promotion_columns_from_payload(p_payload);

  insert into public.promotions (
    kind, audience, merchant_id, title, summary, discount_kind, discount_value, cap_amount, cap_period,
    min_purchase, valid_from, valid_until, days_of_week, channel, conditions, requirements,
    source_id, source_url, external_id, status, fingerprint, last_verified_at, created_by
  ) values (
    c.kind, c.audience, v_merchant, c.title, c.summary, c.discount_kind, c.discount_value, c.cap_amount, c.cap_period,
    c.min_purchase, c.valid_from, c.valid_until, c.days_of_week, c.channel, c.conditions, c.requirements,
    p_source_id, c.source_url, c.external_id, 'publicada', p_fingerprint, now(), p_actor
  ) returning id into v_id;

  perform public.write_promotion_children(v_id, p_payload);
  return v_id;
end $$;

create or replace function public.update_promotion_from_payload(p_id uuid, p_payload jsonb, p_fingerprint text)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.can_publish() then
    raise exception 'No tenés permiso para editar' using errcode = '42501';
  end if;
  select * into c from public.promotion_columns_from_payload(p_payload);
  update public.promotions set
    kind = c.kind, audience = c.audience, title = c.title, summary = c.summary,
    discount_kind = c.discount_kind, discount_value = c.discount_value, cap_amount = c.cap_amount,
    cap_period = c.cap_period, min_purchase = c.min_purchase, valid_from = c.valid_from,
    valid_until = c.valid_until, days_of_week = c.days_of_week, channel = c.channel,
    conditions = c.conditions, requirements = c.requirements, source_url = c.source_url,
    fingerprint = p_fingerprint, last_verified_at = now()
  where id = p_id;
  perform public.write_promotion_children(p_id, p_payload);
end $$;

revoke execute on function public.write_promotion_children(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.publish_promotion(jsonb, text, text, uuid, uuid) from public, anon;
revoke execute on function public.update_promotion_from_payload(uuid, jsonb, text) from public, anon;
grant execute on function public.publish_promotion(jsonb, text, text, uuid, uuid) to authenticated;
grant execute on function public.update_promotion_from_payload(uuid, jsonb, text) to authenticated;
