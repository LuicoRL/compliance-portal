CREATE TABLE clients (
    id                            UUID PRIMARY KEY,
    client_name                   TEXT NOT NULL,
    nit                           TEXT NOT NULL,
    constitution_record           TEXT,
    commercial_registration       TEXT,
    representative_document       TEXT,
    representative_power          TEXT,
    bank_certification            TEXT,
    website                       TEXT,
    status                        TEXT NOT NULL DEFAULT 'NOT_APPROVED',
    base_documentation_reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
    base_documentation_reviewed_at TIMESTAMPTZ,
    follow_up_forms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_forms_enabled_at    TIMESTAMPTZ,
    follow_up_forms_submitted_at  TIMESTAMPTZ,
    operating_license             TEXT,
    ubo_identities                TEXT,
    org_chart                     TEXT,
    commercial_evidence           TEXT,
    financial_statements          TEXT,
    operating_flow                TEXT,
    commercial_contracts          TEXT,
    aml_manual                    TEXT,
    regulatory_licenses           TEXT,
    submerchants                  TEXT,
    pep_declaration               TEXT,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at                  TIMESTAMPTZ,
    reviewed_at                   TIMESTAMPTZ
);

CREATE TABLE documents (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    form_key     TEXT NOT NULL,
    file_name    TEXT NOT NULL,
    content_type TEXT,
    size         BIGINT,
    content      BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_client ON documents(client_id);

CREATE TABLE pdfs (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/pdf',
    content      BYTEA NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdfs_client ON pdfs(client_id);
