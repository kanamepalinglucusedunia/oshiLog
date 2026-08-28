import type { SqliteLike } from './types';
import { compareISODate, isValidISODate } from '@/utils/date';

export interface Migration {
  version: number;
  name: string;
  up: (db: SqliteLike) => void;
}

const AUDIT_COLUMNS = `
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
`;

/**
 * Baseline column definitions from migration v1, used to repair databases
 * written by very old builds whose tables predate columns v1 expects. Missing
 * columns are added via ALTER TABLE so `CREATE TABLE IF NOT EXISTS` (which
 * never adds columns) and later migrations that SELECT from these columns can
 * still run. Only columns that can be added safely on a non-empty table are
 * listed; NOT NULL ones carry a DEFAULT. `id` and the audit columns are
 * assumed to already exist.
 */
const BASELINE_COLUMNS: Record<string, readonly string[]> = {
  app_settings: [
    "surface_style TEXT NOT NULL DEFAULT 'outline'",
    "accent_color TEXT NOT NULL DEFAULT '#7F6EB5'",
    "home_header_label TEXT NOT NULL DEFAULT 'oshiLog'",
    'onboarding_completed INTEGER NOT NULL DEFAULT 0',
    "data_reminder_frequency TEXT NOT NULL DEFAULT 'off'",
    "media_reminder_frequency TEXT NOT NULL DEFAULT 'off'",
  ],
  country_preference: ['country TEXT', 'is_active INTEGER NOT NULL DEFAULT 1'],
  media_asset: [
    "kind TEXT NOT NULL DEFAULT 'cheki'",
    'content_hash TEXT',
    'mime_type TEXT',
    'file_size INTEGER',
    'width INTEGER',
    'height INTEGER',
    'duration_ms INTEGER',
    'local_path TEXT',
    'thumbnail_path TEXT',
    'instax_preset TEXT',
  ],
  idol: [
    "name TEXT NOT NULL DEFAULT ''",
    'photo_media_id TEXT',
    "country TEXT NOT NULL DEFAULT 'JP'",
    'region TEXT',
    'birth_date TEXT',
    'member_color TEXT',
    "status TEXT NOT NULL DEFAULT 'active'",
    'is_favorite INTEGER NOT NULL DEFAULT 0',
    'notes TEXT',
  ],
  groups: [
    "name TEXT NOT NULL DEFAULT ''",
    'photo_media_id TEXT',
    "country TEXT NOT NULL DEFAULT 'JP'",
    'region TEXT',
    'debut_date TEXT',
    'end_date TEXT',
    'is_favorite INTEGER NOT NULL DEFAULT 0',
    'notes TEXT',
  ],
  group_membership: ['idol_id TEXT', 'group_id TEXT', 'start_date TEXT', 'end_date TEXT'],
  cheki_type: ['idol_id TEXT', 'label TEXT', 'currency TEXT', 'unit_price INTEGER', 'is_archived INTEGER NOT NULL DEFAULT 0', 'is_default INTEGER NOT NULL DEFAULT 0'],
  venue: [
    "name TEXT NOT NULL DEFAULT ''",
    "country TEXT NOT NULL DEFAULT 'JP'",
    'region TEXT',
    'is_favorite INTEGER NOT NULL DEFAULT 0',
    'notes TEXT',
  ],
  venue_drink_price: ['venue_id TEXT', 'label TEXT', 'currency TEXT', 'price INTEGER', 'is_archived INTEGER NOT NULL DEFAULT 0', 'is_default INTEGER NOT NULL DEFAULT 0'],
  trip: ["title TEXT NOT NULL DEFAULT ''", 'start_date TEXT', 'end_date TEXT', 'description TEXT', 'is_favorite INTEGER NOT NULL DEFAULT 0'],
  trip_country: ['trip_id TEXT', 'country TEXT'],
  trip_expense: [
    'trip_id TEXT',
    "title TEXT NOT NULL DEFAULT ''",
    "category TEXT NOT NULL DEFAULT 'other'",
    'custom_category_label TEXT',
    'currency TEXT',
    'amount INTEGER',
    'expense_date TEXT',
    'note TEXT',
  ],
  event: [
    "title TEXT NOT NULL DEFAULT ''",
    'event_date TEXT',
    "country TEXT NOT NULL DEFAULT 'JP'",
    'venue_id TEXT',
    'trip_id TEXT',
    'ticket_currency TEXT',
    'ticket_amount INTEGER',
    'drink_currency TEXT',
    'drink_amount INTEGER',
    'notes TEXT',
  ],
  cheki_entry: ['event_id TEXT', 'idol_id TEXT', 'group_membership_id TEXT', 'cheki_type_id TEXT', 'quantity INTEGER', 'currency TEXT', 'unit_price INTEGER', 'subtotal INTEGER'],
  idol_media: [
    'media_asset_id TEXT',
    'idol_id TEXT',
    'sort_order INTEGER NOT NULL DEFAULT 0',
    'idol_name_snapshot TEXT',
    'group_name_snapshot TEXT',
    'created_at TEXT',
    'updated_at TEXT',
  ],
  group_media: ['media_asset_id TEXT', 'group_id TEXT', 'sort_order INTEGER NOT NULL DEFAULT 0', 'created_at TEXT', 'updated_at TEXT'],
  cheki_entry_media: ['media_asset_id TEXT', 'cheki_entry_id TEXT', 'position INTEGER', 'created_at TEXT', 'updated_at TEXT'],
  backup_snapshot: ["category TEXT NOT NULL DEFAULT 'data'", 'device_label TEXT', 'manifest TEXT', 'status TEXT', 'file_id TEXT', 'size INTEGER', 'created_at TEXT', 'updated_at TEXT'],
};

function ensureBaselineColumns(db: SqliteLike): void {
  for (const [table, columns] of Object.entries(BASELINE_COLUMNS)) {
    const existing = new Set(db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name));
    if (existing.size === 0) continue;
    for (const definition of columns) {
      const name = definition.slice(0, definition.indexOf(' '));
      if (!existing.has(name)) {
        db.runSync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
      }
    }
  }
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id TEXT PRIMARY KEY NOT NULL,
          surface_style TEXT NOT NULL DEFAULT 'outline',
          accent_color TEXT NOT NULL DEFAULT '#7F6EB5',
          home_header_label TEXT NOT NULL DEFAULT 'oshiLog',
          onboarding_completed INTEGER NOT NULL DEFAULT 0,
          data_reminder_frequency TEXT NOT NULL DEFAULT 'off',
          media_reminder_frequency TEXT NOT NULL DEFAULT 'off',
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS country_preference (
          id TEXT PRIMARY KEY NOT NULL,
          country TEXT NOT NULL UNIQUE,
          is_active INTEGER NOT NULL DEFAULT 1,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS media_asset (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('cheki', 'photo', 'video')),
          content_hash TEXT,
          mime_type TEXT,
          file_size INTEGER,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          local_path TEXT,
          thumbnail_path TEXT,
          instax_preset TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS idol (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          photo_media_id TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
          country TEXT NOT NULL,
          region TEXT,
          birth_date TEXT,
          member_color TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hiatus', 'inactive')),
          is_favorite INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          photo_media_id TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
          country TEXT NOT NULL,
          region TEXT,
          debut_date TEXT,
          end_date TEXT,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS group_membership (
          id TEXT PRIMARY KEY NOT NULL,
          idol_id TEXT NOT NULL REFERENCES idol(id),
          group_id TEXT NOT NULL REFERENCES groups(id),
          start_date TEXT NOT NULL,
          end_date TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS cheki_type (
          id TEXT PRIMARY KEY NOT NULL,
          idol_id TEXT NOT NULL REFERENCES idol(id),
          label TEXT NOT NULL,
          currency TEXT NOT NULL,
          unit_price INTEGER NOT NULL,
          is_archived INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS venue (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          country TEXT NOT NULL,
          region TEXT,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS venue_drink_price (
          id TEXT PRIMARY KEY NOT NULL,
          venue_id TEXT NOT NULL REFERENCES venue(id),
          label TEXT,
          currency TEXT NOT NULL,
          price INTEGER NOT NULL,
          is_archived INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS trip (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          description TEXT,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS trip_country (
          id TEXT PRIMARY KEY NOT NULL,
          trip_id TEXT NOT NULL REFERENCES trip(id),
          country TEXT NOT NULL,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS trip_expense (
          id TEXT PRIMARY KEY NOT NULL,
          trip_id TEXT NOT NULL REFERENCES trip(id),
          title TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('flight', 'hotel', 'transport', 'meal', 'other')),
          custom_category_label TEXT,
          currency TEXT NOT NULL,
          amount INTEGER NOT NULL,
          expense_date TEXT NOT NULL,
          note TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS event (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          event_date TEXT NOT NULL,
          country TEXT NOT NULL,
          venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
          trip_id TEXT REFERENCES trip(id) ON DELETE SET NULL,
          ticket_currency TEXT,
          ticket_amount INTEGER,
          drink_currency TEXT,
          drink_amount INTEGER,
          notes TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS cheki_entry (
          id TEXT PRIMARY KEY NOT NULL,
          event_id TEXT NOT NULL REFERENCES event(id),
          idol_id TEXT NOT NULL REFERENCES idol(id),
          group_membership_id TEXT REFERENCES group_membership(id),
          cheki_type_id TEXT NOT NULL REFERENCES cheki_type(id),
          quantity INTEGER NOT NULL,
          currency TEXT NOT NULL,
          unit_price INTEGER NOT NULL,
          subtotal INTEGER NOT NULL,
          ${AUDIT_COLUMNS}
        );

        CREATE TABLE IF NOT EXISTS idol_media (
          media_asset_id TEXT PRIMARY KEY NOT NULL REFERENCES media_asset(id),
          idol_id TEXT NOT NULL REFERENCES idol(id),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS group_media (
          media_asset_id TEXT PRIMARY KEY NOT NULL REFERENCES media_asset(id),
          group_id TEXT NOT NULL REFERENCES groups(id),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cheki_entry_media (
          media_asset_id TEXT PRIMARY KEY NOT NULL REFERENCES media_asset(id),
          cheki_entry_id TEXT NOT NULL REFERENCES cheki_entry(id),
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS backup_snapshot (
          id TEXT PRIMARY KEY NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('data', 'media')),
          device_label TEXT,
          manifest TEXT,
          status TEXT,
          file_id TEXT,
          size INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_idol_country ON idol(country);
        CREATE INDEX IF NOT EXISTS idx_groups_country ON groups(country);
        CREATE INDEX IF NOT EXISTS idx_membership_idol ON group_membership(idol_id);
        CREATE INDEX IF NOT EXISTS idx_membership_group ON group_membership(group_id);
        CREATE INDEX IF NOT EXISTS idx_cheki_type_idol ON cheki_type(idol_id);
        CREATE INDEX IF NOT EXISTS idx_drink_price_venue ON venue_drink_price(venue_id);
        CREATE INDEX IF NOT EXISTS idx_trip_country_trip ON trip_country(trip_id);
        CREATE INDEX IF NOT EXISTS idx_expense_trip ON trip_expense(trip_id);
        CREATE INDEX IF NOT EXISTS idx_event_date ON event(event_date);
        CREATE INDEX IF NOT EXISTS idx_event_venue ON event(venue_id);
        CREATE INDEX IF NOT EXISTS idx_event_trip ON event(trip_id);
        CREATE INDEX IF NOT EXISTS idx_cheki_event ON cheki_entry(event_id);
        CREATE INDEX IF NOT EXISTS idx_cheki_idol ON cheki_entry(idol_id);
        CREATE INDEX IF NOT EXISTS idx_cheki_membership ON cheki_entry(group_membership_id);
        CREATE INDEX IF NOT EXISTS idx_cheki_media_entry ON cheki_entry_media(cheki_entry_id);
        CREATE INDEX IF NOT EXISTS idx_idol_media_idol ON idol_media(idol_id);
        CREATE INDEX IF NOT EXISTS idx_group_media_group ON group_media(group_id);
      `);
    },
  },
  {
    version: 2,
    name: 'media-lookup-indexes',
    up: (db) => {
      db.execSync(`
        CREATE INDEX IF NOT EXISTS idx_media_hash ON media_asset(content_hash);
        CREATE INDEX IF NOT EXISTS idx_cheki_media_asset ON cheki_entry_media(media_asset_id);
        CREATE INDEX IF NOT EXISTS idx_idol_media_asset ON idol_media(media_asset_id);
        CREATE INDEX IF NOT EXISTS idx_group_media_asset ON group_media(media_asset_id);
        CREATE INDEX IF NOT EXISTS idx_backup_snapshot_category ON backup_snapshot(category);
      `);
    },
  },
  {
    version: 3,
    name: 'region-master-table',
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS region (
          id TEXT PRIMARY KEY NOT NULL,
          country TEXT NOT NULL,
          name TEXT NOT NULL,
          ${AUDIT_COLUMNS},
          UNIQUE (country, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_region_country ON region(country);

        INSERT OR IGNORE INTO region (id, country, name, schema_version, created_at, updated_at)
          SELECT 'legacy-' || country || '-' || region, country, region, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
          FROM idol WHERE region IS NOT NULL
          UNION
          SELECT 'legacy-' || country || '-' || region, country, region, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
          FROM groups WHERE region IS NOT NULL
          UNION
          SELECT 'legacy-' || country || '-' || region, country, region, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
          FROM venue WHERE region IS NOT NULL;
      `);
    },
  },
  {
    version: 4,
    name: 'theme-mode',
    up: (db) => {
      db.execSync(`
        ALTER TABLE app_settings ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'light'
          CHECK (theme_mode IN ('light', 'dark'));
      `);
    },
  },
  {
    version: 5,
    name: 'membership-per-group-details',
    up: (db) => {
      db.execSync(`
        ALTER TABLE group_membership ADD COLUMN name TEXT;
        ALTER TABLE group_membership ADD COLUMN member_color TEXT;
        ALTER TABLE group_membership ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'grad', 'hiatus'));
        ALTER TABLE group_membership ADD COLUMN hiatus_start_date TEXT;
        ALTER TABLE group_membership ADD COLUMN hiatus_end_date TEXT;
        ALTER TABLE group_membership ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS member_color (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          hex TEXT NOT NULL,
          ${AUDIT_COLUMNS}
        );

        CREATE INDEX IF NOT EXISTS idx_member_color_name ON member_color(name COLLATE NOCASE);
      `);

      const now = new Date().toISOString();

      const palette: { name: string; hex: string }[] = [
        { name: 'Pink', hex: '#FF9EC4' },
        { name: 'Green', hex: '#4DB665' },
        { name: 'Light Blue', hex: '#7EC8E3' },
        { name: 'Red', hex: '#DC3545' },
        { name: 'Purple', hex: '#7F6EB5' },
        { name: 'Orange', hex: '#E8873A' },
        { name: 'Yellow', hex: '#FFCC31' },
        { name: 'Blue', hex: '#4A9BC7' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Black', hex: '#000000' },
        { name: 'Lavender', hex: '#B5ABD4' },
        { name: 'Aqua', hex: '#2E9E9E' },
      ];
      for (const { name, hex } of palette) {
        db.runSync(
          `INSERT OR IGNORE INTO member_color (id, name, hex, schema_version, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 1, ?, ?, NULL)`,
          `seed-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
          hex,
          now,
          now,
        );
      }

      db.runSync(
        `INSERT OR IGNORE INTO member_color (id, name, hex, schema_version, created_at, updated_at, deleted_at)
          SELECT 'legacy-' || substr(idol.id, 1, 12), idol.member_color, idol.member_color, 1, ?, ?, NULL
          FROM idol
          WHERE idol.member_color IS NOT NULL AND idol.member_color != ''`,
        now,
        now,
      );

      db.execSync(`
        UPDATE group_membership
        SET name = (SELECT i.name FROM idol i WHERE i.id = group_membership.idol_id),
            status = CASE (SELECT i.status FROM idol i WHERE i.id = group_membership.idol_id)
                       WHEN 'inactive' THEN 'grad'
                       WHEN 'hiatus' THEN 'hiatus'
                       ELSE 'active'
                     END,
            member_color = (SELECT mc.id FROM idol i JOIN member_color mc ON mc.name = i.member_color COLLATE NOCASE WHERE i.id = group_membership.idol_id)
        WHERE deleted_at IS NULL;
      `);

      db.execSync(`
        UPDATE group_membership
        SET is_main = 1
        WHERE deleted_at IS NULL
          AND id IN (
            SELECT gm.id FROM group_membership gm
            WHERE gm.deleted_at IS NULL
              AND gm.start_date <= date('now')
              AND (gm.end_date IS NULL OR gm.end_date >= date('now'))
            GROUP BY gm.idol_id
            HAVING COUNT(*) = 1
          );
      `);
    },
  },
  {
    version: 6,
    name: 'repair-legacy-integrity',
    up: (db) => {
      db.execSync(`
        UPDATE cheki_type SET unit_price = 0 WHERE unit_price < 0;
        UPDATE venue_drink_price SET price = 0 WHERE price < 0;
        UPDATE trip_expense SET amount = 0 WHERE amount < 0;

        UPDATE event SET ticket_currency = NULL WHERE ticket_amount IS NULL;
        UPDATE event SET ticket_amount = NULL WHERE ticket_currency IS NULL;
        UPDATE event SET ticket_amount = 0 WHERE ticket_amount < 0;
        UPDATE event SET drink_currency = NULL WHERE drink_amount IS NULL;
        UPDATE event SET drink_amount = NULL WHERE drink_currency IS NULL;
        UPDATE event SET drink_amount = 0 WHERE drink_amount < 0;

        UPDATE cheki_entry
        SET idol_id = (SELECT ct.idol_id FROM cheki_type ct WHERE ct.id = cheki_entry.cheki_type_id),
            currency = (SELECT ct.currency FROM cheki_type ct WHERE ct.id = cheki_entry.cheki_type_id),
            unit_price = (SELECT ct.unit_price FROM cheki_type ct WHERE ct.id = cheki_entry.cheki_type_id),
            quantity = CASE WHEN quantity <= 0 THEN 1 ELSE quantity END
        WHERE EXISTS (SELECT 1 FROM cheki_type ct WHERE ct.id = cheki_entry.cheki_type_id);
        UPDATE cheki_entry
        SET group_membership_id = NULL
        WHERE group_membership_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.id = cheki_entry.group_membership_id AND gm.idol_id = cheki_entry.idol_id
          );
        UPDATE cheki_entry SET subtotal = quantity * unit_price;

        UPDATE group_membership
        SET member_color = NULL
        WHERE member_color IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM member_color mc WHERE mc.id = group_membership.member_color AND mc.deleted_at IS NULL);
        UPDATE group_membership
        SET hiatus_start_date = NULL, hiatus_end_date = NULL
        WHERE (hiatus_start_date IS NULL) != (hiatus_end_date IS NULL)
           OR (hiatus_start_date IS NOT NULL AND hiatus_end_date < hiatus_start_date)
           OR (hiatus_start_date IS NOT NULL AND hiatus_start_date < start_date)
           OR (hiatus_end_date IS NOT NULL AND end_date IS NOT NULL AND hiatus_end_date > end_date);
        UPDATE group_membership
        SET is_main = 0
        WHERE is_main = 1
          AND EXISTS (
            SELECT 1 FROM group_membership earlier
            WHERE earlier.idol_id = group_membership.idol_id
              AND earlier.is_main = 1
              AND earlier.deleted_at IS NULL
              AND earlier.id != group_membership.id
              AND earlier.start_date <= COALESCE(group_membership.end_date, '9999-12-31')
              AND group_membership.start_date <= COALESCE(earlier.end_date, '9999-12-31')
              AND (earlier.start_date < group_membership.start_date
                   OR (earlier.start_date = group_membership.start_date AND earlier.id < group_membership.id))
          );

        UPDATE trip_country
        SET deleted_at = updated_at
        WHERE deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM trip_country earlier
            WHERE earlier.trip_id = trip_country.trip_id
              AND earlier.country = trip_country.country
              AND earlier.deleted_at IS NULL
              AND earlier.id < trip_country.id
          );
      `);
    },
  },
  {
    version: 7,
    name: 'integrity-guards-and-hot-path-indexes',
    up: (db) => {
      db.execSync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_country_active_unique
          ON trip_country(trip_id, country) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_event_active_trip_date
          ON event(trip_id, event_date DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_event_active_venue_date
          ON event(venue_id, event_date DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_cheki_active_event_currency
          ON cheki_entry(event_id, currency) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_cheki_active_idol_currency_event
          ON cheki_entry(idol_id, currency, event_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_membership_active_group_dates
          ON group_membership(group_id, start_date, end_date) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_membership_active_idol_dates
          ON group_membership(idol_id, start_date, end_date) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_expense_active_trip_date
          ON trip_expense(trip_id, expense_date DESC) WHERE deleted_at IS NULL;

        CREATE TRIGGER validate_event_money_insert BEFORE INSERT ON event
        WHEN (NEW.ticket_amount IS NULL) != (NEW.ticket_currency IS NULL)
          OR (NEW.drink_amount IS NULL) != (NEW.drink_currency IS NULL)
          OR NEW.ticket_amount < 0 OR NEW.drink_amount < 0
        BEGIN SELECT RAISE(ABORT, 'invalid event money'); END;

        CREATE TRIGGER validate_event_money_update BEFORE UPDATE OF ticket_amount, ticket_currency, drink_amount, drink_currency ON event
        WHEN (NEW.ticket_amount IS NULL) != (NEW.ticket_currency IS NULL)
          OR (NEW.drink_amount IS NULL) != (NEW.drink_currency IS NULL)
          OR NEW.ticket_amount < 0 OR NEW.drink_amount < 0
        BEGIN SELECT RAISE(ABORT, 'invalid event money'); END;

        CREATE TRIGGER validate_cheki_amount_insert BEFORE INSERT ON cheki_entry
        WHEN NEW.quantity <= 0 OR NEW.unit_price < 0 OR NEW.subtotal != NEW.quantity * NEW.unit_price
        BEGIN SELECT RAISE(ABORT, 'invalid cheki amount'); END;

        CREATE TRIGGER validate_cheki_amount_update BEFORE UPDATE OF quantity, unit_price, subtotal ON cheki_entry
        WHEN NEW.quantity <= 0 OR NEW.unit_price < 0 OR NEW.subtotal != NEW.quantity * NEW.unit_price
        BEGIN SELECT RAISE(ABORT, 'invalid cheki amount'); END;

        CREATE TRIGGER validate_cheki_relation_insert BEFORE INSERT ON cheki_entry
        WHEN NOT EXISTS (
          SELECT 1 FROM cheki_type ct
          WHERE ct.id = NEW.cheki_type_id AND ct.idol_id = NEW.idol_id
            AND ct.currency = NEW.currency AND ct.unit_price = NEW.unit_price AND ct.deleted_at IS NULL
        ) OR (NEW.group_membership_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM group_membership gm
          WHERE gm.id = NEW.group_membership_id AND gm.idol_id = NEW.idol_id AND gm.deleted_at IS NULL
        ))
        BEGIN SELECT RAISE(ABORT, 'invalid cheki relation'); END;

        CREATE TRIGGER validate_cheki_relation_update BEFORE UPDATE OF idol_id, group_membership_id, cheki_type_id, currency, unit_price ON cheki_entry
        WHEN NOT EXISTS (
          SELECT 1 FROM cheki_type ct
          WHERE ct.id = NEW.cheki_type_id AND ct.idol_id = NEW.idol_id
            AND ct.currency = NEW.currency AND ct.unit_price = NEW.unit_price AND ct.deleted_at IS NULL
        ) OR (NEW.group_membership_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM group_membership gm
          WHERE gm.id = NEW.group_membership_id AND gm.idol_id = NEW.idol_id AND gm.deleted_at IS NULL
        ))
        BEGIN SELECT RAISE(ABORT, 'invalid cheki relation'); END;

        CREATE TRIGGER validate_cheki_type_price_insert BEFORE INSERT ON cheki_type
        WHEN NEW.unit_price < 0 BEGIN SELECT RAISE(ABORT, 'invalid cheki type price'); END;
        CREATE TRIGGER validate_cheki_type_price_update BEFORE UPDATE OF unit_price ON cheki_type
        WHEN NEW.unit_price < 0 BEGIN SELECT RAISE(ABORT, 'invalid cheki type price'); END;
        CREATE TRIGGER validate_drink_price_insert BEFORE INSERT ON venue_drink_price
        WHEN NEW.price < 0 BEGIN SELECT RAISE(ABORT, 'invalid drink price'); END;
        CREATE TRIGGER validate_drink_price_update BEFORE UPDATE OF price ON venue_drink_price
        WHEN NEW.price < 0 BEGIN SELECT RAISE(ABORT, 'invalid drink price'); END;
        CREATE TRIGGER validate_expense_amount_insert BEFORE INSERT ON trip_expense
        WHEN NEW.amount < 0 BEGIN SELECT RAISE(ABORT, 'invalid expense amount'); END;
        CREATE TRIGGER validate_expense_amount_update BEFORE UPDATE OF amount ON trip_expense
        WHEN NEW.amount < 0 BEGIN SELECT RAISE(ABORT, 'invalid expense amount'); END;

        CREATE TRIGGER validate_membership_insert BEFORE INSERT ON group_membership
        WHEN NEW.start_date NOT GLOB '????-??-??' OR date(NEW.start_date) IS NULL
          OR (NEW.end_date IS NOT NULL AND (NEW.end_date NOT GLOB '????-??-??' OR date(NEW.end_date) IS NULL OR NEW.end_date < NEW.start_date))
          OR (NEW.status = 'grad' AND NEW.end_date IS NULL)
          OR (NEW.hiatus_start_date IS NULL) != (NEW.hiatus_end_date IS NULL)
          OR (NEW.hiatus_start_date IS NOT NULL AND (NEW.hiatus_start_date < NEW.start_date OR NEW.hiatus_end_date < NEW.hiatus_start_date
              OR (NEW.end_date IS NOT NULL AND NEW.hiatus_end_date > NEW.end_date)))
          OR (NEW.member_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM member_color mc WHERE mc.id = NEW.member_color AND mc.deleted_at IS NULL))
          OR (NEW.is_main = 1 AND EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = NEW.idol_id AND gm.is_main = 1 AND gm.deleted_at IS NULL
              AND gm.start_date <= COALESCE(NEW.end_date, '9999-12-31')
              AND NEW.start_date <= COALESCE(gm.end_date, '9999-12-31')
          ))
        BEGIN SELECT RAISE(ABORT, 'invalid Main membership or membership dates'); END;

        CREATE TRIGGER validate_membership_update BEFORE UPDATE OF idol_id, start_date, end_date, status, hiatus_start_date, hiatus_end_date, member_color, is_main ON group_membership
        WHEN NEW.start_date NOT GLOB '????-??-??' OR date(NEW.start_date) IS NULL
          OR (NEW.end_date IS NOT NULL AND (NEW.end_date NOT GLOB '????-??-??' OR date(NEW.end_date) IS NULL OR NEW.end_date < NEW.start_date))
          OR (NEW.status = 'grad' AND NEW.end_date IS NULL)
          OR (NEW.hiatus_start_date IS NULL) != (NEW.hiatus_end_date IS NULL)
          OR (NEW.hiatus_start_date IS NOT NULL AND (NEW.hiatus_start_date < NEW.start_date OR NEW.hiatus_end_date < NEW.hiatus_start_date
              OR (NEW.end_date IS NOT NULL AND NEW.hiatus_end_date > NEW.end_date)))
          OR (NEW.member_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM member_color mc WHERE mc.id = NEW.member_color AND mc.deleted_at IS NULL))
          OR (NEW.is_main = 1 AND EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = NEW.idol_id AND gm.is_main = 1 AND gm.deleted_at IS NULL AND gm.id != NEW.id
              AND gm.start_date <= COALESCE(NEW.end_date, '9999-12-31')
              AND NEW.start_date <= COALESCE(gm.end_date, '9999-12-31')
          ))
        BEGIN SELECT RAISE(ABORT, 'invalid Main membership or membership dates'); END;
      `);
    },
  },
  {
    version: 8,
    name: 'idol-name-history-and-entry-display-snapshots',
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS idol_name_history (
          id TEXT PRIMARY KEY NOT NULL,
          idol_id TEXT NOT NULL REFERENCES idol(id),
          group_membership_id TEXT REFERENCES group_membership(id),
          name TEXT NOT NULL,
          effective_at TEXT NOT NULL,
          ${AUDIT_COLUMNS}
        );
        CREATE INDEX IF NOT EXISTS idx_idol_name_history_lookup
          ON idol_name_history(idol_id, group_membership_id, effective_at DESC)
          WHERE deleted_at IS NULL;

        ALTER TABLE cheki_entry ADD COLUMN idol_name_snapshot TEXT;
        ALTER TABLE cheki_entry ADD COLUMN group_name_snapshot TEXT;
        ALTER TABLE cheki_entry ADD COLUMN cheki_type_label_snapshot TEXT;

        INSERT INTO idol_name_history (
          id, idol_id, group_membership_id, name, effective_at,
          schema_version, created_at, updated_at, deleted_at
        )
        SELECT 'legacy-idol-name-' || id, id, NULL, name, created_at, 1, created_at, updated_at, deleted_at
        FROM idol;

        INSERT INTO idol_name_history (
          id, idol_id, group_membership_id, name, effective_at,
          schema_version, created_at, updated_at, deleted_at
        )
        SELECT 'legacy-membership-name-' || id, idol_id, id, name, start_date || 'T00:00:00.000Z',
          1, created_at, updated_at, deleted_at
        FROM group_membership WHERE name IS NOT NULL AND name != '';

        UPDATE cheki_entry
        SET idol_name_snapshot = COALESCE(
              (SELECT gm.name FROM group_membership gm WHERE gm.id = cheki_entry.group_membership_id),
              (SELECT i.name FROM idol i WHERE i.id = cheki_entry.idol_id)
            ),
            group_name_snapshot = (
              SELECT g.name FROM group_membership gm JOIN groups g ON g.id = gm.group_id
              WHERE gm.id = cheki_entry.group_membership_id
            ),
            cheki_type_label_snapshot = (
              SELECT ct.label FROM cheki_type ct WHERE ct.id = cheki_entry.cheki_type_id
            );
      `);
    },
  },
  {
    version: 9,
    name: 'venue-address',
    up: (db) => {
      db.execSync(`
        ALTER TABLE venue ADD COLUMN address TEXT;
      `);
    },
  },
  {
    version: 10,
    name: 'idol-and-group-social-profile-urls',
    up: (db) => {
      db.execSync(`
        ALTER TABLE idol ADD COLUMN x_profile_url TEXT;
        ALTER TABLE idol ADD COLUMN instagram_profile_url TEXT;
        ALTER TABLE idol ADD COLUMN tiktok_profile_url TEXT;
        ALTER TABLE groups ADD COLUMN x_profile_url TEXT;
        ALTER TABLE groups ADD COLUMN instagram_profile_url TEXT;
        ALTER TABLE groups ADD COLUMN tiktok_profile_url TEXT;
      `);
    },
  },
  {
    version: 11,
    name: 'google-drive-backup-local-state',
    up: (db) => {
      db.execSync(`
        CREATE TABLE drive_connection (
          id TEXT PRIMARY KEY NOT NULL CHECK (id = 'primary'),
          account_subject TEXT,
          account_email TEXT,
          account_display_name TEXT,
          device_id TEXT NOT NULL,
          device_label TEXT NOT NULL,
          connection_state TEXT NOT NULL CHECK (connection_state IN ('connected', 'disconnected', 'auth_required')),
          schedules_paused INTEGER NOT NULL DEFAULT 0 CHECK (schedules_paused IN (0, 1)),
          pause_reason TEXT CHECK (pause_reason IN ('disconnected', 'owner_changed', 'auth_required')),
          owner_last_checked_at TEXT,
          connected_at TEXT,
          disconnected_at TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE drive_backup_schedule (
          category TEXT PRIMARY KEY NOT NULL CHECK (category IN ('data', 'media')),
          frequency TEXT NOT NULL CHECK (frequency IN ('off', 'daily', 'weekly', 'monthly')),
          network_policy TEXT NOT NULL CHECK (network_policy IN ('any', 'wifi_only')),
          enabled_at TEXT,
          next_due_at TEXT,
          last_checked_at TEXT,
          last_attempt_at TEXT,
          last_success_at TEXT,
          last_fingerprint TEXT,
          last_result TEXT CHECK (last_result IN ('success', 'no_change', 'partial', 'failed', 'deferred')),
          paused_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE drive_backup_job (
          id TEXT PRIMARY KEY NOT NULL,
          batch_id TEXT,
          category TEXT NOT NULL CHECK (category IN ('data', 'media')),
          trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'startup_catchup', 'notification_retry')),
          state TEXT NOT NULL CHECK (state IN ('queued', 'preparing', 'uploading', 'verifying', 'committed', 'no_change', 'partial', 'failed', 'cancelled')),
          snapshot_id TEXT,
          remote_file_id TEXT,
          device_id TEXT NOT NULL,
          content_fingerprint TEXT,
          bytes_total INTEGER CHECK (bytes_total >= 0),
          bytes_uploaded INTEGER CHECK (bytes_uploaded >= 0),
          item_count INTEGER CHECK (item_count >= 0),
          error_code TEXT,
          error_detail_safe TEXT,
          cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_pending IN (0, 1)),
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );
        CREATE TABLE drive_upload_session (
          id TEXT PRIMARY KEY NOT NULL,
          job_id TEXT NOT NULL REFERENCES drive_backup_job(id) ON DELETE CASCADE,
          artifact_key TEXT NOT NULL,
          local_staging_path TEXT NOT NULL,
          session_uri_encrypted TEXT NOT NULL,
          uploaded_offset INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_offset >= 0),
          total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
          expires_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(job_id, artifact_key)
        );
        CREATE TABLE drive_operation_lock (
          id TEXT PRIMARY KEY NOT NULL CHECK (id = 'drive-backup'),
          holder_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          lease_expires_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_drive_backup_job_state ON drive_backup_job(state, created_at DESC);
        CREATE INDEX idx_drive_backup_schedule_due ON drive_backup_schedule(next_due_at);
        CREATE INDEX idx_drive_upload_session_job ON drive_upload_session(job_id);
        INSERT INTO drive_backup_schedule (category, frequency, network_policy, created_at, updated_at)
        VALUES ('data', 'off', 'any', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
               ('media', 'off', 'wifi_only', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
      `);
    },
  },
  {
    version: 12,
    name: 'drive-media-sha256-cache',
    up: (db) => {
      db.execSync(`
        CREATE TABLE drive_media_hash_cache (
          media_asset_id TEXT PRIMARY KEY NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
          source_size INTEGER NOT NULL CHECK (source_size >= 0),
          source_updated_at TEXT NOT NULL,
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 13,
    name: 'media-instax-preset',
    up: (db) => {
      const columns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(media_asset)').map((row) => row.name));
      if (!columns.has('instax_preset')) {
        db.runSync('ALTER TABLE media_asset ADD COLUMN instax_preset TEXT');
      }
      db.runSync(`UPDATE media_asset SET instax_preset = 'mini' WHERE kind = 'cheki' AND instax_preset IS NULL`);
    },
  },
  {
    version: 14,
    name: 'venue-drink-default-state',
    up: (db) => {
      const columns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(venue_drink_price)').map((row) => row.name));
      if (!columns.has('is_default')) {
        db.runSync('ALTER TABLE venue_drink_price ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
      }
      db.execSync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_drink_price_default_per_venue
          ON venue_drink_price(venue_id)
          WHERE is_default = 1 AND is_archived = 0 AND deleted_at IS NULL;
      `);
    },
  },
  {
    version: 15,
    name: 'cheki-type-default-state',
    up: (db) => {
      const columns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(cheki_type)').map((row) => row.name));
      if (!columns.has('is_default')) {
        db.runSync('ALTER TABLE cheki_type ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
      }
      db.execSync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cheki_type_default_per_idol
          ON cheki_type(idol_id)
          WHERE is_default = 1 AND is_archived = 0 AND deleted_at IS NULL;
      `);
    },
  },
  {
    version: 16,
    name: 'idol-media-display-snapshots',
    up: (db) => {
      const columns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(idol_media)').map((row) => row.name));
      if (!columns.has('idol_name_snapshot')) {
        db.runSync('ALTER TABLE idol_media ADD COLUMN idol_name_snapshot TEXT');
      }
      if (!columns.has('group_name_snapshot')) {
        db.runSync('ALTER TABLE idol_media ADD COLUMN group_name_snapshot TEXT');
      }

      const directMedia = db.getAllSync<{ mediaAssetId: string; idolId: string; createdAt: string }>(
        `SELECT im.media_asset_id AS mediaAssetId, im.idol_id AS idolId, ma.created_at AS createdAt
         FROM idol_media im
         JOIN media_asset ma ON ma.id = im.media_asset_id
         WHERE im.idol_name_snapshot IS NULL OR im.group_name_snapshot IS NULL`,
      );

      for (const media of directMedia) {
        const date = media.createdAt.slice(0, 10);
        const membership = db.getFirstSync<{ id: string; name: string | null; groupName: string | null }>(
          `SELECT gm.id, gm.name, g.name AS groupName
           FROM group_membership gm
           LEFT JOIN groups g ON g.id = gm.group_id
           WHERE gm.idol_id = ? AND gm.deleted_at IS NULL
             AND gm.start_date <= ? AND (gm.end_date IS NULL OR gm.end_date >= ?)
           ORDER BY gm.is_main DESC, gm.start_date DESC, gm.created_at DESC
           LIMIT 1`,
          media.idolId,
          date,
          date,
        );
        const history = db.getFirstSync<{ name: string }>(
          `SELECT history.name
           FROM idol_name_history history
           WHERE history.idol_id = ? AND history.deleted_at IS NULL
             AND substr(history.effective_at, 1, 10) <= ?
             AND (history.group_membership_id = ? OR history.group_membership_id IS NULL)
           ORDER BY CASE WHEN history.group_membership_id = ? THEN 0 ELSE 1 END,
             history.effective_at DESC, history.created_at DESC
           LIMIT 1`,
          media.idolId,
          date,
          membership?.id ?? null,
          membership?.id ?? null,
        );
        const idol = db.getFirstSync<{ name: string }>('SELECT name FROM idol WHERE id = ?', media.idolId);
        db.runSync(
          `UPDATE idol_media
           SET idol_name_snapshot = ?, group_name_snapshot = ?
           WHERE media_asset_id = ?`,
          history?.name ?? membership?.name ?? idol?.name ?? null,
          membership?.groupName ?? null,
          media.mediaAssetId,
        );
      }
    },
  },
  {
    version: 17,
    name: 'membership-status-periods',
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS group_membership_status_period (
          id TEXT PRIMARY KEY NOT NULL,
          group_membership_id TEXT NOT NULL REFERENCES group_membership(id),
          status TEXT NOT NULL CHECK (status IN ('active', 'hiatus')),
          start_date TEXT NOT NULL,
          end_date TEXT,
          ${AUDIT_COLUMNS}
        );

        CREATE INDEX IF NOT EXISTS idx_membership_period_membership_start
          ON group_membership_status_period(group_membership_id, start_date)
          WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_period_one_open
          ON group_membership_status_period(group_membership_id)
          WHERE end_date IS NULL AND deleted_at IS NULL;

        DROP TRIGGER IF EXISTS validate_membership_insert;
        DROP TRIGGER IF EXISTS validate_membership_update;

        CREATE TRIGGER validate_membership_insert BEFORE INSERT ON group_membership
        WHEN NEW.start_date NOT GLOB '????-??-??' OR date(NEW.start_date) IS NULL
          OR (NEW.end_date IS NOT NULL AND (NEW.end_date NOT GLOB '????-??-??' OR date(NEW.end_date) IS NULL OR NEW.end_date < NEW.start_date))
          OR (NEW.status = 'grad' AND NEW.end_date IS NULL)
          OR (NEW.hiatus_end_date IS NOT NULL AND NEW.hiatus_start_date IS NULL)
          OR (NEW.hiatus_start_date IS NOT NULL AND (NEW.hiatus_start_date NOT GLOB '????-??-??' OR date(NEW.hiatus_start_date) IS NULL OR NEW.hiatus_start_date < NEW.start_date))
          OR (NEW.hiatus_end_date IS NOT NULL AND (NEW.hiatus_end_date NOT GLOB '????-??-??' OR date(NEW.hiatus_end_date) IS NULL OR NEW.hiatus_end_date < NEW.hiatus_start_date
              OR (NEW.end_date IS NOT NULL AND NEW.hiatus_end_date > NEW.end_date)))
          OR (NEW.member_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM member_color mc WHERE mc.id = NEW.member_color AND mc.deleted_at IS NULL))
          OR (NEW.is_main = 1 AND EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = NEW.idol_id AND gm.is_main = 1 AND gm.deleted_at IS NULL
              AND gm.start_date <= COALESCE(NEW.end_date, '9999-12-31')
              AND NEW.start_date <= COALESCE(gm.end_date, '9999-12-31')
          ))
        BEGIN SELECT RAISE(ABORT, 'invalid Main membership or membership dates'); END;

        CREATE TRIGGER validate_membership_update BEFORE UPDATE OF idol_id, start_date, end_date, status, hiatus_start_date, hiatus_end_date, member_color, is_main ON group_membership
        WHEN NEW.start_date NOT GLOB '????-??-??' OR date(NEW.start_date) IS NULL
          OR (NEW.end_date IS NOT NULL AND (NEW.end_date NOT GLOB '????-??-??' OR date(NEW.end_date) IS NULL OR NEW.end_date < NEW.start_date))
          OR (NEW.status = 'grad' AND NEW.end_date IS NULL)
          OR (NEW.hiatus_end_date IS NOT NULL AND NEW.hiatus_start_date IS NULL)
          OR (NEW.hiatus_start_date IS NOT NULL AND (NEW.hiatus_start_date NOT GLOB '????-??-??' OR date(NEW.hiatus_start_date) IS NULL OR NEW.hiatus_start_date < NEW.start_date))
          OR (NEW.hiatus_end_date IS NOT NULL AND (NEW.hiatus_end_date NOT GLOB '????-??-??' OR date(NEW.hiatus_end_date) IS NULL OR NEW.hiatus_end_date < NEW.hiatus_start_date
              OR (NEW.end_date IS NOT NULL AND NEW.hiatus_end_date > NEW.end_date)))
          OR (NEW.member_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM member_color mc WHERE mc.id = NEW.member_color AND mc.deleted_at IS NULL))
          OR (NEW.is_main = 1 AND EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = NEW.idol_id AND gm.is_main = 1 AND gm.deleted_at IS NULL AND gm.id != NEW.id
              AND gm.start_date <= COALESCE(NEW.end_date, '9999-12-31')
              AND NEW.start_date <= COALESCE(gm.end_date, '9999-12-31')
          ))
        BEGIN SELECT RAISE(ABORT, 'invalid Main membership or membership dates'); END;
      `);

      const memberships = db.getAllSync<{
        id: string;
        startDate: string;
        endDate: string | null;
        status: 'active' | 'hiatus' | 'grad';
        hiatusStartDate: string | null;
        hiatusEndDate: string | null;
        createdAt: string;
        updatedAt: string;
      }>(
        `SELECT id, start_date AS startDate, end_date AS endDate, status,
          hiatus_start_date AS hiatusStartDate, hiatus_end_date AS hiatusEndDate,
          created_at AS createdAt, updated_at AS updatedAt
         FROM group_membership
         WHERE deleted_at IS NULL`,
      );

      for (const membership of memberships) {
        const existing = db.getFirstSync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM group_membership_status_period
           WHERE group_membership_id = ?`,
          membership.id,
        )?.count ?? 0;
        if (existing > 0) continue;

        const hasOneSidedHiatus = !!membership.hiatusStartDate !== !!membership.hiatusEndDate;
        const hasHiatus = !!membership.hiatusStartDate && !!membership.hiatusEndDate;
        const invalidBase = !isValidISODate(membership.startDate)
          || (!!membership.endDate && !isValidISODate(membership.endDate))
          || (!!membership.endDate && compareISODate(membership.endDate, membership.startDate) < 0)
          || (membership.status === 'grad' && !membership.endDate)
          || (membership.status === 'hiatus' && !hasHiatus)
          || hasOneSidedHiatus;
        const invalidHiatus = hasHiatus && (
          !isValidISODate(membership.hiatusStartDate!)
          || !isValidISODate(membership.hiatusEndDate!)
          || compareISODate(membership.hiatusStartDate!, membership.startDate) < 0
          || compareISODate(membership.hiatusEndDate!, membership.hiatusStartDate!) < 0
          || (!!membership.endDate && compareISODate(membership.hiatusEndDate!, membership.endDate) > 0)
        );
        if (invalidBase || invalidHiatus) continue;

        const periods: { status: 'active' | 'hiatus'; startDate: string; endDate: string | null }[] = [];
        if (hasHiatus) {
          periods.push({ status: 'active', startDate: membership.startDate, endDate: membership.hiatusStartDate });
          periods.push({ status: 'hiatus', startDate: membership.hiatusStartDate!, endDate: membership.hiatusEndDate });
          if (!membership.endDate || compareISODate(membership.hiatusEndDate!, membership.endDate) < 0) {
            periods.push({
              status: 'active',
              startDate: membership.hiatusEndDate!,
              endDate: membership.endDate,
            });
          }
        } else {
          periods.push({
            status: 'active',
            startDate: membership.startDate,
            endDate: membership.endDate,
          });
        }

        periods.forEach((period, index) => {
          db.runSync(
            `INSERT OR IGNORE INTO group_membership_status_period (
              id, group_membership_id, status, start_date, end_date,
              schema_version, created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
            `membership-period:${membership.id}:${index + 1}`,
            membership.id,
            period.status,
            period.startDate,
            period.endDate,
            membership.createdAt,
            membership.updatedAt,
          );
        });

        if (membership.status === 'hiatus' && hasHiatus) {
          db.runSync(
            `UPDATE group_membership SET status = 'active', updated_at = ? WHERE id = ?`,
            membership.updatedAt,
            membership.id,
          );
        }
      }

      db.execSync(`
        UPDATE idol
        SET status = CASE
          WHEN EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = idol.id AND gm.deleted_at IS NULL AND gm.status = 'active'
          ) THEN 'active'
          WHEN EXISTS (
            SELECT 1 FROM group_membership gm
            WHERE gm.idol_id = idol.id AND gm.deleted_at IS NULL AND gm.status = 'hiatus'
          ) THEN 'hiatus'
          ELSE 'inactive'
        END
        WHERE deleted_at IS NULL;
      `);
    },
  },
  {
    version: 18,
    name: 'm4-collection-indexes',
    up: (db) => {
      db.execSync(`
        CREATE INDEX IF NOT EXISTS idx_event_active_date_created_id
          ON event(event_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_event_active_created_id
          ON event(created_at DESC, id DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_idol_active_name_id
          ON idol(name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_groups_active_name_id
          ON groups(name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_idol_media_idol_created
          ON idol_media(idol_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_cheki_entry_idol_event
          ON cheki_entry(idol_id, event_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_trip_active_start_id
          ON trip(start_date DESC, id DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_venue_active_name_id
          ON venue(name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
      `);
    },
  },
];

export function getCurrentVersion(db: SqliteLike): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export function migrate(db: SqliteLike): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');

  // Recover databases from older builds whose version marker was written even
  // though a baseline table was not created, or whose tables predate baseline
  // columns that later migrations SELECT from.
  db.withTransactionSync(() => {
    ensureBaselineColumns(db);
    MIGRATIONS[0].up(db);
  });

  const current = getCurrentVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
  }

  // T0/T1 development builds briefly stamped v11 before the dedicated lock
  // table was finalized. This idempotent repair preserves those local databases.
  if (getCurrentVersion(db) >= 11) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS drive_operation_lock (
        id TEXT PRIMARY KEY NOT NULL CHECK (id = 'drive-backup'),
        holder_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        lease_expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}
