
CREATE TABLE public.error_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  code text NOT NULL,
  meaning text NOT NULL,
  common_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, code)
);

GRANT SELECT ON public.error_codes TO authenticated;
GRANT ALL ON public.error_codes TO service_role;

ALTER TABLE public.error_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read error codes"
  ON public.error_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_error_codes_updated_at
  BEFORE UPDATE ON public.error_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.error_codes (brand, code, meaning, common_causes, recommended_tests) VALUES
('Whirlpool', 'F0E1', 'Load detected in washer at startup', '["Items left in drum","Drain pump not fully evacuating"]'::jsonb, '["Open door and verify drum is empty","Run drain-only cycle and confirm pump operation"]'::jsonb),
('Whirlpool', 'F0E2', 'Excessive suds detected', '["Too much detergent","Non-HE detergent used in HE washer"]'::jsonb, '["Run rinse and spin to clear suds","Verify HE detergent is being used"]'::jsonb),
('Whirlpool', 'F1E1', 'Main control board fault', '["Failed main control","Loose harness on control"]'::jsonb, '["Reseat control board harness","Replace main control board if fault persists after power cycle"]'::jsonb),
('Whirlpool', 'F3E1', 'Pressure sensor fault', '["Clogged pressure hose","Failed pressure sensor"]'::jsonb, '["Inspect pressure hose for kinks or blockage","Measure pressure sensor resistance per service manual"]'::jsonb),
('Whirlpool', 'F5E2', 'Door lock failure', '["Door lock assembly failed","Wiring open to door lock"]'::jsonb, '["Check continuity of door lock solenoid","Replace door lock if no continuity"]'::jsonb),
('Whirlpool', 'F7E1', 'Motor speed sensor fault', '["Tachometer failed","Drive motor wiring loose"]'::jsonb, '["Inspect motor harness","Check tachometer signal at control"]'::jsonb),
('Whirlpool', 'F8E1', 'No water detected', '["Inlet hoses kinked","Water valve failed","Low household water pressure"]'::jsonb, '["Verify water supply is open","Test inlet valve resistance and voltage"]'::jsonb),
('Whirlpool', 'F9E1', 'Long drain', '["Drain hose kinked or clogged","Drain pump failed"]'::jsonb, '["Clear drain hose and filter","Verify drain pump runs and pumps water"]'::jsonb),

('GE (General Electric)', 'E22', 'Refrigerator dispenser switch stuck', '["Stuck dispenser cradle","Failed dispenser switch"]'::jsonb, '["Verify dispenser cradle returns freely","Test dispenser switch continuity"]'::jsonb),
('GE (General Electric)', 'E23', 'Freezer thermistor fault', '["Open thermistor","Wiring open to thermistor"]'::jsonb, '["Measure thermistor resistance vs spec at temperature","Inspect harness to thermistor"]'::jsonb),
('GE (General Electric)', 'tE', 'Thermistor error (range)', '["Failed oven thermistor","Open/short in thermistor wiring"]'::jsonb, '["Measure thermistor resistance at room temp (~1080Ω at 75°F)","Inspect harness for damage"]'::jsonb),
('GE (General Electric)', 'F3', 'Oven temperature sensor open', '["Oven sensor failed open","Sensor harness disconnected"]'::jsonb, '["Disconnect sensor and read resistance","Replace if out of spec"]'::jsonb),
('GE (General Electric)', 'F7', 'Stuck keypad on range', '["Damaged keypad","Moisture under keypad"]'::jsonb, '["Disconnect keypad ribbon and observe if fault clears","Replace keypad if fault returns"]'::jsonb),

('Samsung', 'SE', 'Communication error between PCBs', '["Loose ribbon cable between display and main PCB","Failed display board"]'::jsonb, '["Power down, reseat all PCB ribbons","Inspect for moisture damage on PCBs"]'::jsonb),
('Samsung', 'SUD', 'Excessive suds in washer', '["Too much detergent","Wrong detergent type"]'::jsonb, '["Run rinse + spin","Recommend HE detergent only"]'::jsonb),
('Samsung', '4C', 'Water supply error', '["Closed water valves","Clogged inlet screens","Failed water valve"]'::jsonb, '["Verify both supply valves are open","Clean inlet filter screens","Test inlet valve coils"]'::jsonb),
('Samsung', '5C', 'Drain error', '["Clogged drain pump filter","Kinked drain hose"]'::jsonb, '["Clean pump filter","Verify hose is not kinked or installed too high"]'::jsonb),
('Samsung', 'OE', 'Refrigerator defrost sensor error', '["Failed defrost sensor","Defrost heater open"]'::jsonb, '["Measure defrost sensor resistance","Check defrost heater continuity"]'::jsonb),

('LG', 'IE', 'Inlet water fill error', '["Supply valves closed","Failed inlet valve","Clogged inlet screen"]'::jsonb, '["Verify water supply","Test inlet valve coil resistance","Clean inlet screens"]'::jsonb),
('LG', 'OE', 'Drain error', '["Clogged pump filter","Failed drain pump"]'::jsonb, '["Clean drain pump filter","Verify drain pump operation on a drain test"]'::jsonb),
('LG', 'UE', 'Unbalanced load', '["Load piled to one side","Damaged shock absorbers or suspension"]'::jsonb, '["Redistribute load","Inspect shock absorbers and springs"]'::jsonb),
('LG', 'LE', 'Motor locked', '["Foreign object jamming drum","Failed Hall sensor","Failed motor"]'::jsonb, '["Inspect drum for obstructions","Test Hall sensor and motor windings"]'::jsonb),
('LG', 'CL', 'Child lock active (info only)', '["Child lock enabled"]'::jsonb, '["Press and hold child lock buttons 3 seconds to disable"]'::jsonb),

('Bosch', 'E15', 'Water leak detected by tray sensor', '["Leak into base pan triggered float switch","Hose connection loose"]'::jsonb, '["Tip unit to drain base pan","Inspect all internal hoses and pump seals"]'::jsonb),
('Bosch', 'E24', 'Drain blocked', '["Clogged drain filter","Blocked drain hose"]'::jsonb, '["Clean dishwasher filter","Inspect drain hose and air gap"]'::jsonb),
('Bosch', 'E25', 'Drain pump fault', '["Drain pump impeller jammed","Failed drain pump"]'::jsonb, '["Remove debris from pump","Test pump motor resistance"]'::jsonb);
