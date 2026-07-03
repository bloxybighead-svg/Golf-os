-- Competitive-round breakdown tags ("What broke down" multi-select, max 2)
-- Run this in the Supabase SQL editor before using the feature.
alter table rounds add column if not exists breakdown_tags text[] not null default '{}';
