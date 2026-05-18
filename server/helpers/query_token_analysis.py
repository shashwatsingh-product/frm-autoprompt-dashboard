import json, os, glob, sys

PROMPT_BASE = os.path.join(os.path.dirname(__file__), '../../..',
    'claude-project/Documents/CY2026/prompts/prompts')
PROMPT_BASE = os.path.abspath(PROMPT_BASE)

# Fallback: try relative to home
if not os.path.exists(PROMPT_BASE):
    PROMPT_BASE = os.path.expanduser(
        '~/claude-project/Documents/CY2026/prompts/prompts')

AGENT_TYPES = ['match', 'mismatch', 'damage', 'missing']

AGENT_COLORS = {
    'match':    'emerald',
    'mismatch': 'rose',
    'damage':   'amber',
    'missing':  'violet',
}

def count_tokens_approx(text):
    return len(text) // 4

def parse_prompt_meta(fname, agent_type):
    base = os.path.basename(fname).replace('.txt', '')
    if base == 'default':
        return {'vertical': 'default', 'sub_type': None}

    # match/mismatch: {vertical}_{date}
    if agent_type in ('match', 'mismatch'):
        parts = base.rsplit('_', 3)  # remove date suffix YYYY_MM_DD_HH_MM
        # filename like sari_2026_05_11_20_02 → vertical = sari
        # find the date prefix
        tokens = base.split('_')
        # find where the year starts
        year_idx = next((i for i, t in enumerate(tokens) if t.startswith('202')), len(tokens))
        vertical = '_'.join(tokens[:year_idx])
        return {'vertical': vertical, 'sub_type': None}

    # damage: {vertical}_{sub_type}_damage
    if agent_type == 'damage':
        # order matters: non_functional_damage before functional_damage
        for sub in ['non_functional_damage', 'functional_damage', 'no_damage']:
            suffix = f'_{sub}_damage'
            if base.endswith(suffix):
                vertical = base[:-len(suffix)]
                return {'vertical': vertical, 'sub_type': sub}
        return {'vertical': base, 'sub_type': None}

    # missing: {vertical}_{sub_type}_missing
    if agent_type == 'missing':
        for sub in ['missing_essential_part', 'missing_supplementary_item', 'product_complete']:
            suffix = f'_{sub}_missing'
            if base.endswith(suffix):
                vertical = base[:-len(suffix)]
                return {'vertical': vertical, 'sub_type': sub}
        return {'vertical': base, 'sub_type': None}

def action_prompts():
    result = []
    for agent_type in AGENT_TYPES:
        folder = os.path.join(PROMPT_BASE, agent_type)
        files = sorted([
            f for f in glob.glob(os.path.join(folder, '*.txt'))
            if '.ipynb_checkpoints' not in f
        ])
        for fpath in files:
            with open(fpath) as f:
                text = f.read()
            meta = parse_prompt_meta(fpath, agent_type)
            tokens = count_tokens_approx(text)
            result.append({
                'agent_type':  agent_type,
                'vertical':    meta['vertical'],
                'sub_type':    meta['sub_type'],
                'filename':    os.path.basename(fpath),
                'prompt_tokens': tokens,
                'char_count':  len(text),
                'color':       AGENT_COLORS[agent_type],
            })
    return result

def action_summary():
    prompts = action_prompts()

    by_agent = {}
    for p in prompts:
        a = p['agent_type']
        if a not in by_agent:
            by_agent[a] = []
        by_agent[a].append(p['prompt_tokens'])

    agent_stats = []
    for agent_type in AGENT_TYPES:
        tokens = by_agent.get(agent_type, [])
        if not tokens:
            continue
        agent_stats.append({
            'agent_type': agent_type,
            'count':      len(tokens),
            'min':        min(tokens),
            'max':        max(tokens),
            'avg':        round(sum(tokens) / len(tokens)),
            'total':      sum(tokens),
            'color':      AGENT_COLORS[agent_type],
        })

    return {
        'agent_stats': agent_stats,
        'prompts':     prompts,
        'total_prompts': len(prompts),
    }

if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'summary'
    if action == 'summary':
        print(json.dumps(action_summary()))
    elif action == 'prompts':
        print(json.dumps(action_prompts()))
