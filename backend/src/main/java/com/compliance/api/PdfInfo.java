package com.compliance.api;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A stored generated PDF (no content). */
public record PdfInfo(
    UUID id, String fileName, String contentType, OffsetDateTime generatedAt
) {}
