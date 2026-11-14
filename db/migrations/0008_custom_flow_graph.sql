alter table instagram_automations
  add column if not exists flow_graph jsonb;
