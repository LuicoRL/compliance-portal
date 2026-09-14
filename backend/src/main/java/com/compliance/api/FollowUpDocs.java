package com.compliance.api;

/** Follow-up form text fields. */
public record FollowUpDocs(
    String operatingLicense, String uboIdentities, String orgChart, String commercialEvidence,
    String financialStatements, String operatingFlow, String commercialContracts, String amlManual,
    String regulatoryLicenses, String submerchants, String pepDeclaration
) {}
