-- A posted spending line may be linked to the field activity it paid for after the fact (the technical report and the
-- spending are matched). That is the only change allowed on a posted line: the activity can be set once, from empty,
-- and nothing else about the line (amounts, accounts, dates) may differ.
CREATE OR REPLACE FUNCTION jl_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.activity_id IS NULL AND NEW.activity_id IS NOT NULL
     AND (to_jsonb(NEW) - 'activity_id') = (to_jsonb(OLD) - 'activity_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: posted journal entries cannot be changed or deleted; post a reversal instead'
    USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS jl_immutable ON journal_lines;
--> statement-breakpoint
CREATE TRIGGER jl_immutable BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION jl_guard();
