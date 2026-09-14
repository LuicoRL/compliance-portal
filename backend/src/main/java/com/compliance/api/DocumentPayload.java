package com.compliance.api;

import java.util.UUID;

/** An uploaded source document, with optional base64 content. */
public record DocumentPayload(
    UUID id, String formKey, String fileName, String mimeType, long size, String contentBase64
) {}
