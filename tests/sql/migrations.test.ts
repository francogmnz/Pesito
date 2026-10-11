/**
 * Valida las migraciones de Supabase contra un Postgres real (PGlite, en memoria).
 * Se simula lo mínimo de Supabase: esquema auth, auth.uid(), roles anon/authenticated
 * y sus permisos por defecto. El almacenamiento (0004) se prueba solo en Supabase.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "../../supabase");
const sql = (f: string) => readFileSync(path.join(dir, f), "utf8");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
const U3 = "00000000-0000-0000-0000-000000000003";

let db: PGlite;

/** Ejecuta como un usuario autenticado (o anónimo si id es null), con RLS activa. */
async function as<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(id ? `set role authenticated; set request.jwt.claim.sub = '${id}';` : `set role anon; set request.jwt.claim.sub = '';`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; set request.jwt.claim.sub = '';`);
  }
}

async function rejects(p: Promise<unknown>) {
  let failed = false;
  try {
    await p;
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

let merchantId: string;
let pmId: string;

async function insertPromo(fp: string, extra = ""): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.promotions (kind, merchant_id, title, discount_kind, discount_value, source_url, status, fingerprint ${extra ? "," + extra.split("=")[0] : ""})
     values ('reintegro', $1, 'Promo de prueba', 'porcentaje', 20, 'https://ejemplo.com', 'publicada', $2 ${extra ? "," + extra.split("=")[1] : ""}) returning id`,
    [merchantId, fp],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const f of ["0001_base.sql", "0002_nuevos_valores.sql", "0003_cupones_cumple_sugerencias.sql", "0005_publicacion.sql", "0006_fuentes_y_bancos.sql", "0008_modo_por_tandas.sql", "0009_fuente_prex.sql", "0010_pausar_pedidosya.sql", "0011_fuente_farmaonline.sql", "0012_aprobacion_automatica.sql"]) {
    await db.exec(sql(`migrations/${f}`));
  }
  await db.exec(sql("seed.sql"));
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@pesito.test'), ('${U1}', 'lucas@pesito.test'),
      ('${U2}', 'ana@pesito.test'), ('${U3}', 'sofi@pesito.test');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
  `);
  merchantId = (await db.query<{ id: string }>(`insert into public.merchants (slug, name) values ('comercio-prueba', 'Comercio de prueba') returning id`)).rows[0].id;
  pmId = (await db.query<{ id: string }>(`select id from public.payment_methods where slug = 'mercado-pago'`)).rows[0].id;
});

describe("migraciones", () => {
  it("crean perfiles al registrarse y cargan catálogos", async () => {
    const p = await db.query(`select count(*)::int as n from public.profiles`);
    expect((p.rows[0] as { n: number }).n).toBe(4);
    const c = await db.query(`select count(*)::int as n from public.categories`);
    expect((c.rows[0] as { n: number }).n).toBeGreaterThan(5);
  });

  it("el público solo ve promociones publicadas", async () => {
    await insertPromo("fp-publicada");
    await db.query(
      `insert into public.promotions (kind, merchant_id, title, discount_kind, discount_value, status, fingerprint)
       values ('descuento', $1, 'Borrador interno', 'porcentaje', 10, 'borrador', 'fp-borrador')`,
      [merchantId],
    );
    const anon = await as(null, () => db.query<{ title: string }>(`select title from public.promotions`));
    expect(anon.rows.map((r) => r.title)).toEqual(["Promo de prueba"]);
    const admin = await as(ADMIN, () => db.query(`select title from public.promotions`));
    expect(admin.rows.length).toBe(2);
  });

  it("no permite publicar sin fuente ni duplicar huellas activas", async () => {
    await rejects(
      db.query(
        `insert into public.promotions (kind, merchant_id, title, discount_kind, discount_value, status, fingerprint)
         values ('reintegro', $1, 'Sin fuente', 'porcentaje', 10, 'publicada', 'fp-sin-fuente')`,
        [merchantId],
      ),
    );
    await rejects(insertPromo("fp-publicada"));
  });

  it("el usuario no puede cambiarse el rol, pero sí su cumpleaños", async () => {
    await rejects(as(U1, () => db.query(`update public.profiles set role = 'admin' where id = '${U1}'`)));
    await as(U1, () => db.query(`update public.profiles set birthday_day = 14, birthday_month = 3 where id = '${U1}'`));
    const r = await db.query<{ birthday_day: number; role: string }>(`select birthday_day, role from public.profiles where id = '${U1}'`);
    expect(r.rows[0]).toEqual({ birthday_day: 14, role: "usuario" });
  });

  it("rechaza cumpleaños imposibles o incompletos", async () => {
    await rejects(as(U2, () => db.query(`update public.profiles set birthday_day = 31, birthday_month = 2 where id = '${U2}'`)));
    await rejects(as(U2, () => db.query(`update public.profiles set birthday_day = 10, birthday_month = null where id = '${U2}'`)));
  });

  it("los cupones con código exigen el código y el registro externo exige plataforma", async () => {
    const id = await insertPromo("fp-cupon");
    await rejects(db.query(`insert into public.coupon_details (promotion_id, redemption) values ($1, 'codigo')`, [id]));
    await rejects(db.query(`insert into public.coupon_details (promotion_id, redemption, requires_external_signup) values ($1, 'link', true)`, [id]));
    await db.query(`insert into public.coupon_details (promotion_id, redemption, code) values ($1, 'codigo', 'BIENVENIDA10')`, [id]);
  });

  it("guardados y utilizados se registran por usuario", async () => {
    const id = await insertPromo("fp-guardado");
    await as(U1, () => db.query(`insert into public.user_promotion_states (user_id, promotion_id, saved_at) values ($1, $2, now())`, [U1, id]));
    await as(U1, () => db.query(`update public.user_promotion_states set used_at = now() where promotion_id = $1`, [id]));
    await rejects(as(U2, () => db.query(`insert into public.user_promotion_states (user_id, promotion_id, saved_at) values ($1, $2, now())`, [U1, id])));
    const other = await as(U2, () => db.query(`select * from public.user_promotion_states`));
    expect(other.rows.length).toBe(0);
  });

  it("tres reportes de personas distintas mandan la promo a revisión", async () => {
    const id = await insertPromo("fp-reportada");
    for (const u of [U1, U2]) {
      await as(u, () => db.query(`insert into public.promotion_reports (promotion_id, user_id, reason) values ($1, $2, 'codigo_invalido')`, [id, u]));
    }
    await rejects(as(U2, () => db.query(`insert into public.promotion_reports (promotion_id, user_id, reason) values ($1, $2, 'vencido')`, [id, U2])));
    let s = await db.query<{ status: string }>(`select status from public.promotions where id = $1`, [id]);
    expect(s.rows[0].status).toBe("publicada");
    await as(U3, () => db.query(`insert into public.promotion_reports (promotion_id, user_id, reason) values ($1, $2, 'vencido')`, [id, U3]));
    s = await db.query<{ status: string }>(`select status from public.promotions where id = $1`, [id]);
    expect(s.rows[0].status).toBe("en_revision");
  });

  it("las sugerencias nunca se publican solas y respetan el límite diario", async () => {
    const insert = (fp: string, status = "pendiente") =>
      as(U2, () =>
        db.query(
          `insert into public.promo_submissions (origin, status, submitted_by, payload, fingerprint) values ('usuario', $1, $2, '{}'::jsonb, $3)`,
          [status, U2, fp],
        ),
      );
    await rejects(insert("fp-s0", "aprobada"));
    await rejects(
      as(U2, () => db.query(`insert into public.promo_submissions (origin, submitted_by, payload) values ('automatizacion', $1, '{}'::jsonb)`, [U2])),
    );
    for (let i = 1; i <= 5; i++) await insert(`fp-s${i}`);
    await rejects(insert("fp-s6"));
    // Sin política de UPDATE para usuarios: la sentencia no afecta filas.
    await as(U2, () => db.query(`update public.promo_submissions set status = 'aprobada'`));
    const approved = await db.query<{ n: number }>(`select count(*)::int as n from public.promo_submissions where status = 'aprobada'`);
    expect(approved.rows[0].n).toBe(0);
    const own = await as(U2, () => db.query(`select id from public.promo_submissions`));
    expect(own.rows.length).toBe(5);
    const others = await as(U1, () => db.query(`select id from public.promo_submissions`));
    expect(others.rows.length).toBe(0);
    const admin = await as(ADMIN, () => db.query(`select id from public.promo_submissions`));
    expect(admin.rows.length).toBe(5);
  });

  it("vence las promos cuya vigencia terminó", async () => {
    const id = await insertPromo("fp-vieja", "valid_until='2020-01-01'");
    await db.query(`insert into public.promotion_payment_methods values ($1, $2)`, [id, pmId]);
    const r = await db.query<{ n: number }>(`select public.expire_promotions() as n`);
    expect(r.rows[0].n).toBeGreaterThanOrEqual(1);
    const s = await db.query<{ status: string }>(`select status from public.promotions where id = $1`, [id]);
    expect(s.rows[0].status).toBe("vencida");
  });

  it("los requisitos solo aceptan valores conocidos", async () => {
    await rejects(insertPromo("fp-req", "requirements=array['inventado']"));
    await insertPromo("fp-req-ok", "requirements=array['presentar_dni','registro_previo']");
  });

  it("publica un cupón en una sola transacción y solo si sos admin", async () => {
    const payload = {
      kind: "cupon", audience: "nuevos_clientes", merchantName: "Tienda Nueva", categorySlug: "tecnologia",
      title: "10% en la primera compra", summary: null, discountKind: "porcentaje", discountValue: 10,
      capAmount: 5000, capPeriod: "compra", minPurchase: null, validFrom: null, validUntil: "2099-01-31",
      daysOfWeek: null, channel: "online", conditions: "Una vez por persona", requirements: ["primera_compra"],
      sourceUrl: "https://tienda.example.com/promo", externalId: null, paymentMethodSlugs: ["mercado-pago"],
      coupon: { redemption: "codigo", code: "HOLA10", newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null },
      birthday: null,
    };
    const call = () =>
      db.query<{ id: string }>(`select public.publish_promotion($1::jsonb, 'fp-pub-cupon', 'tienda-nueva') as id`, [JSON.stringify(payload)]);
    await rejects(as(U1, call));
    const r = await as(ADMIN, call);
    const id = r.rows[0].id;
    const row = await db.query<{ status: string; code: string; pms: number; days: unknown }>(
      `select p.status, c.code, (select count(*)::int from public.promotion_payment_methods where promotion_id = p.id) as pms, p.days_of_week as days
         from public.promotions p join public.coupon_details c on c.promotion_id = p.id where p.id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ status: "publicada", code: "HOLA10", pms: 1, days: null });

    // Un cupón inválido (código faltante) no deja nada a medias.
    const bad = { ...payload, title: "Otro", coupon: { ...payload.coupon, code: null } };
    await rejects(as(ADMIN, () => db.query(`select public.publish_promotion($1::jsonb, 'fp-pub-mal', 'tienda-nueva')`, [JSON.stringify(bad)])));
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.promotions where fingerprint = 'fp-pub-mal'`);
    expect(n.rows[0].n).toBe(0);

    // Actualizar desde un payload cambia vigencia y detalle.
    await as(ADMIN, () =>
      db.query(`select public.update_promotion_from_payload($1, $2::jsonb, 'fp-pub-cupon-2')`, [id, JSON.stringify({ ...payload, validUntil: "2099-02-28", daysOfWeek: [1, 3] })]),
    );
    const upd = await db.query<{ valid_until: Date; fingerprint: string; days: number[] }>(`select valid_until, fingerprint, days_of_week as days from public.promotions where id = $1`, [id]);
    expect(upd.rows[0].fingerprint).toBe("fp-pub-cupon-2");
    expect(upd.rows[0].days).toEqual([1, 3]);
  });

  it("publica beneficios de cumpleaños con su ventana", async () => {
    const payload = {
      kind: "cumple", audience: "cumpleanieros", merchantName: "Heladería Test", categorySlug: null, title: "Helado de regalo",
      summary: null, discountKind: "regalo", discountValue: null, capAmount: null, capPeriod: "sin_tope", minPurchase: null,
      validFrom: null, validUntil: null, daysOfWeek: null, channel: "local", conditions: null, requirements: ["presentar_dni"],
      sourceUrl: "https://heladeria.example.com", externalId: null, paymentMethodSlugs: [], coupon: null,
      birthday: { windowKind: "dia", daysBefore: 0, daysAfter: 0, benefit: "regalo", loyaltyProgram: null },
    };
    await db.exec(`set request.jwt.claim.role = 'service_role'`);
    const r = await db.query<{ id: string }>(`select public.publish_promotion($1::jsonb, 'fp-cumple', 'heladeria-test') as id`, [JSON.stringify(payload)]);
    await db.exec(`set request.jwt.claim.role = ''`);
    const b = await db.query<{ window_kind: string; benefit: string }>(`select window_kind, benefit from public.birthday_details where promotion_id = $1`, [r.rows[0].id]);
    expect(b.rows[0]).toEqual({ window_kind: "dia", benefit: "regalo" });
  });

  it("aprobación automática: las fuentes oficiales con lector publican solas; PedidosYa queda pausada y sin publicar", async () => {
    const src = await db.query<{ adapter: string; auto_publish: boolean; active: boolean }>(`select adapter, auto_publish, active from public.sources where adapter is not null order by adapter`);
    const auto = src.rows.filter((r) => r.auto_publish).map((r) => r.adapter);
    expect(auto).toEqual(["farmaonline", "mercadopago", "modo", "prex", "uala"]);
    expect(src.rows.find((r) => r.adapter === "pedidosya")).toMatchObject({ auto_publish: false, active: false });
    const col = await db.query(`select 1 from information_schema.columns where table_name = 'promotions' and column_name = 'manual_edit_at'`);
    expect(col.rows).toHaveLength(1);
  });

  it("Prex queda como fuente oficial, pagando con la billetera Prex", async () => {
    const src = await db.query<{ kind: string; auto_publish: boolean; active: boolean }>(`select kind, auto_publish, active from public.sources where adapter = 'prex'`);
    expect(src.rows).toEqual([{ kind: "oficial", auto_publish: true, active: true }]);
    const pm = await db.query(`select 1 from public.payment_methods where slug = 'prex'`);
    expect(pm.rows).toHaveLength(1);
  });

  it("MODO queda como fuente por tandas, con su registro de páginas solo para admin", async () => {
    const src = await db.query<{ id: string; kind: string; auto_publish: boolean }>(`select id, kind, auto_publish from public.sources where adapter = 'modo'`);
    expect(src.rows).toHaveLength(1);
    expect(src.rows[0]).toMatchObject({ kind: "oficial", auto_publish: true });
    const id = src.rows[0].id;
    await db.query(`insert into public.source_records (source_id, key, priority) values ($1, 'farmaplus-oct26', 1000), ($1, 'vieja-jul23', 610)`, [id]);
    // Volver a cargar el sitemap no pisa lo que ya se sabía de cada página.
    await db.query(`update public.source_records set state = 'vencida', next_check_at = null where key = 'vieja-jul23'`);
    await db.query(`insert into public.source_records (source_id, key, priority) values ($1, 'vieja-jul23', 610) on conflict (source_id, key) do nothing`, [id]);
    const due = await db.query<{ key: string }>(`select key from public.source_records where source_id = $1 and next_check_at <= now() order by priority desc, next_check_at`, [id]);
    expect(due.rows.map((r) => r.key)).toEqual(["farmaplus-oct26"]);
    await rejects(db.query(`insert into public.source_records (source_id, key, state) values ($1, 'x', 'inventado')`, [id]));
    const user = await as(U1, () => db.query(`select key from public.source_records`));
    expect(user.rows).toHaveLength(0);
    const bank = await db.query(`select 1 from public.payment_methods where slug = 'banco-corrientes'`);
    expect(bank.rows).toHaveLength(1);
  });
});
