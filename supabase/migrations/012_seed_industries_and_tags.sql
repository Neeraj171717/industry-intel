-- ============================================================
-- Industry Intelligence — Seed Industries & Topic Tags
-- 012_seed_industries_and_tags.sql
--
-- Seeds the six industry spaces + their topic tags used by the
-- end-user preferences flow. Idempotent: re-running will not
-- duplicate rows. Existing Digital Marketing space is kept and
-- any missing tags are added.
-- ============================================================

DO $$
DECLARE
  v_space_id  UUID;
  v_industry  TEXT;
  v_desc      TEXT;
  v_tag       TEXT;
  industries  TEXT[][] := ARRAY[
    ARRAY['Digital Marketing',      'SEO, paid ads, content, analytics, and growth.'],
    ARRAY['Technology & AI',        'AI, ML, SaaS, cloud, dev tools, and cyber.'],
    ARRAY['Healthcare & Pharma',    'Pharma, biotech, hospitals, devices, and policy.'],
    ARRAY['Logistics & Supply Chain','Freight, warehousing, last-mile, and trade.'],
    ARRAY['Finance & Business',     'Markets, fintech, funding, M&A, and strategy.'],
    ARRAY['E-commerce & Retail',    'Marketplaces, D2C, omnichannel, and CX.']
  ];
  tag_rows TEXT[][] := ARRAY[
    -- Digital Marketing
    ARRAY['Digital Marketing', 'SEO'],
    ARRAY['Digital Marketing', 'PPC (Paid Ads)'],
    ARRAY['Digital Marketing', 'Social Media Marketing'],
    ARRAY['Digital Marketing', 'Content Marketing'],
    ARRAY['Digital Marketing', 'Email Marketing'],
    ARRAY['Digital Marketing', 'Performance Marketing'],
    ARRAY['Digital Marketing', 'Analytics & Attribution'],
    ARRAY['Digital Marketing', 'Marketing Automation'],
    ARRAY['Digital Marketing', 'Influencer Marketing'],
    ARRAY['Digital Marketing', 'Conversion Optimization'],

    -- Technology & AI
    ARRAY['Technology & AI', 'Artificial Intelligence (AI)'],
    ARRAY['Technology & AI', 'Machine Learning'],
    ARRAY['Technology & AI', 'Generative AI'],
    ARRAY['Technology & AI', 'Automation Tools'],
    ARRAY['Technology & AI', 'SaaS Products'],
    ARRAY['Technology & AI', 'Cybersecurity'],
    ARRAY['Technology & AI', 'Cloud Computing'],
    ARRAY['Technology & AI', 'Data Analytics'],
    ARRAY['Technology & AI', 'Software Development'],
    ARRAY['Technology & AI', 'No-code / Low-code'],

    -- Healthcare & Pharma
    ARRAY['Healthcare & Pharma', 'Healthcare Policy'],
    ARRAY['Healthcare & Pharma', 'Pharmaceutical Industry'],
    ARRAY['Healthcare & Pharma', 'Medical Research'],
    ARRAY['Healthcare & Pharma', 'Biotechnology'],
    ARRAY['Healthcare & Pharma', 'Hospitals & Clinics'],
    ARRAY['Healthcare & Pharma', 'Medical Devices'],
    ARRAY['Healthcare & Pharma', 'Health Tech'],
    ARRAY['Healthcare & Pharma', 'Drug Development'],
    ARRAY['Healthcare & Pharma', 'Public Health'],
    ARRAY['Healthcare & Pharma', 'Regulations & Compliance'],

    -- Logistics & Supply Chain
    ARRAY['Logistics & Supply Chain', 'Supply Chain Management'],
    ARRAY['Logistics & Supply Chain', 'Warehousing'],
    ARRAY['Logistics & Supply Chain', 'Transportation & Freight'],
    ARRAY['Logistics & Supply Chain', 'E-commerce Logistics'],
    ARRAY['Logistics & Supply Chain', 'Last-mile Delivery'],
    ARRAY['Logistics & Supply Chain', 'Inventory Management'],
    ARRAY['Logistics & Supply Chain', 'Global Trade'],
    ARRAY['Logistics & Supply Chain', 'Procurement'],
    ARRAY['Logistics & Supply Chain', 'Cold Chain Logistics'],
    ARRAY['Logistics & Supply Chain', 'Automation in Logistics'],

    -- Finance & Business
    ARRAY['Finance & Business', 'Stock Market'],
    ARRAY['Finance & Business', 'Startups & Funding'],
    ARRAY['Finance & Business', 'Banking & Fintech'],
    ARRAY['Finance & Business', 'Investments'],
    ARRAY['Finance & Business', 'Cryptocurrency'],
    ARRAY['Finance & Business', 'Corporate Strategy'],
    ARRAY['Finance & Business', 'Mergers & Acquisitions'],
    ARRAY['Finance & Business', 'Economic Trends'],
    ARRAY['Finance & Business', 'Personal Finance'],
    ARRAY['Finance & Business', 'Risk Management'],

    -- E-commerce & Retail
    ARRAY['E-commerce & Retail', 'Online Marketplaces'],
    ARRAY['E-commerce & Retail', 'D2C Brands'],
    ARRAY['E-commerce & Retail', 'Retail Trends'],
    ARRAY['E-commerce & Retail', 'Customer Experience'],
    ARRAY['E-commerce & Retail', 'Pricing Strategies'],
    ARRAY['E-commerce & Retail', 'Product Launches'],
    ARRAY['E-commerce & Retail', 'Shopping Behavior'],
    ARRAY['E-commerce & Retail', 'Omnichannel Retail'],
    ARRAY['E-commerce & Retail', 'Marketplace Algorithms'],
    ARRAY['E-commerce & Retail', 'Conversion & Sales']
  ];
BEGIN
  -- ── Upsert industry spaces by name ───────────────────────────────────────
  FOR i IN 1..array_length(industries, 1) LOOP
    v_industry := industries[i][1];
    v_desc     := industries[i][2];

    INSERT INTO industry_spaces (name, description, status)
    SELECT v_industry, v_desc, 'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM industry_spaces WHERE name = v_industry
    );
  END LOOP;

  -- ── Upsert topic tags per space ──────────────────────────────────────────
  FOR i IN 1..array_length(tag_rows, 1) LOOP
    v_industry := tag_rows[i][1];
    v_tag      := tag_rows[i][2];

    SELECT id INTO v_space_id FROM industry_spaces WHERE name = v_industry LIMIT 1;
    IF v_space_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO tags (space_id, name, type, status)
    SELECT v_space_id, v_tag, 'topic', 'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM tags
      WHERE space_id = v_space_id AND name = v_tag AND type = 'topic'
    );
  END LOOP;
END
$$;
