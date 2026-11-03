ALTER TABLE tenants
  ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Belgrade',
  ADD COLUMN working_hours JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN handover_keywords TEXT[] NOT NULL DEFAULT ARRAY[
    'zelim da pricam sa covekom',
    'hocu operatera',
    'agent',
    'covek',
    'operater'
  ]::TEXT[];
