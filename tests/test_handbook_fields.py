"""Evidence selection checks: missing translation != no prerequisites."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from handbook_fields import resolve_values, text_status


class HandbookFields(unittest.TestCase):
    def test_placeholder_does_not_hide_english_background(self):
        r = resolve_values({'value': '-', 'translations': {'de': '-', 'en': 'Foundations of Autonomous Vehicles [ED150017]'}})
        self.assertEqual((r['status'], r['default_status'], r['selected_language']), ('present', 'not_provided', 'en'))
        self.assertIn('ED150017', r['value'])

    def test_blank_english_does_not_erase_german_condition(self):
        r = resolve_values({'value': 'Vorher mit dem Betreuer besprechen.', 'translations': {'de': 'Vorher mit dem Betreuer besprechen.', 'en': '-'}})
        self.assertEqual((r['status'], r['selected_language']), ('present', 'de'))

    def test_missing_both_languages_stays_unknown(self):
        for placeholder in [None, '', '-', 'Not specified']:
            r = resolve_values({'value': placeholder, 'translations': {'de': placeholder, 'en': '-'}})
            self.assertIn(r['status'], ('blank', 'not_provided'))
        self.assertEqual(resolve_values(None)['status'], 'missing_field')

    def test_none_must_cover_the_whole_field(self):
        self.assertEqual(text_status('No prerequisites.'), 'explicit_none')
        self.assertEqual(text_status('None. Programming experience is essential.'), 'present')

    def test_both_substantive_versions_survive_for_semantic_review(self):
        values = {'value': 'Grundkenntnisse empfohlen.', 'translations': {'de': 'Grundkenntnisse empfohlen.', 'en': 'Calculus is required.'}}
        r = resolve_values(values)
        self.assertEqual(r['selected_language'], 'de')
        self.assertEqual(r['language_values'], values['translations'])
        self.assertNotIn('automatic_recommendation_eligible', r)


if __name__ == '__main__':
    unittest.main()
