package com.compliance.api;

import java.util.UUID;

/** Metadata about a stored source document (no content, for list/details). */
public record DocumentInfo(
    UUID id, String formKey, String fileName, String mimeType, long size
) {}
