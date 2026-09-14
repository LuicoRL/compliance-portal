package com.compliance.client;

import com.compliance.api.ClientDetail;
import com.compliance.api.ClientListItem;
import com.compliance.api.DocumentInfo;
import com.compliance.api.DocumentPayload;
import com.compliance.api.FollowUpDocs;
import com.compliance.api.PdfInfo;
import com.compliance.api.SaveClientRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ClientRepository {

    private final JdbcTemplate jdbc;

    public ClientRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ClientListItem> listRows() {
        String sql = """
            SELECT c.id, c.client_name, c.nit, c.status, c.created_at, c.submitted_at, c.reviewed_at,
                   p.file_name AS pdf_file_name, p.generated_at AS pdf_generated_at
            FROM clients c
            LEFT JOIN LATERAL (
                SELECT file_name, generated_at FROM pdfs
                WHERE pdfs.client_id = c.id ORDER BY generated_at DESC LIMIT 1
            ) p ON true
            ORDER BY c.created_at DESC
            """;
        return jdbc.query(sql, (rs, i) -> new ClientListItem(
            rs.getObject("id", UUID.class),
            rs.getString("client_name"),
            rs.getString("nit"),
            rs.getString("status"),
            toStr(rs.getTimestamp("created_at")),
            toStr(rs.getTimestamp("submitted_at")),
            toStr(rs.getTimestamp("reviewed_at")),
            rs.getString("pdf_file_name"),
            toOffset(rs, "pdf_generated_at"),
            rs.getString("pdf_file_name") != null
        ));
    }

    public Optional<ClientDetail> findById(UUID id) {
        List<ClientDetail> rows = jdbc.query("SELECT * FROM clients WHERE id = ?", new ClientRowMapper(), id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        ClientDetail client = rows.get(0);
        List<DocumentInfo> docs = jdbc.query(
            "SELECT id, form_key, file_name, content_type, size FROM documents WHERE client_id = ? ORDER BY created_at",
            (rs, i) -> new DocumentInfo(
                rs.getObject("id", UUID.class), rs.getString("form_key"), rs.getString("file_name"),
                rs.getString("content_type"), rs.getLong("size")),
            id);
        Optional<PdfInfo> latestPdf = jdbc.query(
            "SELECT id, file_name, content_type, generated_at FROM pdfs WHERE client_id = ? ORDER BY generated_at DESC LIMIT 1",
            (rs, i) -> new PdfInfo(rs.getObject("id", UUID.class), rs.getString("file_name"),
                rs.getString("content_type"), rs.getTimestamp("generated_at").toInstant().atOffset(java.time.ZoneOffset.UTC)),
            id).stream().findFirst();

        ClientDetail withDocs = new ClientDetail(
            client.id(), client.clientName(), client.nit(), client.constitutionRecord(),
            client.commercialRegistration(), client.representativeDocument(), client.representativePower(),
            client.bankCertification(), client.website(), client.status(), client.baseDocumentationReviewed(),
            client.baseDocumentationReviewedAt(), client.followUpFormsEnabled(), client.followUpFormsEnabledAt(),
            client.followUpFormsSubmittedAt(), client.createdAt(), client.submittedAt(), client.reviewedAt(),
            client.rejectedAt(), client.rejectionFields(),
            client.followUpDocs(), docs, latestPdf.orElse(null));
        return Optional.of(withDocs);
    }

    public boolean exists(UUID id) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM clients WHERE id = ?", Integer.class, id);
        return count != null && count > 0;
    }

    /** Insert or update a client and replace its documents. */
    public void upsert(SaveClientRequest req) {
        ClientRowMapper mapper = new ClientRowMapper();
        boolean updating = exists(req.id());
        if (updating) {
            jdbc.update("""
                UPDATE clients SET
                    client_name=?, nit=?, constitution_record=?, commercial_registration=?,
                    representative_document=?, representative_power=?, bank_certification=?, website=?,
                    status=?, base_documentation_reviewed=?, base_documentation_reviewed_at=?,
                    follow_up_forms_enabled=?, follow_up_forms_enabled_at=?, follow_up_forms_submitted_at=?,
                    submitted_at=?, reviewed_at=?, rejected_at=?, rejection_fields=?,
                    operating_license=?, ubo_identities=?, org_chart=?, commercial_evidence=?,
                    financial_statements=?, operating_flow=?, commercial_contracts=?, aml_manual=?,
                    regulatory_licenses=?, submerchants=?, pep_declaration=?
                WHERE id=?
                """,
                req.clientName(), req.nit(), req.constitutionRecord(), req.commercialRegistration(),
                req.representativeDocument(), req.representativePower(), req.bankCertification(), req.website(),
                req.status(), req.baseDocumentationReviewed(), parseTs(req.baseDocumentationReviewedAt()),
                req.followUpFormsEnabled(), parseTs(req.followUpFormsEnabledAt()), parseTs(req.followUpFormsSubmittedAt()),
                parseTs(req.submittedAt()), parseTs(req.reviewedAt()), parseTs(req.rejectedAt()), toJson(req.rejectionFields()),
                followUp(req, "operatingLicense"), followUp(req, "uboIdentities"), followUp(req, "orgChart"),
                followUp(req, "commercialEvidence"), followUp(req, "financialStatements"), followUp(req, "operatingFlow"),
                followUp(req, "commercialContracts"), followUp(req, "amlManual"), followUp(req, "regulatoryLicenses"),
                followUp(req, "submerchants"), followUp(req, "pepDeclaration"),
                req.id());
        } else {
            jdbc.update("""
                INSERT INTO clients (
                    id, client_name, nit, constitution_record, commercial_registration,
                    representative_document, representative_power, bank_certification, website,
                    status, base_documentation_reviewed, follow_up_forms_enabled, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                req.id(), req.clientName(), req.nit(), req.constitutionRecord(), req.commercialRegistration(),
                req.representativeDocument(), req.representativePower(), req.bankCertification(), req.website(),
                req.status() == null ? "NOT_APPROVED" : req.status(),
                req.baseDocumentationReviewed(), req.followUpFormsEnabled(),
                parseTsOrDefault(req.createdAt()));
            jdbc.update("""
                UPDATE clients SET
                    base_documentation_reviewed_at=?, follow_up_forms_enabled_at=?,
                    follow_up_forms_submitted_at=?, submitted_at=?, reviewed_at=?, rejected_at=?, rejection_fields=?,
                    operating_license=?, ubo_identities=?, org_chart=?, commercial_evidence=?,
                    financial_statements=?, operating_flow=?, commercial_contracts=?, aml_manual=?,
                    regulatory_licenses=?, submerchants=?, pep_declaration=?
                WHERE id=?
                """,
                parseTs(req.baseDocumentationReviewedAt()), parseTs(req.followUpFormsEnabledAt()),
                parseTs(req.followUpFormsSubmittedAt()), parseTs(req.submittedAt()), parseTs(req.reviewedAt()),
                parseTs(req.rejectedAt()), toJson(req.rejectionFields()),
                followUp(req, "operatingLicense"), followUp(req, "uboIdentities"), followUp(req, "orgChart"),
                followUp(req, "commercialEvidence"), followUp(req, "financialStatements"), followUp(req, "operatingFlow"),
                followUp(req, "commercialContracts"), followUp(req, "amlManual"), followUp(req, "regulatoryLicenses"),
                followUp(req, "submerchants"), followUp(req, "pepDeclaration"),
                req.id());
        }

        List<DocumentPayload> docs = req.documents() == null ? List.of() : req.documents();
        if (!docs.isEmpty()) {
            Map<UUID, byte[]> existingContent = new HashMap<>();
            jdbc.query(
                "SELECT id, content FROM documents WHERE client_id = ?",
                (RowCallbackHandler) rs ->
                    existingContent.put(rs.getObject("id", UUID.class), rs.getBytes("content")),
                req.id());
            jdbc.update("DELETE FROM documents WHERE client_id = ?", req.id());
            for (DocumentPayload doc : docs) {
                byte[] content = decode(doc.contentBase64());
                if (content.length == 0 && doc.id() != null) {
                    byte[] saved = existingContent.get(doc.id());
                    if (saved != null) content = saved;
                }
                jdbc.update("""
                    INSERT INTO documents (id, client_id, form_key, file_name, content_type, size, content)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    doc.id() == null ? UUID.randomUUID() : doc.id(), req.id(), doc.formKey(),
                    doc.fileName(), doc.mimeType(), doc.size(), content);
            }
        }
    }

    public void delete(UUID id) {
        jdbc.update("DELETE FROM clients WHERE id = ?", id);
    }

    public void updateStatus(UUID id, String status) {
        jdbc.update("UPDATE clients SET status=?, reviewed_at=COALESCE(reviewed_at, now()) WHERE id=?", status, id);
    }

    public void updateBaseReviewed(UUID id, boolean reviewed) {
        String reviewedAt = reviewed ? "now()" : "NULL";
        jdbc.update("UPDATE clients SET base_documentation_reviewed=?, base_documentation_reviewed_at=" + reviewedAt + " WHERE id=?", reviewed, id);
    }

    public void updateFollowUpEligibility(UUID id, boolean enabled) {
        String enabledAt = enabled ? "now()" : "NULL";
        jdbc.update("UPDATE clients SET follow_up_forms_enabled=?, follow_up_forms_enabled_at=" + enabledAt + " WHERE id=?", enabled, id);
    }

    public void updateFollowUpSubmitted(UUID id) {
        jdbc.update("UPDATE clients SET follow_up_forms_submitted_at=now() WHERE id=?", id);
    }

    public byte[] getDocumentContent(UUID docId) {
        List<byte[]> rows = jdbc.queryForList("SELECT content FROM documents WHERE id = ?", byte[].class, docId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public DocumentRow getDocument(UUID docId) {
        List<DocumentRow> rows = jdbc.query(
            "SELECT id, file_name, content_type, content FROM documents WHERE id = ?",
            (rs, i) -> new DocumentRow(
                rs.getObject("id", UUID.class), rs.getString("file_name"),
                rs.getString("content_type"), rs.getBytes("content")),
            docId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<PdfInfo> listPdfs(UUID clientId) {
        return jdbc.query(
            "SELECT id, file_name, content_type, generated_at FROM pdfs WHERE client_id = ? ORDER BY generated_at DESC",
            (rs, i) -> new PdfInfo(rs.getObject("id", UUID.class), rs.getString("file_name"),
                rs.getString("content_type"), rs.getTimestamp("generated_at").toInstant().atOffset(java.time.ZoneOffset.UTC)),
            clientId);
    }

    public LatestPdfRow getLatestPdf(UUID clientId) {
        List<LatestPdfRow> rows = jdbc.query(
            "SELECT id, file_name, content_type, content FROM pdfs WHERE client_id = ? ORDER BY generated_at DESC LIMIT 1",
            (rs, i) -> new LatestPdfRow(
                rs.getObject("id", UUID.class), rs.getString("file_name"), rs.getString("content_type"),
                rs.getBytes("content")),
            clientId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public PdfInfo storePdf(UUID clientId, String fileName, byte[] content) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO pdfs (id, client_id, file_name, content_type, content)
            VALUES (?, ?, ?, 'application/pdf', ?)
            """, id, clientId, fileName, content);
        List<PdfInfo> saved = jdbc.query(
            "SELECT id, file_name, content_type, generated_at FROM pdfs WHERE id = ?",
            (rs, i) -> new PdfInfo(rs.getObject("id", UUID.class), rs.getString("file_name"),
                rs.getString("content_type"), rs.getTimestamp("generated_at").toInstant().atOffset(java.time.ZoneOffset.UTC)),
            id);
        return saved.get(0);
    }

    private static String followUp(SaveClientRequest req, String key) {
        FollowUpDocs d = req.followUpDocs();
        if (d == null) return null;
        return switch (key) {
            case "operatingLicense" -> d.operatingLicense();
            case "uboIdentities" -> d.uboIdentities();
            case "orgChart" -> d.orgChart();
            case "commercialEvidence" -> d.commercialEvidence();
            case "financialStatements" -> d.financialStatements();
            case "operatingFlow" -> d.operatingFlow();
            case "commercialContracts" -> d.commercialContracts();
            case "amlManual" -> d.amlManual();
            case "regulatoryLicenses" -> d.regulatoryLicenses();
            case "submerchants" -> d.submerchants();
            case "pepDeclaration" -> d.pepDeclaration();
            default -> null;
        };
    }

    private static byte[] decode(String base64) {
        if (base64 == null || base64.isEmpty()) return new byte[0];
        return Base64.getDecoder().decode(base64);
    }

    private static String toJson(List<String> values) {
        if (values == null || values.isEmpty()) return null;
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(',');
            String value = values.get(i);
            sb.append('"').append(value.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append(']').toString();
    }

    private static List<String> fromJsonList(String json) {
        List<String> values = new ArrayList<>();
        if (json == null || json.isBlank()) return values;
        String body = json.trim().replaceAll("^\\[|\\]$", "");
        if (body.isBlank()) return values;
        String[] parts = body.split(",");
        for (String part : parts) {
            String value = part.trim();
            if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
                value = value.substring(1, value.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
            }
            values.add(value);
        }
        return values;
    }

    private static java.sql.Timestamp parseTs(String iso) {
        if (iso == null || iso.isEmpty()) return null;
        try {
            return java.sql.Timestamp.from(java.time.Instant.parse(iso));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static java.sql.Timestamp parseTsOrDefault(String iso) {
        java.sql.Timestamp ts = parseTs(iso);
        return ts != null ? ts : java.sql.Timestamp.from(java.time.Instant.now());
    }

    private static String toStr(java.sql.Timestamp ts) {
        return ts == null ? null : ts.toInstant().toString();
    }

    private static OffsetDateTime toOffset(ResultSet rs, String col) throws SQLException {
        java.sql.Timestamp ts = rs.getTimestamp(col);
        return ts == null ? null : ts.toInstant().atOffset(java.time.ZoneOffset.UTC);
    }

    public record LatestPdfRow(UUID id, String fileName, String contentType, byte[] content) {}

    public record DocumentRow(UUID id, String fileName, String contentType, byte[] content) {}

    private static final class ClientRowMapper implements RowMapper<ClientDetail> {
        @Override
        public ClientDetail mapRow(ResultSet rs, int i) throws SQLException {
            FollowUpDocs follow = new FollowUpDocs(
                rs.getString("operating_license"), rs.getString("ubo_identities"), rs.getString("org_chart"),
                rs.getString("commercial_evidence"), rs.getString("financial_statements"), rs.getString("operating_flow"),
                rs.getString("commercial_contracts"), rs.getString("aml_manual"), rs.getString("regulatory_licenses"),
                rs.getString("submerchants"), rs.getString("pep_declaration"));
            return new ClientDetail(
                rs.getObject("id", UUID.class), rs.getString("client_name"), rs.getString("nit"),
                rs.getString("constitution_record"), rs.getString("commercial_registration"),
                rs.getString("representative_document"), rs.getString("representative_power"),
                rs.getString("bank_certification"), rs.getString("website"), rs.getString("status"),
                rs.getBoolean("base_documentation_reviewed"), toStr(rs.getTimestamp("base_documentation_reviewed_at")),
                rs.getBoolean("follow_up_forms_enabled"), toStr(rs.getTimestamp("follow_up_forms_enabled_at")),
                toStr(rs.getTimestamp("follow_up_forms_submitted_at")), toStr(rs.getTimestamp("created_at")),
                toStr(rs.getTimestamp("submitted_at")), toStr(rs.getTimestamp("reviewed_at")),
                toStr(rs.getTimestamp("rejected_at")), fromJsonList(rs.getString("rejection_fields")),
                follow, List.of(), null);
        }
    }
}
