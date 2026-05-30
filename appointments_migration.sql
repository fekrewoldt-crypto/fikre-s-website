-- Doctors Table
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  hospital_id UUID, -- References hospitals table if exists
  phone TEXT,
  available_days TEXT[], -- ['monday', 'tuesday', ...]
  consultation_fee DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed some test doctors
INSERT INTO doctors (name, specialty, phone, available_days, consultation_fee) VALUES
('Dr. Abraham Belete', 'General Practitioner', '+251-911-123-456', ARRAY['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'], 200.00),
('Dr. Tigist Haile', 'Pediatrician', '+251-911-234-567', ARRAY['monday', 'tuesday', 'wednesday', 'thursday'], 350.00),
('Dr. Yohannes Mekonnen', 'Internal Medicine', '+251-911-345-678', ARRAY['sunday', 'monday', 'wednesday', 'friday'], 400.00)
ON CONFLICT DO NOTHING;

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctors_all ON doctors TO service_role USING (true);
CREATE POLICY doctors_read ON doctors FOR SELECT USING (true);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_user ON appointments TO service_role USING (true);
CREATE POLICY appointments_user_select ON appointments FOR SELECT USING (user_id = auth.uid());

CREATE INDEX appointments_user_date ON appointments(user_id, appointment_date);

GRANT ALL ON doctors TO service_role;
GRANT ALL ON appointments TO service_role;