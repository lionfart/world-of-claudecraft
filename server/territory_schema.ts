// Mutable seasonal territory state. Static q/r topology, terrain and resource
// placement live in the versioned manifest and are intentionally not duplicated
// here. All live tables key through season_id so a season closes by pointer swap,
// never a blocking delete from the active dataset.
export const TERRITORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS territory_seasons (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  season_no INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'closing', 'closed')),
  manifest_version INT NOT NULL,
  manifest_checksum TEXT NOT NULL,
  radius INT NOT NULL CHECK (radius BETWEEN 20 AND 141),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (realm, season_no),
  CHECK (ends_at > starts_at)
);
-- Manifest v1 seasons used radius 63 to 141. Manifest v2 uses radius 20 to 44,
-- while closed v1 rows remain as retained history, so the durable constraint
-- must accept both ranges. Replacing the old generated-name constraint is the
-- idempotent upgrade path for databases created before manifest v2.
ALTER TABLE territory_seasons
  DROP CONSTRAINT IF EXISTS territory_seasons_radius_check;
ALTER TABLE territory_seasons
  ADD CONSTRAINT territory_seasons_radius_check CHECK (radius BETWEEN 20 AND 141);
CREATE UNIQUE INDEX IF NOT EXISTS territory_seasons_one_active
  ON territory_seasons(realm) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS territory_seasons_retention
  ON territory_seasons(status, closed_at) WHERE status = 'closed';

CREATE TABLE IF NOT EXISTS territory_guild_state (
  season_id BIGINT NOT NULL REFERENCES territory_seasons(id) ON DELETE CASCADE,
  guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  territory_level SMALLINT NOT NULL DEFAULT 1 CHECK (territory_level BETWEEN 1 AND 5),
  wood BIGINT NOT NULL DEFAULT 250 CHECK (wood >= 0),
  iron BIGINT NOT NULL DEFAULT 250 CHECK (iron >= 0),
  grain BIGINT NOT NULL DEFAULT 250 CHECK (grain >= 0),
  labor BIGINT NOT NULL DEFAULT 250 CHECK (labor >= 0),
  accrued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, guild_id)
);

CREATE TABLE IF NOT EXISTS territory_cells (
  season_id BIGINT NOT NULL REFERENCES territory_seasons(id) ON DELETE CASCADE,
  cell_id INT NOT NULL,
  guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  keep_root BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, cell_id)
);
CREATE INDEX IF NOT EXISTS territory_cells_owner
  ON territory_cells(season_id, guild_id, cell_id);
CREATE INDEX IF NOT EXISTS territory_cells_keep_roots
  ON territory_cells(season_id, guild_id, cell_id) WHERE keep_root;

CREATE TABLE IF NOT EXISTS territory_structures (
  season_id BIGINT NOT NULL,
  cell_id INT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN (
    'keep_core', 'walls', 'towers', 'granary', 'forester', 'mine', 'house',
    'siege_workshop', 'gate', 'wall', 'tower_north', 'tower_south', 'storehouse',
    'construction_workshop'
  )),
  kind TEXT NOT NULL CHECK (kind IN (
    'keep', 'walls', 'towers', 'granary', 'forester', 'mine', 'house',
    'siege_workshop', 'gate', 'wall', 'defense_tower', 'storehouse',
    'construction_workshop'
  )),
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  target_level SMALLINT CHECK (target_level BETWEEN 1 AND 5),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('building', 'active')),
  completes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, cell_id, slot),
  FOREIGN KEY (season_id, cell_id)
    REFERENCES territory_cells(season_id, cell_id) ON DELETE CASCADE
);
ALTER TABLE territory_structures
  ADD COLUMN IF NOT EXISTS target_level SMALLINT CHECK (target_level BETWEEN 1 AND 5);
-- Older deployments created generated-name checks containing only the legacy
-- building set. Replace them idempotently while keeping those values readable
-- until their seasonal rows naturally expire.
ALTER TABLE territory_structures DROP CONSTRAINT IF EXISTS territory_structures_slot_check;
ALTER TABLE territory_structures DROP CONSTRAINT IF EXISTS territory_structures_kind_check;
ALTER TABLE territory_structures ADD CONSTRAINT territory_structures_slot_check CHECK (slot IN (
  'keep_core', 'walls', 'towers', 'granary', 'forester', 'mine', 'house',
  'siege_workshop', 'gate', 'wall', 'tower_north', 'tower_south', 'storehouse',
  'construction_workshop'
));
ALTER TABLE territory_structures ADD CONSTRAINT territory_structures_kind_check CHECK (kind IN (
  'keep', 'walls', 'towers', 'granary', 'forester', 'mine', 'house',
  'siege_workshop', 'gate', 'wall', 'defense_tower', 'storehouse',
  'construction_workshop'
));
CREATE INDEX IF NOT EXISTS territory_structures_due
  ON territory_structures(completes_at) WHERE state = 'building';

CREATE TABLE IF NOT EXISTS territory_wars (
  id UUID PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES territory_seasons(id) ON DELETE CASCADE,
  target_cell_id INT NOT NULL,
  attacker_guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  defender_guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('declared', 'forming', 'active', 'resolved', 'cancelled')),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  winner_guild_id INT REFERENCES guilds(id) ON DELETE SET NULL,
  result_reason TEXT,
  CHECK (attacker_guild_id <> defender_guild_id),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS territory_wars_one_live_target
  ON territory_wars(season_id, target_cell_id)
  WHERE status IN ('declared', 'forming', 'active');
CREATE INDEX IF NOT EXISTS territory_wars_scheduler
  ON territory_wars(season_id, status, starts_at, ends_at)
  WHERE status IN ('declared', 'forming', 'active');
CREATE INDEX IF NOT EXISTS territory_wars_attacker_window
  ON territory_wars(season_id, attacker_guild_id, starts_at, ends_at)
  WHERE status IN ('declared', 'forming', 'active');
CREATE INDEX IF NOT EXISTS territory_wars_defender_window
  ON territory_wars(season_id, defender_guild_id, starts_at, ends_at)
  WHERE status IN ('declared', 'forming', 'active');
CREATE INDEX IF NOT EXISTS territory_wars_resolved_retention
  ON territory_wars(resolved_at, id) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS territory_wars_attacker_guild_fk
  ON territory_wars(attacker_guild_id);
CREATE INDEX IF NOT EXISTS territory_wars_defender_guild_fk
  ON territory_wars(defender_guild_id);
CREATE INDEX IF NOT EXISTS territory_wars_winner_guild_fk
  ON territory_wars(winner_guild_id) WHERE winner_guild_id IS NOT NULL;

ALTER TABLE territory_wars DROP CONSTRAINT IF EXISTS territory_wars_attacker_guild_id_fkey;
ALTER TABLE territory_wars ADD CONSTRAINT territory_wars_attacker_guild_id_fkey
  FOREIGN KEY (attacker_guild_id) REFERENCES guilds(id) ON DELETE CASCADE;
ALTER TABLE territory_wars DROP CONSTRAINT IF EXISTS territory_wars_defender_guild_id_fkey;
ALTER TABLE territory_wars ADD CONSTRAINT territory_wars_defender_guild_id_fkey
  FOREIGN KEY (defender_guild_id) REFERENCES guilds(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS territory_war_participants (
  war_id UUID NOT NULL REFERENCES territory_wars(id) ON DELETE CASCADE,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('attacker', 'defender')),
  seat_no SMALLINT CHECK (seat_no BETWEEN 1 AND 20),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (war_id, character_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS territory_war_participants_live_seat
  ON territory_war_participants(war_id, side, seat_no)
  WHERE left_at IS NULL AND seat_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS territory_war_participants_character_fk
  ON territory_war_participants(character_id);
CREATE INDEX IF NOT EXISTS territory_war_participants_guild_fk
  ON territory_war_participants(guild_id);

ALTER TABLE territory_war_participants
  DROP CONSTRAINT IF EXISTS territory_war_participants_guild_id_fkey;
ALTER TABLE territory_war_participants
  ADD CONSTRAINT territory_war_participants_guild_id_fkey
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS territory_changes (
  season_id BIGINT NOT NULL REFERENCES territory_seasons(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, revision)
);
CREATE INDEX IF NOT EXISTS territory_changes_retention_v2
  ON territory_changes(created_at, season_id, revision);

CREATE TABLE IF NOT EXISTS territory_audit (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT REFERENCES territory_seasons(id) ON DELETE SET NULL,
  command_id UUID UNIQUE,
  actor_character_id INT REFERENCES characters(id) ON DELETE SET NULL,
  guild_id INT REFERENCES guilds(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_cell_id INT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS territory_audit_retention_v2
  ON territory_audit(created_at, id);
CREATE INDEX IF NOT EXISTS territory_audit_guild_time
  ON territory_audit(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS territory_audit_season_fk
  ON territory_audit(season_id) WHERE season_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS territory_audit_actor_fk
  ON territory_audit(actor_character_id) WHERE actor_character_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS territory_guild_state_guild_fk
  ON territory_guild_state(guild_id);
CREATE INDEX IF NOT EXISTS territory_cells_guild_fk
  ON territory_cells(guild_id);
`;
