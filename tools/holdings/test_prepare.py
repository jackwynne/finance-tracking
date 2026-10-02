import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from prepare import canonical, hostplus_rows, ishares_rows, pdf_top_rows, top_weights, vanguard_rows


class ProviderHoldingsTests(unittest.TestCase):
    def test_share_classes_merge_before_ranking_without_normalization(self):
        rows = [('alphabet', 'Alphabet', Decimal('.04')),
                ('other', 'Other', Decimal('.07')),
                ('alphabet', 'Alphabet', Decimal('.04'))]
        self.assertEqual(top_weights(rows, Decimal('.9989'), 1), [
            {'issuerId': 'alphabet', 'label': 'Alphabet', 'weight': '0.079912'}])

    def test_identical_us_security_matches_hostplus_isin_and_vanguard_cusip(self):
        self.assertEqual(canonical('MICROSOFT', isin='US5949181045'),
                         canonical('Microsoft Corp', cusip='594918104'))
        self.assertEqual(canonical('Unmapped company', isin='US1234567890')[0],
                         canonical('Different spelling', cusip='123456789')[0])

    def test_actual_cross_provider_identifiers_merge(self):
        pairs = [
            ({'sedol': '6215035'}, {'isin': 'AU000000CBA7'}),
            ({'sedol': '6889106'}, {'isin': 'TW0002330008'}),
            ({'cusip': 'N07059202'}, {'isin': 'NL0010273215'}),
            ({'cusip': 'H57312649'}, {'isin': 'CH0038863350'}),
            ({'cusip': 'Y74718100'}, {'isin': 'KR7005930003'}),
            ({'sedol': '6773812'}, {'isin': 'KR7005931001'}),
            ({'cusip': '761152107'}, {'isin': 'AU000000RMD6'}),
            ({'sedol': 'BTMJD19'}, {'isin': 'CH1499059983'}),
            ({'cusip': '30233Q108'}, {'isin': 'US30231G1022'}),
        ]
        for vanguard, hostplus in pairs:
            self.assertEqual(canonical('Provider name', **vanguard),
                             canonical('Another name', **hostplus))

    def test_unmapped_share_classes_remain_separate(self):
        self.assertNotEqual(canonical('Example Inc', cusip='123456789')[0],
                            canonical('Example Inc', cusip='123456780')[0])

    def test_vanguard_unreported_weights_are_not_zero_holdings(self):
        source = {'latestEffectiveDate': '2026-08-31', '2026-08-31': {'equity': [
            {'holdingName': 'NVIDIA Corp', 'cusip': '67066G104', 'sedol': '',
             'ticker': 'NVDA', 'percentOfFunds': 13.60937},
            {'holdingName': 'Tiny holding', 'cusip': '123456789', 'sedol': '',
             'ticker': 'TINY', 'percentOfFunds': ''}]}}
        date, rows = vanguard_rows(source)
        self.assertEqual(date, '2026-08-31')
        self.assertEqual(rows, [('nvidia', 'NVIDIA', Decimal('.1360937'))])

    def test_ishares_omits_cash_and_preserves_gross_wrapper_weight(self):
        source = [['All'], ['as of', '30/Sept/2026'], ['headers'],
                  ['NVDA', 'NVIDIA', 'IT', 'Equity', '', '21.08'],
                  ['USD', 'USD cash', 'Cash', 'Cash', '', '.16']]
        _, rows = ishares_rows(source)
        self.assertEqual(top_weights(rows, Decimal('1.0622'))[0]['weight'], '0.22391176')
        with self.assertRaises(ValueError):
            ishares_rows([['All'], ['as of', '01/Oct/2026']])

    def test_hostplus_ignores_cash_derivatives_and_totals(self):
        text = '\n'.join(['Cash,,,,', 'Bank,AUD,,,2.00%', 'Listed Equity,,,,',
                          'MICROSOFT,US5949181045,,,1.69%',
                          'ISHARES MSCI INDIA ETF,US46429B5984,,,1.00%', 'Total Listed Equity,,,,',
                          'Derivatives,,,,', 'NVIDIA,US67066G1040,,,2.96%'])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'provider.csv'
            path.write_text(text)
            self.assertEqual(hostplus_rows(path), [('microsoft', 'Microsoft', Decimal('.0169'))])

    def test_simplicity_unlisted_property_is_not_stock(self):
        text = '\fTop 10 investments\nSimplicity Living  6.59%  Unlisted property NZ\n'
        for index in range(9):
            text += f'Listed {index}  1.00%  International equities US\n'
        text += 'The top ten investments'
        self.assertEqual(len(pdf_top_rows(text, simplicity=True)), 9)


if __name__ == '__main__':
    unittest.main()
