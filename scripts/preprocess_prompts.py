#!/usr/bin/env python3
"""
Extract prompts catalog and cohort x prompt mapping from:
1. Flipkart MP AI Prompts.docx → prompts catalog with full text
2. FRM SUMMERIZATION PROMPTS.xlsx → cohort x prompt mapping (live in production)
"""
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC_DIR = os.path.expanduser('~/claude-project/Documents/Return-Adjudication-Automation')
OUT_DIR = os.path.join(BASE_DIR, 'data', 'processed')
os.makedirs(OUT_DIR, exist_ok=True)

# ── 1. Parse prompts from DOCX ──────────────────────────────────
print("Parsing Flipkart MP AI Prompts.docx...")
doc = zipfile.ZipFile(os.path.join(DOC_DIR, 'Flipkart MP AI Prompts.docx'))
xml_content = doc.read('word/document.xml')
tree = ET.fromstring(xml_content)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paras = tree.findall('.//w:p', ns)

lines = []
for p in paras:
    texts = [t.text for t in p.findall('.//w:t', ns) if t.text]
    lines.append(''.join(texts).strip())

# Section boundaries (found from exploration)
SECTIONS = [
    (0, 'CAT Vs CX and CAT Vs OBD', 'image_adjudication_cx_agent / image_adjudication_obd_agent'),
    (2, 'FK_PROMPT_1', None),
    (348, 'FK_PROMPT_2', None),
    (527, 'FK_PROMPT_3', None),
    (723, 'FK_PROMPT_4', None),
    (944, 'Context Agent', 'context_agent'),
    (1715, 'Catalogue Analyst', 'catalog_correctness_agent'),
    (1921, 'Risk Analyzer', 'risk_signals_agent'),
    (1992, 'Decision Agent', 'decision_agent'),
    (3040, 'REMAINING REASON', None),
]

def extract_metadata(text_block):
    """Extract version, author from a prompt text block."""
    version = ''
    author = ''
    for line in text_block.split('\n'):
        if 'Version:' in line:
            m = re.search(r'Version:\s*(.+)', line)
            if m: version = m.group(1).strip()
        if 'Author:' in line:
            m = re.search(r'Author:\s*(.+)', line)
            if m: author = m.group(1).strip()
    return version, author

# Build prompt catalog
prompts = []

# FK_PROMPT_1 through FK_PROMPT_4 (image adjudication prompts)
fk_prompts = [
    {'id': 'FK_PROMPT_1', 'start': 2, 'end': 348},
    {'id': 'FK_PROMPT_2', 'start': 348, 'end': 527},
    {'id': 'FK_PROMPT_3', 'start': 527, 'end': 723},
    {'id': 'FK_PROMPT_4', 'start': 723, 'end': 944},
]

for fp in fk_prompts:
    text = '\n'.join(l for l in lines[fp['start']:fp['end']] if l)
    version, author = extract_metadata(text)
    prompts.append({
        'id': fp['id'],
        'name': fp['id'],
        'agent': 'image_adjudication_cx_agent / image_adjudication_obd_agent',
        'description': f'Image adjudication prompt for catalog vs customer/OBD image comparison',
        'version': version,
        'author': author,
        'inputClasses': 'Catalog Image + Wild Images (CX or OBD) + return_reason + return_sub_reason + vertical',
        'outputClasses': 'Misshipment | Major Damage | Minor Damage | Major Missing | Minor Missing | Multiple Issue | No Issue | Can\'t Say',
        'isLive': True,
        'promptText': text,
    })

# Context Agent
text = '\n'.join(l for l in lines[944:1715] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'CONTEXT_AGENT_PROMPT',
    'name': 'Context Agent Prompt',
    'agent': 'context_agent',
    'description': 'Generates structured Customer Return Summary from raw JSON input fields',
    'version': version,
    'author': author,
    'inputClasses': '60+ fields: order_id, return_id, product_title, return_reason, return_comments, etc.',
    'outputClasses': 'Narrative summary (no classification)',
    'isLive': True,
    'promptText': text,
})

# Catalogue Analyst
text = '\n'.join(l for l in lines[1715:1921] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'CATALOG_CORRECTNESS_PROMPT',
    'name': 'Catalogue Analyst Prompt',
    'agent': 'catalog_correctness_agent',
    'description': 'Audits product catalog listing for visual vs text inconsistencies',
    'version': version,
    'author': author,
    'inputClasses': 'product_attributes + product_image + product_title + vertical',
    'outputClasses': 'Issue | No Issue | Can\'t Say',
    'isLive': True,
    'promptText': text,
})

# Risk Analyzer
text = '\n'.join(l for l in lines[1921:1992] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'RISK_SIGNALS_PROMPT',
    'name': 'Risk Analyzer Prompt',
    'agent': 'risk_signals_agent',
    'description': 'Evaluates cluster risk labels and image similarity for fraud signals',
    'version': version,
    'author': author,
    'inputClasses': '6 cluster risk labels + image_similarity_distance',
    'outputClasses': 'Issue | No Issue | Can\'t Say',
    'isLive': True,
    'promptText': text,
})

# Decision Agent - DAMAGED_PRODUCT
text = '\n'.join(l for l in lines[1992:2451] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'DECISION_DAMAGED_PRODUCT',
    'name': 'Decision Agent - DAMAGED_PRODUCT',
    'agent': 'decision_agent',
    'description': '6-step decision tree for DAMAGED_PRODUCT return reason',
    'version': version,
    'author': author,
    'inputClasses': 'All upstream agent outputs + order metadata',
    'outputClasses': 'Approve | Reject | Detailed Investigation',
    'isLive': True,
    'promptText': text,
})

# Decision Agent - MISSHIPMENT
text = '\n'.join(l for l in lines[2451:3040] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'DECISION_MISSHIPMENT',
    'name': 'Decision Agent - MISSHIPMENT',
    'agent': 'decision_agent',
    'description': '6-step decision tree for MISSHIPMENT return reason',
    'version': version,
    'author': author,
    'inputClasses': 'All upstream agent outputs + order metadata',
    'outputClasses': 'Approve | Reject | Detailed Investigation',
    'isLive': True,
    'promptText': text,
})

# Decision Agent - REMAINING REASON
text = '\n'.join(l for l in lines[3040:] if l)
version, author = extract_metadata(text)
prompts.append({
    'id': 'DECISION_REMAINING',
    'name': 'Decision Agent - REMAINING REASON',
    'agent': 'decision_agent',
    'description': '9 sequential rules for all other return reasons',
    'version': version or '4.0',
    'author': author or 'raghavendra.b',
    'inputClasses': 'All upstream agent outputs + order metadata',
    'outputClasses': 'Approve | Reject | Detailed Investigation | Reason Selection Issue',
    'isLive': True,
    'promptText': text,
})

# CX vs OBD agent prompt (separate from FK_PROMPT series)
prompts.append({
    'id': 'CX_VS_OBD_PROMPT',
    'name': 'CX vs OBD Agent Prompt',
    'agent': 'image_adjudication_cx_vs_obd_agent',
    'description': 'Fraud detection: cross-references OBD images against customer images',
    'version': '2.0',
    'author': 'raghavendra.b',
    'inputClasses': 'cx_images + obd_images + return_reason + return_sub_reason + vertical',
    'outputClasses': 'Misshipment | Damage | No Issue | Can\'t Say',
    'isLive': True,
    'promptText': '(Embedded in Flipkart MP AI Prompts.docx - CX vs OBD dedicated prompt)',
})

# CX vs POD agent prompt
prompts.append({
    'id': 'CX_VS_POD_PROMPT',
    'name': 'CX vs POD Agent Prompt',
    'agent': 'image_adjudication_cx_vs_pod_agent',
    'description': 'Cross-references customer images with POD last-mile images (~35% coverage)',
    'version': '1.0',
    'author': 'raghavendra.b',
    'inputClasses': 'cx_images + pod_images + product_title + return_reason + return_sub_reason + vertical',
    'outputClasses': 'Misshipment | Major Damage | Minor Damage | Major Missing | Minor Missing | Multiple Issue | No Issue | Can\'t Say',
    'isLive': True,
    'promptText': '(Conditional prompt - triggered only when POD images available)',
})

# Intent Resonance agent prompt
prompts.append({
    'id': 'INTENT_RESONANCE_PROMPT',
    'name': 'Intent Resonance Agent Prompt',
    'agent': 'intent_resonance_agent',
    'description': 'Detects reason-selection mismatches between dropdown reason and free-text comment',
    'version': '5.0',
    'author': 'raghavendra.b',
    'inputClasses': 'return_reason + return_sub_reason + return_comments + business_unit',
    'outputClasses': 'Issue | No Issue | Can\'t Say',
    'isLive': True,
    'promptText': '(Embedded in agent_detailed_tabular.csv use-case 2)',
})

print(f"  Extracted {len(prompts)} prompts")

# ── 2. Parse cohort x prompt mapping from XLSX ──────────────────
print("Parsing FRM SUMMERIZATION PROMPTS.xlsx...")
xlsx = zipfile.ZipFile(os.path.join(DOC_DIR, 'FRM SUMMERIZATION PROMPTS.xlsx'))
xns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ss_xml = xlsx.read('xl/sharedStrings.xml')
ss_tree = ET.fromstring(ss_xml)
strings = []
for si in ss_tree.findall('.//s:si', xns):
    texts = si.findall('.//s:t', xns)
    strings.append(''.join(t.text or '' for t in texts))

def parse_sheet(filename, marketplace):
    tree = ET.fromstring(xlsx.read(filename))
    rows = tree.findall('.//s:row', xns)
    mappings = []
    for row in rows[1:]:  # skip header
        cells = row.findall('.//s:c', xns)
        vals = []
        for c in cells:
            t_attr = c.attrib.get('t', '')
            v_el = c.find('s:v', xns)
            if v_el is not None and v_el.text is not None:
                if t_attr == 's':
                    vals.append(strings[int(v_el.text)])
                else:
                    vals.append(v_el.text)
            else:
                vals.append('')
        if len(vals) < 5:
            continue

        if marketplace == 'FLIPKART':
            mp, reason, sub_reason, vertical, prompt_id = vals[0], vals[1], vals[2], vals[3], vals[4]
        else:
            # HYPERLOCAL has sl_no as first col
            mp, reason, sub_reason, vertical, prompt_id = vals[1], vals[2], vals[3], vals[4], vals[5]

        if not mp or not reason:
            continue

        mappings.append({
            'marketplace': mp.strip(),
            'return_reason': reason.strip(),
            'return_sub_reason': sub_reason.strip(),
            'vertical': vertical.strip(),
            'prompt_id': prompt_id.strip(),
        })
    return mappings

fk_mappings = parse_sheet('xl/worksheets/sheet1.xml', 'FLIPKART')
hl_mappings = parse_sheet('xl/worksheets/sheet2.xml', 'HYPERLOCAL')
all_mappings = fk_mappings + hl_mappings

print(f"  FLIPKART: {len(fk_mappings)} mappings")
print(f"  HYPERLOCAL: {len(hl_mappings)} mappings")

# ── 3. Write output ─────────────────────────────────────────────
output = {
    'prompts': prompts,
    'cohort_prompt_mapping': all_mappings,
    'summary': {
        'total_prompts': len(prompts),
        'total_mappings': len(all_mappings),
        'live_prompts': sum(1 for p in prompts if p['isLive']),
        'agents_covered': sorted(set(p['agent'] for p in prompts)),
        'prompt_ids_in_mapping': sorted(set(m['prompt_id'] for m in all_mappings)),
    },
}

out_path = os.path.join(OUT_DIR, 'prompts_data.json')
with open(out_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f"\nOutput: {out_path}")
print(f"  {len(prompts)} prompts, {len(all_mappings)} cohort mappings")
print("Done!")
