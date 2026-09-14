package com.compliance.pdf;

import com.compliance.api.ClientDetail;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class PdfService {

    public byte[] generate(ClientDetail c) {
        List<String> lines = new ArrayList<>();
        lines.add("INFORME DE CUMPLIMIENTO");
        lines.add("Generado: " + OffsetDateTime.now().toString());
        lines.add("");
        lines.add("Cliente: " + nz(c.clientName()));
        lines.add("NIT / TAX ID: " + nz(c.nit()));
        lines.add("Estado: " + nz(c.status()));
        lines.add("Constitución / CI: " + nz(c.constitutionRecord()));
        lines.add("Registro de comercio: " + nz(c.commercialRegistration()));
        lines.add("Identidad del representante: " + nz(c.representativeDocument()));
        lines.add("Poder del representante: " + nz(c.representativePower()));
        lines.add("Certificación bancaria: " + nz(c.bankCertification()));
        lines.add("Página web / Redes: " + nz(c.website()));
        lines.add("Fecha de envío: " + nz(c.submittedAt()));
        lines.add("");
        lines.add("Documentos adjuntos:");
        if (c.documents() == null || c.documents().isEmpty()) {
            lines.add("- (sin archivos)");
        } else {
            c.documents().forEach(d -> lines.add("- " + d.fileName()));
        }
        if (c.followUpFormsEnabled() && c.followUpDocs() != null) {
            lines.add("");
            lines.add("Documentación adicional:");
            lines.add("- Licencia de Funcionamiento: " + nz(c.followUpDocs().operatingLicense()));
            lines.add("- Identidad accionistas / UBOs: " + nz(c.followUpDocs().uboIdentities()));
            lines.add("- Organigrama societario: " + nz(c.followUpDocs().orgChart()));
            lines.add("- Evidencia comercial: " + nz(c.followUpDocs().commercialEvidence()));
            lines.add("- Estados financieros: " + nz(c.followUpDocs().financialStatements()));
            lines.add("- Flujo operativo: " + nz(c.followUpDocs().operatingFlow()));
            lines.add("- Contratos comerciales: " + nz(c.followUpDocs().commercialContracts()));
            lines.add("- Manual AML/CFT: " + nz(c.followUpDocs().amlManual()));
            lines.add("- Licencias regulatorias: " + nz(c.followUpDocs().regulatoryLicenses()));
            lines.add("- Subcomercios: " + nz(c.followUpDocs().submerchants()));
            lines.add("- Declaración de PEP: " + nz(c.followUpDocs().pepDeclaration()));
        }
        return buildPdf(lines);
    }

    private static String nz(String s) {
        return s == null || s.isEmpty() ? "No proporcionado" : s;
    }

    private static byte[] buildPdf(List<String> lines) {
        StringBuilder stream = new StringBuilder("BT\n/F1 11 Tf\n50 790 Td\n16 TL\n");
        for (String line : lines) {
            stream.append("(").append(clean(line)).append(") Tj\nT*\n");
        }
        stream.append("ET");
        String st = stream.toString();
        String contentStream = "<< /Length " + st.getBytes(StandardCharsets.UTF_8).length + " >>\nstream\n" + st + "\nendstream";
        String[] objs = {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            contentStream,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        StringBuilder pdf = new StringBuilder("%PDF-1.4\n");
        int[] offsets = new int[objs.length + 1];
        for (int idx = 0; idx < objs.length; idx++) {
            offsets[idx] = pdf.length();
            pdf.append(idx + 1).append(" 0 obj\n").append(objs[idx]).append("\nendobj\n");
        }
        int xref = pdf.length();
        pdf.append("xref\n0 ").append(objs.length + 1).append("\n0000000000 65535 f \n");
        for (int i = 0; i < objs.length; i++) {
            pdf.append(String.format("%010d 00000 n \n", offsets[i]));
        }
        pdf.append("trailer\n<< /Size ").append(objs.length + 1).append(" /Root 1 0 R >>\nstartxref\n").append(xref).append("\n%%EOF");
        return pdf.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String clean(String s) {
        if (s == null) return "";
        return s
            .replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
            .replace("ñ", "n").replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
            .replace("Ñ", "N").replace("ü", "u").replace("Ü", "U")
            .replaceAll("[^\\x20-\\x7E]", "?")
            .replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }
}
