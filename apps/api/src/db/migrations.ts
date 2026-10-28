// Ordered SQL migrations. Never edit one that has shipped; add a new entry.
// Kept in TypeScript so the bundled server carries them without extra files.

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: "0001_core",
    sql: /* sql */ `
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE CHECK (email = lower(email)),
        name text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE studios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE memberships (
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner','admin','designer','assistant','bookkeeper')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (studio_id, user_id)
      );
      CREATE INDEX memberships_user_idx ON memberships(user_id);

      CREATE TABLE sessions (
        id text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);

      CREATE TABLE invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        email text NOT NULL CHECK (email = lower(email)),
        role text NOT NULL CHECK (role IN ('owner','admin','designer','assistant','bookkeeper')),
        token_hash text NOT NULL UNIQUE,
        invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz
      );
      CREATE INDEX invitations_studio_idx ON invitations(studio_id);

      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text,
        before jsonb,
        after jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_log_studio_created_idx ON audit_log(studio_id, created_at DESC);
    `,
  },
  {
    // Row-level security (PLAN.md 5, rule 6). Request handlers run as app_user
    // with app.studio_id set for the transaction, so a missing WHERE clause
    // can't read another studio's rows. Auth code uses the owner connection.
    id: "0002_row_level_security",
    sql: /* sql */ `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN;
        END IF;
      END $$;
      GRANT app_user TO CURRENT_USER;

      CREATE FUNCTION app_current_studio() RETURNS uuid
        LANGUAGE sql STABLE
        AS $fn$ SELECT nullif(current_setting('app.studio_id', true), '')::uuid $fn$;

      GRANT USAGE ON SCHEMA public TO app_user;
      GRANT EXECUTE ON FUNCTION app_current_studio() TO app_user;
      GRANT SELECT, UPDATE ON studios TO app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO app_user;
      GRANT SELECT, INSERT ON audit_log TO app_user;
      GRANT SELECT ON users TO app_user;
      -- sessions: no grant. Only the auth layer touches them.

      ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
      ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;

      CREATE POLICY studio_isolation ON studios
        USING (id = app_current_studio()) WITH CHECK (id = app_current_studio());
      CREATE POLICY studio_isolation ON memberships
        USING (studio_id = app_current_studio()) WITH CHECK (studio_id = app_current_studio());
      CREATE POLICY studio_isolation ON invitations
        USING (studio_id = app_current_studio()) WITH CHECK (studio_id = app_current_studio());
      CREATE POLICY studio_isolation ON audit_log
        USING (studio_id = app_current_studio()) WITH CHECK (studio_id = app_current_studio());
      -- Users are visible only when they belong to the current studio.
      CREATE POLICY members_of_current_studio ON users
        USING (EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.user_id = users.id AND m.studio_id = app_current_studio()
        ));
    `,
  },
  {
    // M1 catalog. Every table carries studio_id and the same isolation policy.
    id: "0003_catalog",
    sql: /* sql */ `
      CREATE TABLE clients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        name text NOT NULL,
        email text NOT NULL DEFAULT '',
        phone text NOT NULL DEFAULT '',
        address text NOT NULL DEFAULT '',
        tax_exempt boolean NOT NULL DEFAULT false,
        notes text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX clients_studio_idx ON clients(studio_id, lower(name));

      CREATE TABLE vendors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        name text NOT NULL,
        categories text[] NOT NULL DEFAULT '{}',
        website text NOT NULL DEFAULT '',
        email text NOT NULL DEFAULT '',
        phone text NOT NULL DEFAULT '',
        account_number text NOT NULL DEFAULT '',
        rep_name text NOT NULL DEFAULT '',
        rep_email text NOT NULL DEFAULT '',
        city text NOT NULL DEFAULT '',
        state text NOT NULL DEFAULT '',
        discount_bps integer NOT NULL DEFAULT 0 CHECK (discount_bps >= 0),
        lead_time_weeks integer CHECK (lead_time_weeks >= 0),
        payment_terms text NOT NULL DEFAULT '',
        notes text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX vendors_studio_idx ON vendors(studio_id, lower(name));
      CREATE INDEX vendors_categories_idx ON vendors USING gin (categories);

      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
        name text NOT NULL,
        phase text NOT NULL DEFAULT 'consultation'
          CHECK (phase IN ('consultation','schematic','design_development','construction_admin','closed')),
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','complete')),
        address text NOT NULL DEFAULT '',
        budget_cents bigint CHECK (budget_cents >= 0),
        tax_rate_bps integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps >= 0),
        tax_charges boolean NOT NULL DEFAULT false,
        default_markup_bps integer NOT NULL DEFAULT 3500 CHECK (default_markup_bps >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX projects_studio_idx ON projects(studio_id, updated_at DESC);
      CREATE INDEX projects_client_idx ON projects(client_id);

      CREATE TABLE rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name text NOT NULL,
        sort integer NOT NULL DEFAULT 0
      );
      CREATE INDEX rooms_project_idx ON rooms(project_id, sort);

      CREATE TABLE items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        category text NOT NULL DEFAULT '',
        sku text NOT NULL DEFAULT '',
        dimensions text NOT NULL DEFAULT '',
        finish text NOT NULL DEFAULT '',
        qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
        unit text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','proposed','approved','rejected','ordered','received','installed')),
        procured boolean NOT NULL DEFAULT true,
        specified boolean NOT NULL DEFAULT false,
        tag text NOT NULL DEFAULT '',
        image_url text NOT NULL DEFAULT '',
        source_url text NOT NULL DEFAULT '',
        notes text NOT NULL DEFAULT '',
        pricing_mode text NOT NULL DEFAULT 'markup' CHECK (pricing_mode IN ('markup','margin','msrp_discount','fixed')),
        markup_bps integer NOT NULL DEFAULT 3500 CHECK (markup_bps >= 0),
        margin_bps integer NOT NULL DEFAULT 0 CHECK (margin_bps >= 0 AND margin_bps < 10000),
        msrp_cents bigint NOT NULL DEFAULT 0 CHECK (msrp_cents >= 0),
        msrp_discount_bps integer NOT NULL DEFAULT 0 CHECK (msrp_discount_bps >= 0),
        fixed_price_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_price_cents >= 0),
        sort integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX items_project_idx ON items(project_id, sort);

      -- One item can have several parts from different vendors (COM).
      CREATE TABLE item_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
        item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
        description text NOT NULL DEFAULT '',
        net_cost_cents bigint NOT NULL DEFAULT 0 CHECK (net_cost_cents >= 0),
        qty double precision NOT NULL DEFAULT 1 CHECK (qty >= 0),
        freight_cents bigint NOT NULL DEFAULT 0 CHECK (freight_cents >= 0),
        crating_cents bigint NOT NULL DEFAULT 0 CHECK (crating_cents >= 0),
        receiving_cents bigint NOT NULL DEFAULT 0 CHECK (receiving_cents >= 0),
        install_cents bigint NOT NULL DEFAULT 0 CHECK (install_cents >= 0),
        ship_to text NOT NULL DEFAULT '',
        sort integer NOT NULL DEFAULT 0
      );
      CREATE INDEX item_components_item_idx ON item_components(item_id, sort);
      CREATE INDEX item_components_vendor_idx ON item_components(vendor_id);

      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY['clients','vendors','projects','rooms','items','item_components'] LOOP
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
          EXECUTE format(
            'CREATE POLICY studio_isolation ON %I USING (studio_id = app_current_studio()) WITH CHECK (studio_id = app_current_studio())',
            t
          );
        END LOOP;
      END $$;
    `,
  },
  {
    id: "0004_project_color",
    sql: /* sql */ `
      ALTER TABLE projects ADD COLUMN color text NOT NULL DEFAULT 'lagoon'
        CHECK (color IN ('marigold','persimmon','rosewater','orchid','cobalt','lagoon','fern','citrine'));
    `,
  },
];
