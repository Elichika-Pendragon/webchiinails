-- Independent singleton price catalog. No booking rows or payment rules change.
CREATE TABLE IF NOT EXISTS site_prices (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  catalog TEXT NOT NULL CHECK (json_valid(catalog)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);
