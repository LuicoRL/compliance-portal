import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComplianceRepositoryService } from '../compliance-repository.service';
import { EMPTY_APPLICATION } from '../compliance.models';
import { RepositoryFake, createRepositoryFake, flush } from '../testing/compliance-repository.fake';
import { AdminViewComponent } from './admin-view.component';

describe('AdminViewComponent', () => {
  let component: AdminViewComponent;
  let fixture: ComponentFixture<AdminViewComponent>;
  let repository: RepositoryFake;

  const application = (id: string, clientName: string, status: 'NOT_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED') =>
    Object.assign(EMPTY_APPLICATION(), { id, clientName, status });

  beforeEach(async () => {
    repository = createRepositoryFake();

    await TestBed.configureTestingModule({
      imports: [AdminViewComponent],
      providers: [{ provide: ComplianceRepositoryService, useValue: repository }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the application list and the historico rows on init', async () => {
    await flush();

    expect(repository.getAll).toHaveBeenCalled();
    expect(repository.getDatabaseRows).toHaveBeenCalled();
  });

  it('keeps the client pending when follow-up forms are enabled', async () => {
    const app = application('x', 'Pepito', 'PENDING');
    app.baseDocumentationReviewed = true;
    component.selectedApplication = app;

    await component.setFollowUpEligibility(app, true);

    expect(app.status).toBe('PENDING');
    expect(app.followUpFormsEnabled).toBe(true);
  });

  it('requires applicable follow-up forms before final approval', () => {
    const app = application('x', 'Pepito', 'PENDING');
    app.baseDocumentationReviewed = true;
    app.followUpFormsEnabled = true;

    expect(component.canApprove(app)).toBe(false);
    app.followUpFormsSubmittedAt = new Date().toISOString();
    expect(component.canApprove(app)).toBe(true);
  });

  it('filters the application list by status', () => {
    component.applications = [
      application('a', 'Pepito', 'PENDING'),
      application('b', 'Juan', 'APPROVED'),
      application('c', 'Ana', 'NOT_APPROVED')
    ];

    component.statusFilter = 'PENDING';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['a']);

    component.statusFilter = 'APPROVED';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);

    component.statusFilter = 'ALL';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters the application list by REJECTED', () => {
    component.applications = [
      application('a', 'Pepito', 'PENDING'),
      application('b', 'Juan', 'REJECTED')
    ];

    component.statusFilter = 'REJECTED';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);
  });

  it('searches the application list by client name, NIT or status label', () => {
    component.applications = [application('a', 'Pepito', 'PENDING'), application('b', 'Juan', 'APPROVED')];

    component.searchTerm = 'juan';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);

    component.searchTerm = 'aprobado';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['b']);

    component.searchTerm = '   ';
    expect(component.filteredApplications.map(a => a.id)).toEqual(['a', 'b']);
  });

  it('filters the historico database rows by client name', () => {
    component.databaseRows = [
      { id: 'a', clientName: 'Pepito S.R.L.', nit: '100', status: 'PENDING', hasPdf: true },
      { id: 'b', clientName: 'Juan S.A.', nit: '200', status: 'APPROVED', hasPdf: false },
      { id: 'c', clientName: 'Ana Ltda.', nit: '300', status: 'NOT_APPROVED', hasPdf: true }
    ];

    component.historicoSearch = 'pepito';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['a']);

    component.historicoSearch = '  JUAN  ';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['b']);

    component.historicoSearch = '';
    expect(component.filteredDatabaseRows.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('offers follow-up fields as rejection candidates only once they are enabled', () => {
    const app = application('x', 'Pepito', 'PENDING');
    component.selectedApplication = app;

    expect(component.rejectionCandidates.map(c => c.key)).not.toContain('operatingLicense');

    app.followUpFormsEnabled = true;
    expect(component.rejectionCandidates.map(c => c.key)).toContain('operatingLicense');
  });

  it('rejects an application and stores the flagged fields', async () => {
    const app = application('x', 'Pepito', 'PENDING');
    component.selectedApplication = app;
    component.rejectionSelection = ['constitutionRecord', 'website'];

    await component.confirmReject();

    expect(app.status).toBe('REJECTED');
    expect(app.rejectionFields).toEqual(['constitutionRecord', 'website']);
    expect(app.rejectedAt).toBeTruthy();
    expect(component.rejectOpen).toBe(false);
    expect(component.getStatusLabel('REJECTED')).toBe('Rechazado');
  });

  it('requires at least one field before confirming a rejection', async () => {
    const app = application('x', 'Pepito', 'PENDING');
    component.selectedApplication = app;
    component.rejectionSelection = [];

    await component.confirmReject();

    expect(app.status).toBe('PENDING');
    expect(component.error).toContain('Selecciona');
  });

  it('toggles a rejection field on and off', () => {
    component.toggleRejectionField('website');
    expect(component.rejectionSelection).toEqual(['website']);
    component.toggleRejectionField('website');
    expect(component.rejectionSelection).toEqual([]);
  });

  it('approves an application and clears any rejection', async () => {
    const app = application('x', 'Pepito', 'REJECTED');
    app.rejectionFields = ['website'];
    app.rejectedAt = new Date().toISOString();
    component.selectedApplication = app;

    await component.approve(app);

    expect(app.status).toBe('APPROVED');
    expect(app.rejectionFields).toEqual([]);
    expect(app.rejectedAt).toBeUndefined();
    expect(component.notice).toContain('aprobado');
  });

  it('loads the full detail and stops loading on selection', async () => {
    const row = application('a', 'Pepito', 'PENDING');
    const detail = Object.assign(EMPTY_APPLICATION(), {
      id: 'a', clientName: 'Pepito',
      documents: [{ id: 'd1', formKey: 'nit', name: 'NIT', fileName: 'NIT.pdf', mimeType: 'application/pdf', size: 10, content: new Blob() }]
    });
    repository.getById.mockResolvedValue(detail);

    component.selectApplication(row);

    expect(component.loadingDetail).toBe(true);
    await flush();

    expect(component.loadingDetail).toBe(false);
    expect(component.selectedApplication?.documents.length).toBe(1);
    expect(component.selectedApplication?.documents[0].formKey).toBe('nit');
  });

  it('ignores a stale detail response for a previous selection', async () => {
    let resolveFirst!: (value: unknown) => void;
    repository.getById.mockImplementation((id: string) => id === 'first'
      ? new Promise(res => { resolveFirst = res; })
      : Promise.resolve(application('second', 'Dos', 'PENDING')));

    component.selectApplication(application('first', 'Uno', 'PENDING'));
    component.selectApplication(application('second', 'Dos', 'PENDING'));
    await flush();
    resolveFirst(Object.assign(EMPTY_APPLICATION(), {
      id: 'first', clientName: 'Uno',
      documents: [{ id: 'x', formKey: 'nit', name: 'NIT', fileName: 'NIT.pdf', mimeType: 'application/pdf', size: 1, content: new Blob() }]
    }));
    await flush();

    expect(component.selectedApplication?.id).toBe('second');
    expect(component.selectedApplication?.documents.length).toBe(0);
    expect(component.loadingDetail).toBe(false);
  });

  it('refreshes the historico table after generating a report', async () => {
    const row = { id: 'a', clientName: 'Pepito', nit: '100', status: 'PENDING' as const, hasPdf: false };
    component.databaseRows = [row];

    await component.generatePdfFor(row);

    expect(repository.generatePdf).toHaveBeenCalledWith('a');
    expect(repository.getDatabaseRows).toHaveBeenCalledTimes(2);
    expect(component.notice).toContain('informe-a.pdf');
  });
});
