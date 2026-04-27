-- Ocean World SurrealDB schema. See docs/05-storage.md.
-- Run via: surreal sql --conn http://localhost:8000 --user root --pass root --ns ocean --db world < schema.surql

DEFINE NAMESPACE IF NOT EXISTS ocean;
USE NS ocean;
DEFINE DATABASE IF NOT EXISTS world;
USE NS ocean DB world;

-- Entity instances -------------------------------------------------------
DEFINE TABLE IF NOT EXISTS entity SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON entity TYPE string;
DEFINE FIELD IF NOT EXISTS archetype ON entity TYPE string;
DEFINE FIELD IF NOT EXISTS behaviors ON entity TYPE array<string>;
DEFINE FIELD IF NOT EXISTS active_behavior ON entity TYPE string;
DEFINE FIELD IF NOT EXISTS created_tick ON entity TYPE int;
DEFINE FIELD IF NOT EXISTS created_at ON entity TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS idx_archetype ON entity FIELDS archetype;

-- Component tables -------------------------------------------------------
DEFINE TABLE IF NOT EXISTS physical_state SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS entity ON physical_state TYPE record<entity>;
DEFINE FIELD IF NOT EXISTS x ON physical_state TYPE float;
DEFINE FIELD IF NOT EXISTS y ON physical_state TYPE float;
DEFINE FIELD IF NOT EXISTS speed ON physical_state TYPE float;
DEFINE FIELD IF NOT EXISTS perception_radius ON physical_state TYPE float;
DEFINE FIELD IF NOT EXISTS energy ON physical_state TYPE float;
DEFINE FIELD IF NOT EXISTS dest_x ON physical_state TYPE option<float>;
DEFINE FIELD IF NOT EXISTS dest_y ON physical_state TYPE option<float>;
DEFINE INDEX IF NOT EXISTS idx_entity ON physical_state FIELDS entity UNIQUE;

DEFINE TABLE IF NOT EXISTS financial_state SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS entity ON financial_state TYPE record<entity>;
DEFINE FIELD IF NOT EXISTS money ON financial_state TYPE float;
DEFINE FIELD IF NOT EXISTS goods ON financial_state TYPE float;
DEFINE INDEX IF NOT EXISTS idx_entity ON financial_state FIELDS entity UNIQUE;

DEFINE TABLE IF NOT EXISTS cognitive_state SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS entity ON cognitive_state TYPE record<entity>;
DEFINE FIELD IF NOT EXISTS values ON cognitive_state FLEXIBLE TYPE object;
DEFINE FIELD IF NOT EXISTS attention_focus ON cognitive_state TYPE option<string>;
DEFINE FIELD IF NOT EXISTS working_memory_load ON cognitive_state TYPE float;
DEFINE INDEX IF NOT EXISTS idx_entity ON cognitive_state FIELDS entity UNIQUE;

DEFINE TABLE IF NOT EXISTS inventory_state SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS entity ON inventory_state TYPE record<entity>;
DEFINE FIELD IF NOT EXISTS items ON inventory_state FLEXIBLE TYPE object;
DEFINE INDEX IF NOT EXISTS idx_entity ON inventory_state FIELDS entity UNIQUE;

DEFINE TABLE IF NOT EXISTS memory_log SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS entity ON memory_log TYPE record<entity>;
DEFINE FIELD IF NOT EXISTS recent ON memory_log FLEXIBLE TYPE array;
DEFINE INDEX IF NOT EXISTS idx_entity ON memory_log FIELDS entity UNIQUE;

-- Relations --------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS employs TYPE RELATION IN entity OUT entity;
DEFINE FIELD IF NOT EXISTS since ON employs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS role ON employs TYPE string DEFAULT "";

DEFINE TABLE IF NOT EXISTS trusts TYPE RELATION IN entity OUT entity;
DEFINE FIELD IF NOT EXISTS weight ON trusts TYPE float DEFAULT 0.5;
DEFINE FIELD IF NOT EXISTS context ON trusts TYPE string DEFAULT "";

DEFINE TABLE IF NOT EXISTS member_of TYPE RELATION IN entity OUT entity;
DEFINE FIELD IF NOT EXISTS role ON member_of TYPE string DEFAULT "";

-- Event log --------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS event SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS tick ON event TYPE int;
DEFINE FIELD IF NOT EXISTS kind ON event TYPE string;
DEFINE FIELD IF NOT EXISTS source ON event TYPE string;
DEFINE FIELD IF NOT EXISTS target ON event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS summary ON event TYPE string;
DEFINE INDEX IF NOT EXISTS idx_tick ON event FIELDS tick;
DEFINE INDEX IF NOT EXISTS idx_kind ON event FIELDS kind;
DEFINE INDEX IF NOT EXISTS idx_source ON event FIELDS source;

-- Ontology cache ---------------------------------------------------------
DEFINE TABLE IF NOT EXISTS component_def SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON component_def TYPE string;
DEFINE FIELD IF NOT EXISTS category ON component_def TYPE string;
DEFINE FIELD IF NOT EXISTS domain ON component_def TYPE string;
DEFINE FIELD IF NOT EXISTS description ON component_def TYPE string;
DEFINE FIELD IF NOT EXISTS fields ON component_def FLEXIBLE TYPE array;
DEFINE FIELD IF NOT EXISTS composable_with ON component_def TYPE array<string>;
DEFINE FIELD IF NOT EXISTS embedding ON component_def TYPE option<array<float>>;
DEFINE INDEX IF NOT EXISTS idx_name ON component_def FIELDS name UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_domain ON component_def FIELDS domain;

DEFINE TABLE IF NOT EXISTS behavior_def SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON behavior_def TYPE string;
DEFINE FIELD IF NOT EXISTS domain ON behavior_def TYPE string;
DEFINE FIELD IF NOT EXISTS description ON behavior_def TYPE string;
DEFINE FIELD IF NOT EXISTS required_components ON behavior_def TYPE array<string>;
DEFINE FIELD IF NOT EXISTS reads ON behavior_def TYPE array<string>;
DEFINE FIELD IF NOT EXISTS writes ON behavior_def TYPE array<string>;
DEFINE FIELD IF NOT EXISTS actions ON behavior_def FLEXIBLE TYPE array;
DEFINE FIELD IF NOT EXISTS state_machine ON behavior_def FLEXIBLE TYPE object;
DEFINE FIELD IF NOT EXISTS embedding ON behavior_def TYPE option<array<float>>;
DEFINE INDEX IF NOT EXISTS idx_name ON behavior_def FIELDS name UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_domain ON behavior_def FIELDS domain;

DEFINE TABLE IF NOT EXISTS archetype_def SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON archetype_def TYPE string;
DEFINE FIELD IF NOT EXISTS scale ON archetype_def TYPE string;
DEFINE FIELD IF NOT EXISTS components ON archetype_def TYPE array<string>;
DEFINE FIELD IF NOT EXISTS behaviors ON archetype_def TYPE array<string>;
DEFINE INDEX IF NOT EXISTS idx_name ON archetype_def FIELDS name UNIQUE;

DEFINE TABLE IF NOT EXISTS concept SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS kind ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS domain ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS description ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON concept TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS idx_domain ON concept FIELDS domain;
DEFINE INDEX IF NOT EXISTS idx_kind ON concept FIELDS kind;

DEFINE TABLE IF NOT EXISTS rejected_candidate SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON rejected_candidate TYPE string;
DEFINE FIELD IF NOT EXISTS kind ON rejected_candidate TYPE string;
DEFINE FIELD IF NOT EXISTS domain ON rejected_candidate TYPE string;
DEFINE FIELD IF NOT EXISTS rejection_reason ON rejected_candidate TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON rejected_candidate TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS idx_domain ON rejected_candidate FIELDS domain;
