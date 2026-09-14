package com.compliance.api;

import java.util.List;
import java.util.UUID;

/** Full client detail returned to the review panel. */
public record ClientDetail(
    UUID id, String clientName, String nit, String constitutionRecord, String commercialRegistration,
    String representativeDocument, String representativePower, String bankCertification, String website,
    String status, boolean baseDocumentationReviewed, String baseDocumentationReviewedAt,
    boolean followUpFormsEnabled, String followUpFormsEnabledAt, String followUpFormsSubmittedAt,
    String createdAt, String submittedAt, String reviewedAt, String rejectedAt, List<String> rejectionFields,
    FollowUpDocs followUpDocs, List<DocumentInfo> documents, PdfInfo latestPdf
) {}
