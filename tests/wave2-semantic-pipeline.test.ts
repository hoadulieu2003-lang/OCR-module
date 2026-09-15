import { describe, it, expect } from 'vitest';
import { AdministrativeOntologyService } from '../src/services/administrative-ontology.service.js';

describe('Wave 2: Administrative Ontology & Classification Pipeline', () => {
  it('should disambiguate zero semantics accurately', () => {
    // 0 đơn khiếu nại = POSITIVE_ZERO
    const zeroComplaints = AdministrativeOntologyService.evaluateZeroSemantics('Đơn thư khiếu nại', 'đơn');
    expect(zeroComplaints).toBe('POSITIVE_ZERO');

    // 0% giải ngân = CRITICAL_ZERO
    const zeroDisbursement = AdministrativeOntologyService.evaluateZeroSemantics('Tỷ lệ giải ngân vốn', '%');
    expect(zeroDisbursement).toBe('CRITICAL_ZERO');
  });

  it('should resolve domain taxonomies from administrative keywords', () => {
    const resolved = AdministrativeOntologyService.resolveDomain('Đầu tư công');
    expect(resolved.parentGroup).toBe('DAU_TU_CONG');

    const resolvedGpmb = AdministrativeOntologyService.resolveDomain('Giải phóng mặt bằng và tái định cư');
    expect(resolvedGpmb.parentGroup).toBe('TAI_NGUYEN_MOI_TRUONG');
  });

  it('should retrieve all standard administrative taxonomies', () => {
    const taxonomies = AdministrativeOntologyService.getAllTaxonomies();
    expect(taxonomies.length).toBeGreaterThanOrEqual(15);
  });
});
