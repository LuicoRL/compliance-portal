package com.compliance.api;

import com.compliance.client.ClientRepository;
import com.compliance.pdf.PdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/applications")
public class ClientController {

    private final ClientRepository repository;
    private final PdfService pdfService;

    public ClientController(ClientRepository repository, PdfService pdfService) {
        this.repository = repository;
        this.pdfService = pdfService;
    }

    /** Admin "database / histórico" view. */
    @GetMapping
    public List<ClientListItem> list() {
        return repository.listRows();
    }

    @GetMapping("/{id}")
    public ClientDetail get(@PathVariable UUID id) {
        return repository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));
    }

    @PostMapping
    public ClientDetail save(@RequestBody SaveClientRequest req) {
        if (req.id() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id es requerido");
        }
        repository.upsert(req);
        return repository.findById(req.id()).orElseThrow();
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        repository.delete(id);
    }

    @PatchMapping("/{id}/status")
    public ClientDetail setStatus(@PathVariable UUID id, @RequestBody StatusRequest body) {
        if (body.status() == null || body.status().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status es requerido");
        }
        requireClient(id);
        repository.updateStatus(id, body.status());
        return get(id);
    }

    @PatchMapping("/{id}/base-reviewed")
    public ClientDetail setBaseReviewed(@PathVariable UUID id, @RequestBody BoolRequest body) {
        requireClient(id);
        repository.updateBaseReviewed(id, body.enabled());
        return get(id);
    }

    @PatchMapping("/{id}/follow-up-eligibility")
    public ClientDetail setFollowUpEligibility(@PathVariable UUID id, @RequestBody BoolRequest body) {
        requireClient(id);
        repository.updateFollowUpEligibility(id, body.enabled());
        return get(id);
    }

    @PatchMapping("/{id}/follow-up-submit")
    public ClientDetail setFollowUpSubmitted(@PathVariable UUID id) {
        requireClient(id);
        repository.updateFollowUpSubmitted(id);
        return get(id);
    }

    /** Generate + store a PDF for a client and return its metadata. */
    @PostMapping("/{id}/pdf")
    public PdfCreated generatePdf(@PathVariable UUID id) {
        ClientDetail detail = get(id);
        byte[] content = pdfService.generate(detail);
        String fileName = "informe-" + safeFileName(detail.clientName()) + ".pdf";
        PdfInfo info = repository.storePdf(id, fileName, content);
        return new PdfCreated(info.id(), info.fileName(), info.contentType(), info.generatedAt());
    }

    /** Download the latest stored PDF for a client. */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> downloadPdf(@PathVariable UUID id) {
        ClientRepository.LatestPdfRow row = repository.getLatestPdf(id);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No hay PDF generado para este cliente");
        }
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + row.fileName() + "\"")
            .body(row.content());
    }

    /** List stored PDF metadata for a client. */
    @GetMapping("/{id}/pdfs")
    public List<PdfInfo> pdfs(@PathVariable UUID id) {
        requireClient(id);
        return repository.listPdfs(id);
    }

    /** Download (or view inline) a stored source document for a client. */
    @GetMapping("/{id}/documents/{docId}")
    public ResponseEntity<byte[]> downloadDocument(
        @PathVariable UUID id,
        @PathVariable UUID docId,
        @RequestParam(defaultValue = "false") boolean inline) {
        ClientRepository.DocumentRow row = repository.getDocument(docId);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Documento no encontrado");
        }
        MediaType type;
        try {
            type = MediaType.parseMediaType(row.contentType());
        } catch (RuntimeException e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        String disposition = inline ? "inline" : "attachment";
        return ResponseEntity.ok()
            .contentType(type)
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition + "; filename=\"" + row.fileName() + "\"")
            .body(row.content());
    }

    private void requireClient(UUID id) {
        if (!repository.exists(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado");
        }
    }

    private static String safeFileName(String name) {
        String cleaned = (name == null ? "" : name).trim()
            .toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return cleaned.isEmpty() ? "cliente" : cleaned;
    }
}
