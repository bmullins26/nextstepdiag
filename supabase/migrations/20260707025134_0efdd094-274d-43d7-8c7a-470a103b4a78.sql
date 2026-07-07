
CREATE TABLE public.tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_type text NOT NULL,
  category text NOT NULL,
  subcategory text,
  tool_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  affiliate_url text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tools IS 'Master tool intelligence table. Future linkage tables (reserved, not yet created): tool_repair_links, tool_appliance_type_links, tool_reviews, tool_ownership, tool_videos.';

CREATE UNIQUE INDEX tools_name_category_ci_uniq
  ON public.tools (lower(tool_name), lower(category));
CREATE INDEX idx_tools_tool_type ON public.tools (tool_type);
CREATE INDEX idx_tools_category ON public.tools (category);
CREATE INDEX idx_tools_tool_name ON public.tools (tool_name);
CREATE INDEX idx_tools_active ON public.tools (active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT ALL ON public.tools TO service_role;

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active tools"
  ON public.tools FOR SELECT
  TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can insert tools"
  ON public.tools FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can update tools"
  ON public.tools FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can delete tools"
  ON public.tools FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER tools_set_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
