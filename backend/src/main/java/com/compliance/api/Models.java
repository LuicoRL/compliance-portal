package com.compliance.api;

/** Simple status/action patches (used only within this package). */
record StatusRequest(String status) {}

record BoolRequest(boolean enabled) {}

record PdfCreated(java.util.UUID id, String fileName, String contentType, java.time.OffsetDateTime generatedAt) {}
