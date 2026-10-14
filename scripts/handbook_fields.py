"""Resolve public handbook text without letting a placeholder hide a translation.

This selects evidence text, never recommendation eligibility. Meaningful DE/EN
versions must still be reviewed together for differences in requirements.
"""
import re


def norm(text):
    return re.sub(r'\s+', ' ', (text or '').replace('\\r\\n', '\n').replace('\xa0', ' ')).strip()


def text_status(text):
    cleaned = norm(text)
    if not cleaned:
        return 'blank'
    if cleaned.casefold() in {'-', '--', '–', '—', 'not specified', 'nicht angegeben'}:
        return 'not_provided'
    if re.fullmatch(r'(keine\.?|keine voraussetzungen\.?|none\.?|no prerequisites\.?|no prior knowledge required\.?|there are no prerequisites\.?|es werden keine inhaltlichen voraussetzungen benötigt\.?)', cleaned, re.I):
        return 'explicit_none'
    return 'present'


def resolve_values(values):
    if values is None:
        return {'status': 'missing_field', 'value': None, 'selected_language': None,
                'default_status': 'missing_field', 'language_values': {}}
    default = values.get('value')
    translations = values.get('translations') or {}
    candidates = [('default', default), ('de', translations.get('de')), ('en', translations.get('en'))]
    selected = next(((lang, text) for lang, text in candidates
                     if text_status(text) in {'present', 'explicit_none'}), candidates[0])
    lang, text = selected
    # Label the default's actual language when the API supplies an identical translation.
    if lang == 'default':
        lang = next((key for key in ('de', 'en')
                     if norm(text) and norm(translations.get(key)) == norm(text)), 'default')
    return {'status': text_status(text), 'value': text, 'selected_language': lang,
            'default_status': text_status(default),
            'language_values': {key: translations.get(key) for key in ('de', 'en')}}
