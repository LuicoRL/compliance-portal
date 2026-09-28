-- Compliance Portal: base schema.
--
-- Every string column is a bounded `varchar` from the start, sized to the real
-- content it carries rather than to one arbitrary number. `status`, `nit`,
-- `form_key` and the `content_type` columns hold short codes, while company
-- names, URLs, free-text document references and file names need much more
-- room.
--
-- Two widths deserve a note:
--   * `documents.file_name` (255) stores the document's display label, e.g.
--     "Documento de identidad del Representante Legal" (46 chars), so it can
--     never be as short as 25.
--   * `documents.form_key` (25) is the tightest constraint in the schema: the
--     longest key in the app is `representativeDocument` at 23 characters, so
--     only 2 characters of headroom remain. Raise it before adding a longer
--     field key.
--   * `clients.rejection_fields` (500) holds a JSON array of flagged form keys;
--     with all 18 selected it serialises to 329 chars. It is a string, not a
--     real JSON column.

CREATE TABLE clients (
    id                            UUID PRIMARY KEY,
    client_name                   VARCHAR(180) NOT NULL,
    nit                           VARCHAR(25) NOT NULL,
    constitution_record           VARCHAR(120),
    commercial_registration       VARCHAR(120),
    representative_document       VARCHAR(120),
    representative_power          VARCHAR(120),
    bank_certification            VARCHAR(120),
    website                       VARCHAR(255),
    status                        VARCHAR(25) NOT NULL DEFAULT 'NOT_APPROVED',
    base_documentation_reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
    base_documentation_reviewed_at TIMESTAMPTZ,
    follow_up_forms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_forms_enabled_at    TIMESTAMPTZ,
    follow_up_forms_submitted_at  TIMESTAMPTZ,
    operating_license             VARCHAR(500),
    ubo_identities                VARCHAR(500),
    org_chart                     VARCHAR(500),
    commercial_evidence           VARCHAR(500),
    financial_statements          VARCHAR(500),
    operating_flow                VARCHAR(500),
    commercial_contracts          VARCHAR(500),
    aml_manual                    VARCHAR(500),
    regulatory_licenses           VARCHAR(500),
    submerchants                  VARCHAR(500),
    pep_declaration               VARCHAR(500),
    rejected_at                   TIMESTAMPTZ,
    rejection_fields              VARCHAR(500),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at                  TIMESTAMPTZ,
    reviewed_at                   TIMESTAMPTZ
);

CREATE TABLE documents (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    form_key     VARCHAR(25) NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(25),
    size         BIGINT,
    content      BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_client ON documents(client_id);

CREATE TABLE pdfs (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(25) NOT NULL DEFAULT 'application/pdf',
    content      BYTEA NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdfs_client ON pdfs(client_id);
