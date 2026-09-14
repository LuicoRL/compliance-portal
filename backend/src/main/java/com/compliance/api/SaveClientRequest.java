package com.compliance.api;

import java.util.List;
import java.util.UUID;

/** Mirror of the frontend {ComplianceApplication} used for save/details. */
public record SaveClientRequest(
    UUID id,
    String clientName,
    String nit,
    String constitutionRecord,
    String commercialRegistration,
    String representativeDocument,
    String representativePower,
    String bankCertification,
    String website,
    String status,
    boolean baseDocumentationReviewed,
    String baseDocumentationReviewedAt,
    boolean followUpFormsEnabled,
    String followUpFormsEnabledAt,
    String followUpFormsSubmittedAt,
    String createdAt,
    String submittedAt,
    String reviewedAt,
    String rejectedAt,
    List<String> rejectionFields,
    FollowUpDocs followUpDocs,
    List<DocumentPayload> documents
) {}
