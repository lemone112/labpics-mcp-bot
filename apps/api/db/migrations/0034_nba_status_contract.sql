-- Align next_best_actions status contract with API/UI
-- from: proposed, approved, done, cancelled
-- to:   proposed, accepted, dismissed, done, cancelled

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'next_best_actions_status_check'
  ) THEN
    ALTER TABLE next_best_actions DROP CONSTRAINT next_best_actions_status_check;
  END IF;
END $$;

UPDATE next_best_actions
SET status = 'accepted'
WHERE status = 'approved';

ALTER TABLE next_best_actions
  ADD CONSTRAINT next_best_actions_status_check
  CHECK (status IN ('proposed', 'accepted', 'dismissed', 'done', 'cancelled'));
