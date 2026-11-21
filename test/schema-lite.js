'use strict';

// Just enough JSON Schema to check our messages against protocol.schema.json
// without a dependency: type, const, enum, required, properties, items,
// prefixItems, min/maxItems, minimum, exclusiveMinimum, $ref, if/then/else.
// Returns a list of "path: problem" strings; empty means valid.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function validate(root, schema, value, path = '$') {
  const errs = [];
  const go = (s, v, p) => {
    if (s.$ref) {
      const name = s.$ref.replace('#/$defs/', '');
      if (!root.$defs[name]) throw new Error(`unknown $ref ${s.$ref}`);
      go(root.$defs[name], v, p);
    }
    const t = typeOf(v);
    if (s.type && !(s.type === t || (s.type === 'number' && t === 'integer'))) { errs.push(`${p}: expected ${s.type}, got ${t}`); return; }
    if ('const' in s && v !== s.const) errs.push(`${p}: expected ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) errs.push(`${p}: not one of ${s.enum.join(', ')}`);
    if (s.minimum !== undefined && t !== 'array' && v < s.minimum) errs.push(`${p}: below ${s.minimum}`);
    if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) errs.push(`${p}: must be > ${s.exclusiveMinimum}`);
    if (t === 'object') {
      for (const k of s.required || []) if (!(k in v)) errs.push(`${p}: missing ${k}`);
      for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) go(sub, v[k], `${p}.${k}`);
    }
    if (t === 'array') {
      if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${p}: fewer than ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${p}: more than ${s.maxItems} items`);
      (s.prefixItems || []).forEach((sub, i) => { if (i < v.length) go(sub, v[i], `${p}[${i}]`); });
      if (s.items) v.forEach((x, i) => go(s.items, x, `${p}[${i}]`));
    }
    if (s.if) {
      const probe = validate(root, s.if, v, p);
      if (!probe.length && s.then) go(s.then, v, p);
      if (probe.length && s.else) go(s.else, v, p);
    }
  };
  go(schema, value, path);
  return errs;
}

module.exports = { validate };
