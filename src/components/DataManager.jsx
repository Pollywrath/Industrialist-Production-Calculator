import React, { useState, useMemo } from 'react';
import { getCustomProducts, getCustomMachines, getCustomRecipes } from '../utils/dataUtilities';

// ─── JSON Helpers ─────────────────────────────────────────────────────────────

function parseCompareJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return { data: null, error: null };
  let json = trimmed;
  if (!json.startsWith('[')) json = '[' + json + ']';
  json = json.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
  try {
    const parsed = JSON.parse(json);
    return { data: Array.isArray(parsed) ? parsed : [parsed], error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ─── ID / Value Helpers ───────────────────────────────────────────────────────

const noneIfNull = val => (val === null || val === undefined || val === '') ? 'none' : val;

function toProductId(name) {
  return 'p_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}
function toMachineId(name) {
  return 'm_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}
function toRecipeId(machineId, existingIds) {
  const prefix = 'r_' + machineId.replace(/^m_/, '') + '_';
  const used = new Set(existingIds.filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length)));
  let n = 1;
  while (used.has(String(n).padStart(2, '0'))) n++;
  return prefix + String(n).padStart(2, '0');
}

function normalizeRpMultiplier(val) {
  if (val == null) return null;
  const n = parseFloat(String(val).replace(/x$/i, '').trim());
  return isNaN(n) ? String(val).replace(/x$/i, '').trim() : n;
}

function parseUnitToken(token) {
  const s = token.trim().toUpperCase().replace(/\/S$/, '');
  const suffixes = [['TMF', 1e12], ['GMF', 1e9], ['MMF', 1e6], ['KMF', 1e3], ['MF', 1],
                    ['T', 1e12], ['G', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [sfx, mult] of suffixes) {
    if (s.endsWith(sfx)) return parseFloat(s) * mult;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseCapacity(val) {
  if (val == null) return null;
  const s = String(val).trim().replace(/\s/g, '');
  let total = 0;
  for (const addend of s.split('+')) {
    let product = null;
    for (const factor of addend.split('*')) {
      const v = parseUnitToken(factor);
      if (v === null) return null;
      product = product === null ? v : product * v;
    }
    if (product === null) return null;
    total += product;
  }
  return Math.round(total);
}

function sanitizeItemName(name) {
  if (!name) return name;
  return name
    .replace(/<sup>(.*?)<\/sup>/gi, '^$1').replace(/<sub>(.*?)<\/sub>/gi, '_$1')
    .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// ─── Compare Logic ────────────────────────────────────────────────────────────

function runProductsCompare(existing, pasted) {
  const results = { new: [], missing: [], changed: [], same: [] };
  const byName = Object.fromEntries(existing.map(e => [e.name.toLowerCase(), e]));
  const pastedNames = new Set();

  pasted.forEach(p => {
    if (!p.Page) return;
    pastedNames.add(p.Page.toLowerCase());
    const ex = byName[p.Page.toLowerCase()];
    if (!ex) { results.new.push({ name: p.Page, data: p }); return; }
    const changes = [];
    const price = parseFloat(p.sellValue);
    if (!isNaN(price) && price !== ex.price) changes.push({ field: 'sellValue → price', from: ex.price, to: price });
    const rp = normalizeRpMultiplier(p.resValue);
    if (rp !== normalizeRpMultiplier(ex.rp_multiplier)) changes.push({ field: 'resValue → rp_multiplier', from: normalizeRpMultiplier(ex.rp_multiplier), to: rp });
    if (changes.length) results.changed.push({ item: { id: ex.id, name: p.Page }, existing: ex, changes });
    else results.same.push({ id: ex.id, name: p.Page });
  });
  existing.forEach(ex => { if (!pastedNames.has(ex.name.toLowerCase())) results.missing.push(ex); });
  return results;
}

const MACHINE_INFO_FIELDS = ['Size', 'Pollution', 'PowerInput', 'PowerOutput', 'TransferRate', 'Capacity', 'Category', 'Subcategory', 'Variant', 'Limited'];

function runMachinesCompare(existing, pasted) {
  const results = { new: [], missing: [], changed: [], same: [] };
  const byName = Object.fromEntries(existing.map(e => [e.name.toLowerCase(), e]));
  const pastedNames = new Set();

  pasted.forEach(p => {
    if (!p.Page) return;
    pastedNames.add(p.Page.toLowerCase());
    const ex = byName[p.Page.toLowerCase()];
    const infoFields = MACHINE_INFO_FIELDS.filter(f => p[f] != null).map(f => ({ field: f, value: p[f] }));
    if (!ex) { results.new.push({ name: p.Page, data: p, infoFields }); return; }
    const changes = [];
    if (String(p.Tier ?? null) !== String(ex.tier ?? null))
      changes.push({ field: 'Tier → tier', from: ex.tier ?? null, to: p.Tier ?? null });
    if (changes.length) results.changed.push({ item: { id: ex.id, name: p.Page }, existing: ex, changes, infoFields });
    else results.same.push({ id: ex.id, name: p.Page, infoFields });
  });
  existing.forEach(ex => { if (!pastedNames.has(ex.name.toLowerCase())) results.missing.push(ex); });
  return results;
}

function diffIOItems(existingIO, pastedIO) {
  const exMap = Object.fromEntries(existingIO.map(i => [i.name.toLowerCase(), i]));
  const pastedMap = Object.fromEntries(pastedIO.map(i => [i.name.toLowerCase(), i]));
  const added = pastedIO.filter(i => !exMap[i.name.toLowerCase()]);
  const removed = existingIO.filter(i => !pastedMap[i.name.toLowerCase()]);
  const qtyChanged = pastedIO
    .filter(i => exMap[i.name.toLowerCase()] && Number(i.qty) !== Number(exMap[i.name.toLowerCase()].qty))
    .map(i => ({ name: i.name, from: exMap[i.name.toLowerCase()].qty, to: i.qty }));
  return { added, removed, qtyChanged, hasChanges: !!(added.length || removed.length || qtyChanged.length) };
}

function buildPastedRecipes(infoItems, inputItems, outputItems) {
  const map = {};
  const ensure = (id, page, machine) => {
    if (!map[id]) map[id] = { id, page, machine, time: null, mamyflux: null, c_mode: null, inputs: [], outputs: [] };
    return map[id];
  };
  infoItems.forEach(r => {
    const e = ensure(r.id, r.Page, r.machine);
    Object.assign(e, { time: r.time, mamyflux: r.mamyflux, c_mode: r['time mode'] ?? null });
  });
  inputItems.forEach(r => ensure(r.id, r.Page, r.machine).inputs.push({ name: sanitizeItemName(r.item), qty: r.amount, q_mode: r['amount mode'] ?? null }));
  outputItems.forEach(r => ensure(r.id, r.Page, r.machine).outputs.push({ name: sanitizeItemName(r.item), qty: r.amount, q_mode: r['amount mode'] ?? null }));
  return map;
}

function runRecipesCompare(existing, pastedMap, productNameById) {
  const results = { new: [], missing: [], changed: [], same: [] };
  const matchedIds = new Set();

  const byId = {}, byIdNoPrefix = {}, byMachineId = {};
  existing.forEach(r => {
    byId[r.id.toLowerCase()] = r;
    byIdNoPrefix[(r.id.startsWith('r_') ? r.id.slice(2) : r.id).toLowerCase()] = r;
    const mk = r.machine_id.toLowerCase();
    (byMachineId[mk] = byMachineId[mk] || []).push(r);
  });

  const resolveIO = r => ({
    inputs:  (r.inputs  || []).map(i => ({ name: productNameById[i.product_id] || i.product_id, qty: i.quantity })),
    outputs: (r.outputs || []).map(i => ({ name: productNameById[i.product_id] || i.product_id, qty: i.quantity })),
  });

  const ioMatch = (exR, pIns, pOuts) => {
    const sorted = arr => arr.map(i => i.name.toLowerCase()).sort();
    const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const ex = resolveIO(exR);
    return eq(sorted(ex.inputs), sorted(pIns)) && eq(sorted(ex.outputs), sorted(pOuts));
  };

  Object.values(pastedMap).forEach(p => {
    const pid = (p.id || '').toLowerCase();
    let found = byId[pid] || byId['r_' + pid] || byIdNoPrefix[pid];
    let idMismatch = null;

    if (found) {
      if (!ioMatch(found, p.inputs, p.outputs)) {
        const alt = (byMachineId[found.machine_id.toLowerCase()] || []).filter(r => r.id !== found.id).find(r => ioMatch(r, p.inputs, p.outputs));
        if (alt) { idMismatch = { pastedId: p.id, existingId: alt.id }; found = alt; }
      }
    } else {
      const candidates = Object.values(byId).filter(r =>
        (productNameById[r.machine_id.toLowerCase()] || r.machine_id || '').toLowerCase() === (p.machine || '').toLowerCase()
      );
      const alt = candidates.find(r => ioMatch(r, p.inputs, p.outputs));
      if (alt) { idMismatch = { pastedId: p.id, existingId: alt.id }; found = alt; }
    }

    if (!found) { results.new.push({ id: p.id, name: p.page || p.id, machine: p.machine, pasted: p }); return; }

    matchedIds.add(found.id);
    const changes = [];
    if (idMismatch) changes.push({ field: 'id mismatch', from: idMismatch.existingId, to: idMismatch.pastedId });
    if (p.time != null && Number(p.time) !== Number(found.cycle_time))
      changes.push({ field: 'time / cycle_time', from: found.cycle_time, to: p.time });
    if (p.mamyflux != null && Number(p.mamyflux) !== Number(found.power_consumption))
      changes.push({ field: 'mamyflux / power_consumption', from: found.power_consumption, to: p.mamyflux });
    const inDiff  = diffIOItems(resolveIO(found).inputs,  p.inputs);
    const outDiff = diffIOItems(resolveIO(found).outputs, p.outputs);
    if (inDiff.hasChanges)  changes.push({ field: 'inputs',  diff: inDiff });
    if (outDiff.hasChanges) changes.push({ field: 'outputs', diff: outDiff });

    if (changes.length) results.changed.push({ id: p.id, name: p.page || found.name, machine: p.machine, changes, pasted: p, existing: found });
    else                results.same.push({ id: p.id, name: p.page || found.name, machine: p.machine });
  });

  existing.forEach(ex => { if (!matchedIds.has(ex.id)) results.missing.push({ id: ex.id, name: ex.name, machine: ex.machine_id }); });
  return results;
}

// ─── Export Builders ──────────────────────────────────────────────────────────

function applyChangedEntry(merged, changes, isChecked, fieldMap) {
  // isChecked → apply pasted values; unchecked → only fill nulls
  changes.forEach(c => {
    const key = fieldMap[c.field];
    if (!key) return;
    if (isChecked) merged[key] = c.to;
    else if (merged[key] === null || merged[key] === undefined) merged[key] = c.to;
  });
}

function buildProductsExport(existing, results, selectedKeys) {
  const byId = Object.fromEntries(existing.map(e => [e.id, e]));
  const toRow = e => ({ id: e.id, name: e.name, type: noneIfNull(e.type), price: e.price ?? null, rp_multiplier: e.rp_multiplier ?? null });
  const hasSame = [...selectedKeys].some(k => k.startsWith('same:'));
  const out = [];

  results.same.forEach((entry, i) => {
    if (!selectedKeys.has(`same:${entry.id || entry.name || i}`)) return;
    const ex = byId[entry.id];
    if (ex) out.push(toRow(ex));
  });
  results.changed.forEach((entry, i) => {
    const isChecked = selectedKeys.has(`changed:${entry.item?.id || entry.item?.name || i}`);
    if (!isChecked && !hasSame) return;
    const merged = { ...entry.existing };
    applyChangedEntry(merged, entry.changes, isChecked, { 'sellValue → price': 'price', 'resValue → rp_multiplier': 'rp_multiplier' });
    out.push(toRow(merged));
  });
  results.missing.forEach((entry, i) => {
    if (!selectedKeys.has(`missing:${entry.id || entry.name || i}`)) return;
    out.push(toRow(entry));
  });
  results.new.forEach((entry, i) => {
    if (!selectedKeys.has(`new:${entry.name || i}`)) return;
    out.push({ id: toProductId(entry.name), name: entry.name, type: 'none', price: parseFloat(entry.data?.sellValue) || null, rp_multiplier: normalizeRpMultiplier(entry.data?.resValue) });
  });
  return out;
}

const MACHINE_FIELD_MAP = { Size: 'size', TransferRate: 'transfer_rate', Capacity: 'capacity', Category: 'category', Subcategory: 'subcategory', Variant: 'variant', Limited: 'limited' };

function applyMachineInfo(row, infoFields) {
  if (!infoFields) return row;
  infoFields.forEach(({ field, value }) => {
    const key = MACHINE_FIELD_MAP[field];
    if (!key) return;
    if (key === 'capacity') row[key] = parseCapacity(value);
    else if (key === 'transfer_rate') row[key] = Math.round(parseCapacity(value) ?? 0);
    else if (key === 'variant') row[key] = (value && String(value).toLowerCase() !== 'none') ? 'm_' + String(value).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : 'none';
    else if (key === 'limited') { const v = String(value).toLowerCase(); row[key] = v === 'yes' || v === 'true' || v === '1'; }
    else row[key] = value;
  });
  return row;
}

function buildMachinesExport(existing, results, selectedKeys) {
  const byId = Object.fromEntries(existing.map(e => [e.id, e]));
  const toRow = (e, infoFields) => applyMachineInfo({
    id: e.id, name: e.name, cost: e.cost ?? null, size: e.size ?? null, tier: e.tier ?? null,
    transfer_rate: e.transfer_rate ?? 0, capacity: e.capacity ?? null, category: e.category ?? null,
    subcategory: e.subcategory ?? null,
    variant: (e.variant && e.variant !== 'none') ? 'm_' + String(e.variant).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : 'none',
    limited: e.limited != null ? !!e.limited : false, gamemode: e.gamemode ?? 'any'
  }, infoFields);
  const hasSame = [...selectedKeys].some(k => k.startsWith('same:'));
  const out = [];

  results.same.forEach((entry, i) => {
    if (!selectedKeys.has(`same:${entry.id || entry.name || i}`)) return;
    const ex = byId[entry.id];
    if (ex) out.push(toRow(ex, entry.infoFields));
  });
  results.changed.forEach((entry, i) => {
    const isChecked = selectedKeys.has(`changed:${entry.item?.id || entry.item?.name || i}`);
    if (!isChecked && !hasSame) return;
    const merged = { ...entry.existing };
    applyChangedEntry(merged, entry.changes, isChecked, { 'Tier → tier': 'tier' });
    out.push(toRow(merged, entry.infoFields));
  });
  results.missing.forEach((entry, i) => {
    if (!selectedKeys.has(`missing:${entry.id || entry.name || i}`)) return;
    out.push(toRow(entry, null));
  });
  results.new.forEach((entry, i) => {
    if (!selectedKeys.has(`new:${entry.name || i}`)) return;
    out.push(applyMachineInfo({ id: toMachineId(entry.name), name: entry.name, cost: null, size: null, tier: entry.data?.Tier ?? null, transfer_rate: 0, capacity: null, category: null, subcategory: null, variant: 'none', limited: false, gamemode: 'any' }, entry.infoFields));
  });
  return out;
}

function buildRecipesExport(existing, results, selectedKeys, productIdByName, machineIdByName) {
  const byId = Object.fromEntries(existing.map(e => [e.id, e]));
  const toRow = e => ({
    id: e.id, name: e.name, machine_id: e.machine_id,
    cycle_time: e.cycle_time ?? null, c_mode: noneIfNull(e.c_mode),
    power_consumption: e.power_consumption ?? null, power_type: noneIfNull(e.power_type),
    pollution: e.pollution ?? 0,
    inputs:  (e.inputs  || []).map(i => ({ product_id: i.product_id, quantity: i.quantity, q_mode: noneIfNull(i.q_mode) })),
    outputs: (e.outputs || []).map(o => ({ product_id: o.product_id, quantity: o.quantity, q_mode: noneIfNull(o.q_mode) })),
  });
  const resolveIO = items => items.map(item => ({
    product_id: productIdByName[(item.name || '').toLowerCase()] || toProductId(item.name || ''),
    quantity: Number(item.qty), q_mode: noneIfNull(item.q_mode),
  }));
  const allIds = Object.keys(byId);
  const hasSame = [...selectedKeys].some(k => k.startsWith('same:'));
  const out = [];

  results.same.forEach((entry, i) => {
    if (!selectedKeys.has(`same:${entry.id || i}`)) return;
    const ex = byId[entry.id] || byId['r_' + entry.id];
    if (ex) out.push(toRow(ex));
  });
  results.changed.forEach((entry, i) => {
    const isChecked = selectedKeys.has(`changed:${entry.id || i}`);
    if (!isChecked && !hasSame) return;
    const merged = { ...entry.existing };
    applyChangedEntry(merged, entry.changes, isChecked, { 'time / cycle_time': 'cycle_time', 'mamyflux / power_consumption': 'power_consumption' });
    const hasInputChange  = entry.changes.find(c => c.field === 'inputs');
    const hasOutputChange = entry.changes.find(c => c.field === 'outputs');
    if (isChecked) {
      if (hasInputChange)  merged.inputs  = resolveIO(entry.pasted.inputs  || []);
      if (hasOutputChange) merged.outputs = resolveIO(entry.pasted.outputs || []);
      if (entry.pasted?.c_mode !== undefined) merged.c_mode = entry.pasted.c_mode;
    } else {
      if (!merged.inputs?.length  && entry.pasted?.inputs?.length)  merged.inputs  = resolveIO(entry.pasted.inputs);
      if (!merged.outputs?.length && entry.pasted?.outputs?.length) merged.outputs = resolveIO(entry.pasted.outputs);
      if ((merged.c_mode == null || merged.c_mode === 'none') && entry.pasted?.c_mode != null) merged.c_mode = entry.pasted.c_mode;
    }
    out.push(toRow(merged));
  });
  results.missing.forEach((entry, i) => {
    if (!selectedKeys.has(`missing:${entry.id || i}`)) return;
    const ex = byId[entry.id];
    if (ex) out.push(toRow(ex));
  });
  results.new.forEach((entry, i) => {
    if (!selectedKeys.has(`new:${entry.id || i}`)) return;
    const p = entry.pasted;
    const machine_id = machineIdByName[(p.machine || '').toLowerCase()] || toMachineId(p.machine || '');
    const newId = toRecipeId(machine_id, allIds);
    allIds.push(newId);
    out.push({ id: newId, name: p.page || p.id, machine_id, cycle_time: p.time ?? null, c_mode: noneIfNull(p.c_mode), power_consumption: p.mamyflux ?? null, power_type: 'none', pollution: 0, inputs: resolveIO(p.inputs || []), outputs: resolveIO(p.outputs || []) });
  });
  return out;
}

// ─── UI Components ────────────────────────────────────────────────────────────

const COMPARE_STATUS = {
  new:     { label: 'New',       color: '#22c55e' },
  missing: { label: 'Missing',   color: '#f59e0b' },
  changed: { label: 'Changed',   color: '#3b82f6' },
  same:    { label: 'Unchanged', color: 'var(--text-muted)' },
};

const Tag = ({ children, color, bg, border }) => (
  <span style={{ fontSize: '11px', padding: '1px 5px', background: bg, border: `1px solid ${border}`, color, borderRadius: 'var(--radius-sm)' }}>{children}</span>
);

const FieldBadge = ({ field, from, to }) => (
  <span style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
    {field}: <span style={{ color: '#f87171' }}>{String(from)}</span> → <span style={{ color: '#4ade80' }}>{String(to)}</span>
  </span>
);

const CompareItemRow = ({ children, accent }) => (
  <div style={{ padding: '6px 10px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: '13px', borderLeft: `3px solid ${accent || 'transparent'}` }}>
    {children}
  </div>
);

const CompareSummaryBar = ({ results }) => (
  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
    {Object.entries(COMPARE_STATUS).map(([key, { label, color }]) => (
      <div key={key} style={{ padding: '4px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', border: `1px solid ${color}44` }}>
        <span style={{ color }}>{label}:</span> <strong style={{ color: 'var(--text-primary)' }}>{results[key].length}</strong>
      </div>
    ))}
  </div>
);

const CompareFilterBar = ({ filters, onToggle, search, onSearch }) => (
  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
    {Object.entries(COMPARE_STATUS).map(([key, { label, color }]) => (
      <button key={key} onClick={() => onToggle(key)} className="btn btn-secondary"
        style={{ padding: '3px 10px', fontSize: '12px', minWidth: 'auto', width: 'auto', opacity: filters.includes(key) ? 1 : 0.35, color: filters.includes(key) ? color : undefined, borderColor: filters.includes(key) ? color : undefined }}>
        {label}
      </button>
    ))}
    <input type="text" placeholder="Search..." value={search} onChange={e => onSearch(e.target.value)}
      className="input" style={{ flex: 1, minWidth: '100px', padding: '4px 8px', fontSize: '12px' }} />
  </div>
);

const CompareSection = ({ status, items, renderItem, selectedKeys, onToggleKey, getKey }) => {
  const [open, setOpen] = useState(true);
  const { label, color } = COMPARE_STATUS[status];
  if (!items.length) return null;
  const keys = items.map(getKey);
  const allSelected = keys.every(k => selectedKeys.has(k));
  const someSelected = !allSelected && keys.some(k => selectedKeys.has(k));
  return (
    <div style={{ marginBottom: '10px', border: '1px solid var(--border-divider)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'var(--bg-secondary)', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={e => { e.stopPropagation(); keys.forEach(k => onToggleKey(k, !allSelected)); }}
            onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ color, fontWeight: 600, fontSize: '13px' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: color, color: '#fff', borderRadius: '999px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>{items.length}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map((item, i) => (
            <div key={keys[i]} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <input type="checkbox" checked={selectedKeys.has(keys[i])} onChange={() => onToggleKey(keys[i])}
                style={{ marginTop: '8px', flexShrink: 0, cursor: 'pointer' }} />
              <div style={{ flex: 1, minWidth: 0 }}>{renderItem(item, i)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HintBox = ({ children }) => (
  <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: '10px', lineHeight: '1.6', border: '1px solid var(--border-divider)' }}>
    {children}
  </div>
);

// ─── Shared Compare Panel ─────────────────────────────────────────────────────

const useToggleSet = () => {
  const [set, setSet] = useState(new Set());
  const toggle = (k, forceTo) => setSet(prev => {
    const next = new Set(prev);
    (forceTo !== undefined ? forceTo : !next.has(k)) ? next.add(k) : next.delete(k);
    return next;
  });
  return [set, setSet, toggle];
};

const ComparePanel = ({ typeName, existing, compareFn, renderNew, renderMissing, renderChanged, renderSame, exportBuilder, hint }) => {
  const [paste, setPaste] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(['new', 'missing', 'changed']);
  const [search, setSearch] = useState('');
  const [selectedKeys, , toggleKey] = useToggleSet();

  const getKey = (status, item) => {
    const base = item.item || item;
    return `${status}:${base.id || base.name}`;
  };

  const handleCompare = () => {
    const { data, error: err } = parseCompareJson(paste);
    if (err) { setError(err); setResults(null); return; }
    if (!data?.length) { setError('No valid JSON array found'); return; }
    setError(null);
    setResults(compareFn(existing, data));
  };

  const filtered = useMemo(() => {
    if (!results) return null;
    const s = search.toLowerCase();
    const f = arr => arr.filter(i => { const it = i.item || i; return !s || (it.name || it.id || '').toLowerCase().includes(s); });
    return { new: f(results.new), missing: f(results.missing), changed: f(results.changed), same: f(results.same) };
  }, [results, search]);

  const toggleFilter = k => setFilters(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);

  const handleExport = () => {
    if (!results) return;
    downloadJson(exportBuilder(existing, results, selectedKeys), `${typeName.toLowerCase()}_export.json`);
  };

  return (
    <div>
      {hint && <HintBox>{hint}</HintBox>}
      <textarea value={paste} onChange={e => setPaste(e.target.value)} className="input"
        placeholder={`Paste ${typeName} JSON array...\n[\n  { "Page": "...", ... },\n  ...\n]`}
        style={{ width: '100%', minHeight: '110px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', marginBottom: '8px', boxSizing: 'border-box' }} />
      {error && <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '8px' }}>⚠ {error}</div>}
      <button onClick={handleCompare} className="btn btn-primary" style={{ width: '100%', marginBottom: '14px' }} disabled={!paste.trim()}>
        Compare {typeName}
      </button>
      {filtered && <>
        <CompareSummaryBar results={filtered} />
        <CompareFilterBar filters={filters} onToggle={toggleFilter} search={search} onSearch={setSearch} />
        {['new', 'missing', 'changed', 'same'].filter(s => filters.includes(s)).map(status => (
          <CompareSection key={status} status={status} items={filtered[status]}
            renderItem={status === 'changed' ? renderChanged : status === 'new' ? renderNew : status === 'missing' ? renderMissing : renderSame}
            selectedKeys={selectedKeys} onToggleKey={toggleKey}
            getKey={(item, i) => getKey(status, item) || `${status}:${i}`} />
        ))}
        {selectedKeys.size > 0 && (
          <button onClick={handleExport} className="btn btn-primary" style={{ width: '100%', marginTop: '10px', background: '#16a34a', borderColor: '#16a34a' }}>
            ↓ Export {selectedKeys.size} selected item{selectedKeys.size !== 1 ? 's' : ''} as JSON
          </button>
        )}
      </>}
    </div>
  );
};

// ─── Recipe Compare Panel ─────────────────────────────────────────────────────

const RecipeComparePanel = ({ existing }) => {
  const [pastes, setPastes] = useState({ info: '', inputs: '', outputs: '' });
  const [results, setResults] = useState(null);
  const [errors, setErrors] = useState({});
  const [filters, setFilters] = useState(['new', 'missing', 'changed']);
  const [search, setSearch] = useState('');
  const [selectedKeys, , toggleKey] = useToggleSet();

  const getKey = (status, item, i) => `${status}:${item.id || i}`;

  const handleCompare = () => {
    const parsed = Object.fromEntries(Object.entries(pastes).map(([k, v]) => [k, parseCompareJson(v)]));
    const errs = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));
    setErrors(errs);
    if (Object.keys(errs).length) { setResults(null); return; }
    if (!parsed.info.data && !parsed.inputs.data && !parsed.outputs.data) { setErrors({ general: 'Nothing pasted' }); return; }
    const pastedMap = buildPastedRecipes(parsed.info.data || [], parsed.inputs.data || [], parsed.outputs.data || []);
    const productNameById = Object.fromEntries(getCustomProducts().map(p => [p.id, p.name]));
    setResults(runRecipesCompare(existing, pastedMap, productNameById));
  };

  const handleExport = () => {
    if (!results) return;
    const productIdByName = Object.fromEntries(getCustomProducts().map(p => [p.name.toLowerCase(), p.id]));
    const machineIdByName = Object.fromEntries(getCustomMachines().map(m => [m.name.toLowerCase(), m.id]));
    downloadJson(buildRecipesExport(existing, results, selectedKeys, productIdByName, machineIdByName), 'recipes_export.json');
  };

  const filtered = useMemo(() => {
    if (!results) return null;
    const s = search.toLowerCase();
    const f = arr => arr.filter(i => !s || (i.name || i.id || '').toLowerCase().includes(s) || (i.machine || '').toLowerCase().includes(s));
    return { new: f(results.new), missing: f(results.missing), changed: f(results.changed), same: f(results.same) };
  }, [results, search]);

  const toggleFilter = k => setFilters(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  const taStyle = { width: '100%', minHeight: '100px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' };

  const renderChanged = (item, i) => (
    <CompareItemRow key={item.id || i} accent="#3b82f6">
      <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
        {item.changes.filter(c => c.field !== 'inputs' && c.field !== 'outputs').map(c => <FieldBadge key={c.field} {...c} />)}
      </div>
      {item.changes.filter(c => c.field === 'inputs' || c.field === 'outputs').map(c => (
        <div key={c.field} style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.field} changes</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {c.diff.added.map((io, idx)      => <Tag key={idx} color="#4ade80" bg="#052e16" border="#166534">+ {io.name} ×{io.qty}</Tag>)}
            {c.diff.removed.map((io, idx)    => <Tag key={idx} color="#f87171" bg="#2d0a0a" border="#7c2d12">− {io.name} ×{io.qty}</Tag>)}
            {c.diff.qtyChanged.map((io, idx) => <Tag key={idx} color="#93c5fd" bg="var(--bg-secondary)" border="#1e40af">{io.name}: ×{io.from} → ×{io.to}</Tag>)}
          </div>
        </div>
      ))}
    </CompareItemRow>
  );

  return (
    <div>
      <HintBox>
        Paste data from each wiki table into the fields below, then click <strong>Compare Recipes</strong>.<br />
        <strong>Checked</strong> items export with pasted values applied. <strong>Unchecked</strong> Changed items (when any Unchanged are selected) export using existing values, filling only empty fields from pasted data.
      </HintBox>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
        {[
          { key: 'info',    label: 'Recipe Info',    hint: 'Page, id, machine, time, mamyflux' },
          { key: 'inputs',  label: 'Recipe Inputs',  hint: 'id, item, amount' },
          { key: 'outputs', label: 'Recipe Outputs', hint: 'id, item, amount' },
        ].map(({ key, label, hint }) => (
          <div key={key}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label} <span style={{ opacity: 0.6 }}>({hint})</span></div>
            <textarea value={pastes[key]} onChange={e => setPastes(p => ({ ...p, [key]: e.target.value }))} className="input" style={taStyle} />
            {errors[key] && <div style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>⚠ {errors[key]}</div>}
          </div>
        ))}
      </div>
      {errors.general && <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '8px' }}>⚠ {errors.general}</div>}
      <button onClick={handleCompare} className="btn btn-primary" style={{ width: '100%', marginBottom: '14px' }}
        disabled={!pastes.info.trim() && !pastes.inputs.trim() && !pastes.outputs.trim()}>
        Compare Recipes
      </button>
      {filtered && <>
        <CompareSummaryBar results={filtered} />
        <CompareFilterBar filters={filters} onToggle={toggleFilter} search={search} onSearch={setSearch} />
        {filters.includes('new') && (
          <CompareSection status="new" items={filtered.new} selectedKeys={selectedKeys} onToggleKey={toggleKey}
            getKey={(item, i) => getKey('new', item, i)}
            renderItem={(item, i) => (
              <CompareItemRow key={item.id || i} accent="#22c55e">
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  machine: {item.machine}{item.pasted?.time != null ? ` · time: ${item.pasted.time}s` : ''}{item.pasted?.mamyflux != null ? ` · mamyflux: ${item.pasted.mamyflux}` : ''}
                </div>
                {(item.pasted?.inputs?.length > 0 || item.pasted?.outputs?.length > 0) && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {item.pasted?.inputs?.length  > 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>In:  {item.pasted.inputs.map(io  => `${io.name} ×${io.qty}`).join(', ')}</div>}
                    {item.pasted?.outputs?.length > 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Out: {item.pasted.outputs.map(io => `${io.name} ×${io.qty}`).join(', ')}</div>}
                  </div>
                )}
              </CompareItemRow>
            )} />
        )}
        {filters.includes('missing') && (
          <CompareSection status="missing" items={filtered.missing} selectedKeys={selectedKeys} onToggleKey={toggleKey}
            getKey={(item, i) => getKey('missing', item, i)}
            renderItem={(item, i) => (
              <CompareItemRow key={item.id || i} accent="#f59e0b">
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>machine: {item.machine}</div>
              </CompareItemRow>
            )} />
        )}
        {filters.includes('changed') && (
          <CompareSection status="changed" items={filtered.changed} selectedKeys={selectedKeys} onToggleKey={toggleKey}
            getKey={(item, i) => getKey('changed', item, i)} renderItem={renderChanged} />
        )}
        {filters.includes('same') && (
          <CompareSection status="same" items={filtered.same} selectedKeys={selectedKeys} onToggleKey={toggleKey}
            getKey={(item, i) => getKey('same', item, i)}
            renderItem={(item, i) => (
              <CompareItemRow key={item.id || i}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>({item.id}) · {item.machine}</span>
              </CompareItemRow>
            )} />
        )}
        {selectedKeys.size > 0 && (
          <button onClick={handleExport} className="btn btn-primary" style={{ width: '100%', marginTop: '10px', background: '#16a34a', borderColor: '#16a34a' }}>
            ↓ Export {selectedKeys.size} selected item{selectedKeys.size !== 1 ? 's' : ''} as JSON
          </button>
        )}
      </>}
    </div>
  );
};

// ─── Data Manager Modal ───────────────────────────────────────────────────────

const PRODUCT_HINT = 'Paste a JSON array from the wiki products table. Matched by name using the "Page" field. Checked items export with pasted values; unchecked Changed items (when any Unchanged are selected) keep existing values and only fill empty fields.';
const MACHINE_HINT = 'Paste a JSON array from the wiki machines table. Matched by name using the "Page" field. Info fields (Size, Capacity, etc.) are applied on top of existing data during export.';

const DataManager = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('products');
  const products = getCustomProducts();
  const machines = getCustomMachines();
  const recipes  = getCustomRecipes();

  const tabs = [
    { key: 'products', label: 'Products', count: products.length },
    { key: 'machines', label: 'Machines', count: machines.length },
    { key: 'recipes',  label: 'Recipes',  count: recipes.length  },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '1600px', maxWidth: '98vw', maxHeight: '92vh' }}>
        <h2 className="modal-title">Data Comparator</h2>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '2px solid var(--border-divider)' }}>
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`btn ${activeTab === key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}>
              {label} <span style={{ opacity: 0.6, fontSize: '11px' }}>({count})</span>
            </button>
          ))}
        </div>

        <div className="modal-content" style={{ maxHeight: 'calc(92vh - 180px)', overflowY: 'auto' }}>
          {activeTab === 'products' && (
            <ComparePanel typeName="Products" existing={products} compareFn={runProductsCompare} exportBuilder={buildProductsExport} hint={PRODUCT_HINT}
              renderNew={({ name, data }, i) => (
                <CompareItemRow key={name || i} accent="#22c55e">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
                    {data?.sellValue !== undefined && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>sellValue: {data.sellValue}</span>}
                    {data?.resValue  !== undefined && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>resValue: {data.resValue}</span>}
                  </div>
                </CompareItemRow>
              )}
              renderMissing={(item, i) => (
                <CompareItemRow key={item.id || i} accent="#f59e0b">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>price: {item.price}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>rp: {item.rp_multiplier}</span>
                  </div>
                </CompareItemRow>
              )}
              renderChanged={({ item, existing: ex, changes }, i) => (
                <CompareItemRow key={item.id || i} accent="#3b82f6">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{item.name || ex.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {changes.map(c => <FieldBadge key={c.field} {...c} />)}
                  </div>
                </CompareItemRow>
              )}
              renderSame={({ id, name }, i) => (
                <CompareItemRow key={id || i}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>({id})</span>
                </CompareItemRow>
              )}
            />
          )}

          {activeTab === 'machines' && (
            <ComparePanel typeName="Machines" existing={machines} compareFn={runMachinesCompare} exportBuilder={buildMachinesExport} hint={MACHINE_HINT}
              renderNew={({ name, data, infoFields }, i) => (
                <CompareItemRow key={name || i} accent="#22c55e">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
                    {data?.Tier !== undefined && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tier: {data.Tier}</span>}
                    {infoFields?.map(f => <span key={f.field} style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{f.field}: {String(f.value)}</span>)}
                  </div>
                </CompareItemRow>
              )}
              renderMissing={(item, i) => (
                <CompareItemRow key={item.id || i} accent="#f59e0b">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>tier: {item.tier}</span>
                </CompareItemRow>
              )}
              renderChanged={({ item, existing: ex, changes, infoFields }, i) => (
                <CompareItemRow key={item.id || i} accent="#3b82f6">
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{item.name || ex.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({item.id})</span></div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {changes.map(c => <FieldBadge key={c.field} {...c} />)}
                    {infoFields?.map(f => <span key={f.field} style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>{f.field}: {String(f.value)}</span>)}
                  </div>
                </CompareItemRow>
              )}
              renderSame={({ id, name, infoFields }, i) => (
                <CompareItemRow key={id || i}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>({id})</span>
                  {infoFields?.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '3px' }}>
                      {infoFields.map(f => <span key={f.field} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.field}: {String(f.value)}</span>)}
                    </div>
                  )}
                </CompareItemRow>
              )}
            />
          )}

          {activeTab === 'recipes' && <RecipeComparePanel existing={recipes} />}
        </div>

        <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '15px', width: '100%' }}>Close</button>
      </div>
    </div>
  );
};

export default DataManager;