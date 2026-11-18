import {
  createPearSignTemplate,
  getPearSignTemplate,
  updatePearSignTemplate,
  type PearSignTemplate,
} from './pearsign-client';
import { toPearSignCreateFields, type PearSignTemplateSpec } from './pearsign-template-spec';

/**
 * Create (or reuse by exact name) a PearSign template for a spec, read it back and verify
 * every field (page, position, size, role). A template that drifted is repaired in place.
 * Shared by the contract and the addendum/disclosure provisioning scripts.
 */
export async function provisionPearSignTemplate(input: {
  spec: PearSignTemplateSpec;
  pdf: Buffer;
  existing: PearSignTemplate[];
}): Promise<{ template: PearSignTemplate; created: boolean; ok: boolean; missing: string[]; moved: string[] }> {
  const { spec, pdf } = input;
  let template = input.existing.find((t) => t.name === spec.name) ?? null;
  let created = false;
  if (!template) {
    template = await createPearSignTemplate({
      name: spec.name,
      description: spec.description,
      category: spec.category,
      status: 'active',
      signerRoles: spec.signerRoles,
      fields: toPearSignCreateFields(spec),
      documentBase64: pdf.toString('base64'),
    });
    created = true;
  }

  const verify = async (id: string) => {
    const live = await getPearSignTemplate(id);
    const byName = new Map((live.fields ?? []).map((f) => [f.fieldName, f]));
    const missing = spec.fields.filter((f) => !byName.has(f.fieldName)).map((f) => f.fieldName);
    const moved = spec.fields
      .filter((f) => {
        const got = byName.get(f.fieldName);
        const p = got?.position;
        if (!got || !p) return false;
        return (
          got.roleId !== f.roleId ||
          Number(p.page) !== f.page ||
          Math.abs(Number(p.x) - f.x) > 1 ||
          Math.abs(Number(p.y) - f.y) > 1 ||
          Math.abs(Number(p.width) - f.width) > 1 ||
          Math.abs(Number(p.height) - f.height) > 1
        );
      })
      .map((f) => f.fieldName);
    const extra = (live.fields ?? []).length - spec.fields.length;
    const ok = !missing.length && !moved.length && extra === 0 && String(live.status).toLowerCase() === 'active';
    return { live, missing, moved, ok };
  };

  let r = await verify(template.id);
  if (!r.ok) {
    await updatePearSignTemplate(template.id, {
      status: 'active',
      signerRoles: spec.signerRoles,
      fields: toPearSignCreateFields(spec),
    });
    r = await verify(template.id);
  }
  return { template: r.live, created, ok: r.ok, missing: r.missing, moved: r.moved };
}
