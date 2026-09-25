// 検算: 宿野辺橋の実パラメータ → sample/slab_sample.json と同値か
const G = require('./slab-generator');
const fs = require('fs');
const sample = JSON.parse(fs.readFileSync(__dirname + '/../sample/slab_sample.json', 'utf8'));
const out = G.generateSlabJson({
  project_name: '宿野辺橋 床版工事', structure_name: '宿野辺橋 床版',
  width_mm: 20500, length_mm: 33000, thickness_mm: 178, girder_count: 16, girder_spacing_mm: 1340,
  base_plate: { exists: true, thickness_mm: 18, material: 'SM490YB' },
});
let fails = 0;
const eq = (label, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log('✗', label, '\n  got', JSON.stringify(a), '\n  exp', JSON.stringify(b)); } else console.log('✓', label); };
const sf = (d) => d.phases[0].faces;
for (let i = 0; i < 5; i++) {
  const a = sf(out)[i], b = sf(sample)[i];
  eq(`face ${b.id} width/height`, [a.width_mm, a.height_mm], [b.width_mm, b.height_mm]);
  if (b.panels) eq(`face ${b.id} panels`, a.panels.map(p => [p.id, p.width_mm, p.height_mm, p.cut_note]), b.panels.map(p => [p.id, p.width_mm, p.height_mm, p.cut_note]));
  if (b.separators) eq(`face ${b.id} separators`, a.separators, b.separators);
  if (b.face_type === 'haunch') eq('haunch', [a.girder_count, a.total_panels], [b.girder_count, b.total_panels]);
}
eq('panels summary', out.quantities.panels.summary, sample.quantities.panels.summary);
eq('panels totals', [out.quantities.panels.total_count, out.quantities.panels.total_area_m2, out.quantities.panels.note], [sample.quantities.panels.total_count, sample.quantities.panels.total_area_m2, sample.quantities.panels.note]);
eq('separators', out.quantities.separators, sample.quantities.separators);
eq('hardware', out.quantities.hardware, sample.quantities.hardware);
eq('misc names', out.quantities.misc.map(m=>m.name), sample.quantities.misc.map(m=>m.name)); // 数量は式（面木=周長、スペーサー=面積×4）で算出。サンプルの60m/200個は概算値のため一致させない
eq('dimensions', out.structure.dimensions, sample.structure.dimensions);
eq('girders', out.structure.girders, sample.structure.girders);
eq('base_plate', out.structure.base_plate, sample.structure.base_plate);
eq('formwork_config', out.structure.formwork_config, sample.structure.formwork_config);
// 斜角60°: 妻面長 23672・端数272・セパ39
const sk = G.generateSlabJson({ project_name: 't', width_mm: 20500, length_mm: 33000, thickness_mm: 178, girder_count: 16, girder_spacing_mm: 1340, base_plate: { exists: true }, skew_angle_deg: 60, skew_direction: 'right' });
const A = sf(sk)[0];
eq('skew60 A width(±1)', Math.abs(A.width_mm - 23672) <= 1, true); // 20500/sin60=23671.3（v9本文は23,671・サンプルは23,672）
eq('skew60 A last panel(±1)', Math.abs(A.panels[A.panels.length - 1].width_mm - 272) <= 1, true);
eq('skew60 A sep', A.separators.count, 39);
const chk = G.checkSlabJson(out), chk2 = G.checkSlabJson(sk);
eq('check straight', chk.ok, true); eq('check skew', chk2.ok, true);
console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
