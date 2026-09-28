import { EMPTY_APPLICATION } from '../compliance.models';
import {
  baseDocGroups, documentLabel, enhancedDocGroups, followUpLevels,
  groupedDocuments, intermediateDocGroups, rejectionCandidates
} from './compliance-fields';

describe('compliance-fields', () => {
  const doc = (formKey: string, name: string) => ({
    id: crypto.randomUUID(), formKey, name, fileName: `${name}.pdf`,
    mimeType: 'application/pdf', size: 10, content: new Blob()
  });

  it('labels document groups by their field', () => {
    expect(documentLabel('constitutionRecord')).toBe('Testimonio de constitución o CI');
    expect(documentLabel('representativePower')).toBe('Poder del Representante Legal');
    expect(documentLabel('operatingLicense')).toBe('Licencia de Funcionamiento');
    expect(documentLabel('pepDeclaration')).toBe('Declaración de PEP');
    expect(documentLabel('unknownKey')).toBe('unknownKey');
  });

  it('groups legacy documents without a known form key', () => {
    const app = EMPTY_APPLICATION();
    app.documents = [
      { id: crypto.randomUUID(), formKey: 'base', name: 'Respaldo', fileName: 'respaldo.pdf', mimeType: 'application/pdf', size: 1024, content: new Blob() }
    ];

    const groups = groupedDocuments(app);

    expect(groups.length).toBe(1);
    expect(groups[0].formKey).toBe('base');
    expect(documentLabel('base')).toBe('Documentación de respaldo');
  });

  it('splits the uploaded files into base, intermediate and enhanced groups', () => {
    const app = EMPTY_APPLICATION();
    app.documents = [
      doc('constitutionRecord', 'Constitucion'), doc('nit', 'NIT'),
      doc('operatingLicense', 'Licencia'), doc('pepDeclaration', 'Pep')
    ];

    expect(baseDocGroups(app).map(g => g.formKey)).toEqual(['constitutionRecord', 'nit']);
    expect(intermediateDocGroups(app).map(g => g.formKey)).toEqual(['operatingLicense']);
    expect(enhancedDocGroups(app).map(g => g.formKey)).toEqual(['pepDeclaration']);
  });

  it('keeps legacy documents in the base group and only renders levels with files', () => {
    const app = EMPTY_APPLICATION();
    app.documents = [doc('base', 'Respaldo'), doc('operatingLicense', 'Licencia')];

    expect(baseDocGroups(app).map(g => g.formKey)).toEqual(['base']);
    const levels = followUpLevels(app);
    expect(levels.map(l => l.key)).toEqual(['intermediate']);
    expect(levels[0].groups[0].formKey).toBe('operatingLicense');
  });

  it('only offers follow-up fields as rejection candidates once they are enabled', () => {
    const base = rejectionCandidates(false).map(c => c.key);
    expect(base).toContain('website');
    expect(base).not.toContain('operatingLicense');

    const withFollowUp = rejectionCandidates(true).map(c => c.key);
    expect(withFollowUp).toContain('operatingLicense');
    expect(withFollowUp).toContain('pepDeclaration');
  });
});
