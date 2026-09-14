package com.compliance.api;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Row of the admin "database / histórico" view. */
public record ClientListItem(
    UUID id, String clientName, String nit, String status,
    String createdAt, String submittedAt, String reviewedAt,
    String pdfFileName, OffsetDateTime pdfGeneratedAt, boolean hasPdf
) {}
