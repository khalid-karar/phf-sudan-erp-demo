-- Ledger guards: the database itself refuses unbalanced, edited or back-dated entries,
-- so no code path (API, script or manual SQL) can corrupt the books.

-- 1. Period (YYYY-MM) always follows the entry date.
CREATE OR REPLACE FUNCTION je_set_period() RETURNS trigger AS $$
BEGIN
  NEW.period := to_char(NEW.date, 'YYYY-MM');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER je_set_period BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION je_set_period();
--> statement-breakpoint

-- 2. Posted entries and lines are immutable. Corrections are made with a reversing entry.
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: posted journal entries cannot be changed or deleted; post a reversal instead'
    USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER je_immutable BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint
CREATE TRIGGER jl_immutable BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
--> statement-breakpoint

-- 3. Each line: postable, active account; SDG accounts carry their SDG amount; office period still open.
CREATE OR REPLACE FUNCTION jl_check_line() RETURNS trigger AS $$
DECLARE
  acc record;
  p text;
BEGIN
  SELECT postable, active, currency INTO acc FROM accounts WHERE code = NEW.account_code;
  IF NOT acc.postable THEN
    RAISE EXCEPTION 'LEDGER_HEADER_ACCOUNT: account % is a header account and cannot take entries', NEW.account_code USING ERRCODE = 'P0001';
  END IF;
  IF NOT acc.active THEN
    RAISE EXCEPTION 'LEDGER_INACTIVE_ACCOUNT: account % is inactive', NEW.account_code USING ERRCODE = 'P0001';
  END IF;
  IF acc.currency = 'SDG' AND NEW.sdg IS NULL THEN
    RAISE EXCEPTION 'LEDGER_SDG_MISSING: account % is an SDG account; the SDG amount is required', NEW.account_code USING ERRCODE = 'P0001';
  END IF;
  SELECT period INTO p FROM journal_entries WHERE id = NEW.entry_id;
  -- Shared lock: postings run side by side, but a month close (exclusive lock on the same key)
  -- waits for in-flight postings to commit, and postings wait while a close is committing.
  PERFORM pg_advisory_xact_lock_shared(hashtext('close:' || p || ':' || NEW.office_id));
  IF EXISTS (SELECT 1 FROM period_closes WHERE period = p AND office_id = NEW.office_id AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'LEDGER_PERIOD_CLOSED: % is closed for office %', p, NEW.office_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER jl_check_line BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION jl_check_line();
--> statement-breakpoint

-- 4. Every entry balances (checked at commit, after all its lines are in) and has at least two lines.
CREATE OR REPLACE FUNCTION je_check_balanced() RETURNS trigger AS $$
DECLARE
  d numeric;
  c numeric;
  n int;
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) INTO d, c, n
    FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF n < 2 THEN
    RAISE EXCEPTION 'LEDGER_TOO_FEW_LINES: entry % needs at least two lines', NEW.entry_id USING ERRCODE = 'P0001';
  END IF;
  IF d <> c THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: entry % has debits % and credits %', NEW.entry_id, d, c USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER jl_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION je_check_balanced();
--> statement-breakpoint

-- 5. An entry with no lines at all is also rejected at commit.
CREATE OR REPLACE FUNCTION je_check_has_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id = NEW.id) THEN
    RAISE EXCEPTION 'LEDGER_TOO_FEW_LINES: entry % has no lines', NEW.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER je_has_lines AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION je_check_has_lines();
--> statement-breakpoint

-- 6. Office filter used by period checks and office reports.
CREATE INDEX IF NOT EXISTS journal_lines_office_idx ON journal_lines (office_id);
