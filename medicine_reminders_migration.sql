-- Medicine Reminders Table
CREATE TABLE IF NOT EXISTS medicine_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT CHECK (frequency IN ('daily', 'twice_daily', 'weekly', 'as_needed')),
  times TEXT[], -- Array of times like ["08:00", "20:00"]
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medicine_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicine_reminders_own ON medicine_reminders TO service_role USING (true);
CREATE POLICY medicine_reminders_own_select ON medicine_reminders FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX medicine_reminders_user_active ON medicine_reminders(user_id, is_active);

GRANT ALL ON medicine_reminders TO service_role;