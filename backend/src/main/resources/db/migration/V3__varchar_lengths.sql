-- Bounded varchar widths instead of unbounded TEXT.
--
-- The widths are sized to the real content each column carries, not to a single
-- arbitrary number: `status`, `nit`, `form_key` and the `content_type` columns
-- hold short codes, while company names, URLs, free-text document references
-- and file names need considerably more room. Note that `file_name` stores the
-- document's display label (e.g. "Documento de identidad del Representante
-- Legal", 46 chars), so it can never be as short as 25.

ALTER TABLE clients ALTER COLUMN status                      TYPE VARCHAR(25);
ALTER TABLE clients ALTER COLUMN nit                          TYPE VARCHAR(25);
ALTER TABLE clients ALTER COLUMN client_name                  TYPE VARCHAR(180);
ALTER TABLE clients ALTER COLUMN website                      TYPE VARCHAR(255);

-- Free-text reference the client types for each base document.
ALTER TABLE clients ALTER COLUMN constitution_record         TYPE VARCHAR(120);
ALTER TABLE clients ALTER COLUMN commercial_registration     TYPE VARCHAR(120);
ALTER TABLE clients ALTER COLUMN representative_document     TYPE VARCHAR(120);
ALTER TABLE clients ALTER COLUMN representative_power        TYPE VARCHAR(120);
ALTER TABLE clients ALTER COLUMN bank_certification          TYPE VARCHAR(120);

-- Free-text description submitted in the intermediate / enhanced follow-up forms.
ALTER TABLE clients ALTER COLUMN operating_license           TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN ubo_identities              TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN org_chart                   TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN commercial_evidence         TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN financial_statements        TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN operating_flow              TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN commercial_contracts        TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN aml_manual                  TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN regulatory_licenses         TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN submerchants                TYPE VARCHAR(500);
ALTER TABLE clients ALTER COLUMN pep_declaration             TYPE VARCHAR(500);

-- JSON array of flagged form keys; all 18 candidates serialise to 329 chars.
ALTER TABLE clients ALTER COLUMN rejection_fields            TYPE VARCHAR(500);

-- `form_key` fits every key in the app today, the longest being
-- `representativeDocument` at 23 characters.
ALTER TABLE documents ALTER COLUMN form_key                 TYPE VARCHAR(25);
ALTER TABLE documents ALTER COLUMN file_name                TYPE VARCHAR(255);
ALTER TABLE documents ALTER COLUMN content_type             TYPE VARCHAR(25);

ALTER TABLE pdfs ALTER COLUMN file_name                      TYPE VARCHAR(255);
ALTER TABLE pdfs ALTER COLUMN content_type                   TYPE VARCHAR(25);
