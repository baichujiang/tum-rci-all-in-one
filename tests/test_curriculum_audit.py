"""The ingestion distinctions that previously hid real modules are regression contracts."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parents[1] / 'scripts/audit_curriculum.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def row(node, label, kind, parents=(), credits='', handbook=()):
    return {'node_id': node, 'label': label, 'type': kind, 'ancestor_ids': list(parents),
            'ects_raw': credits, 'module_detail_ids': list(handbook), 'page': 1}


class CurriculumParsing(unittest.TestCase):
    def test_actual_modules_include_blank_credits_and_each_practice_option(self):
        rows = [row('1', 'Wahlmodule Computation', 'Regelknoten'),
                row('2', '[IN3150] A topic', 'Modulknoten', ['1'], handbook=['480835']),
                row('3', '[EXAM42] A seminar topic', 'Prüfungsknoten', ['1'], '5'),
                row('4', '[IN99585] Anerkennung aus dem Wahlbereich Computation', 'Modulknoten', ['1']),
                row('5', 'Pflichtmodul Praktikum', 'Regelknoten'),
                row('6', '[IN2106] Master-Praktikum', 'Pflichtfach [Modulknoten]', ['5'], '10', ['1248717']),
                row('7', '[MA8113] TUM Data Innovation Lab', 'Modulknoten', ['5'], '10', ['1332986'])]
        modules, excluded = audit.inventory(rows)
        self.assertEqual([m['module_code'] for m in modules], ['IN2106', 'IN3150', 'MA8113'])
        self.assertIsNone(modules[1]['ects'])
        self.assertEqual(modules[2]['groups'], ['E'])
        self.assertEqual([m['module_code'] for m in excluded], ['IN99585'])

    def test_deduplication_preserves_all_official_classifications(self):
        rows = [row('1', 'Wahlmodule Computation', 'Regelknoten'),
                row('2', 'Wahlmodule Systems and Control', 'Regelknoten'),
                row('3', '[IN2060] A module', 'Modulknoten', ['1'], '5', ['123']),
                row('4', '[IN2060] A module', 'Modulknoten', ['2'], '5', ['123'])]
        modules, _ = audit.inventory(rows)
        self.assertEqual(len(modules), 1)
        self.assertEqual(modules[0]['groups'], ['G', 'I'])
        rows[-1]['ects_raw'] = '6'
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            audit.inventory(rows)

    def test_response_year_and_page_are_verified_before_using_any_rows(self):
        html = ('Studienjahr 2026/27 Robotics, Cognition, Intelligence (20241, Masterstudium'
                '<select><option value="2" selected>2</option></select> von 14'
                '<tr class="coRow" id="kn1"><td><span class="KnotenText" title="SPO-Version">root</span></td>'
                '<td></td><td></td><td>120</td><td>1</td></tr>')
        self.assertEqual(audit.parse_page(html, 2)[0], 14)
        with self.assertRaisesRegex(ValueError, 'pagination'):
            audit.parse_page(html, 1)
        with self.assertRaisesRegex(ValueError, 'year'):
            audit.parse_page(html.replace('2026/27', '2025/26'), 2)


if __name__ == '__main__':
    unittest.main()
