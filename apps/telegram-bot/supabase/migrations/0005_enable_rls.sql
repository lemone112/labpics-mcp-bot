-- Migration 0005
-- Purpose: enable Row Level Security on all bot.* tables.
--
-- The bot backend uses service_role key which bypasses RLS.
-- Enabling RLS with no permissive policies for anon/authenticated
-- ensures zero public API access to these tables.

ALTER TABLE bot.telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.draft_apply_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.external_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.user_input_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.linear_users_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.linear_teams_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.linear_projects_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.draft_bulk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.deal_stage_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.deal_linear_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.project_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.reminders ENABLE ROW LEVEL SECURITY;
