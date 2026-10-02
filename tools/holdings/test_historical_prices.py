import unittest
from historical_prices import monthly_prices, parse_announcements


class HistoricalPriceTests(unittest.TestCase):
    def test_uses_title_valuation_date_and_exact_price(self):
        rows = parse_announcements('USG', [
            {'id': 1, 'companyCode': 'USG', 'title': 'USG NTA 31-12-2025 $15.55718',
             'releaseDate': 1767560716}])
        self.assertEqual(rows[0]['date'], '2025-12-31')
        self.assertEqual(rows[0]['unitPrice'], '15.55718')
        self.assertEqual(rows[0]['currency'], 'NZD')

    def test_conflicting_announcements_are_omitted_with_audit(self):
        excluded = []
        rows = parse_announcements('USG', [
            {'id': 1, 'companyCode': 'USG', 'title': 'USG NTA 10-09-2019 $5.17552'},
            {'id': 2, 'companyCode': 'USG', 'title': 'USG NTA 10-09-2019 $5.14385'}], excluded)
        self.assertEqual(rows, [])
        self.assertEqual(excluded[0]['date'], '2019-09-10')
        self.assertEqual(len(excluded[0]['candidates']), 2)

    def test_monthly_keeps_actual_business_date_and_latest_partial_month(self):
        rows = [{'instrument': 'USG', 'date': date} for date in
                ['2026-09-01', '2026-09-30', '2026-10-01']]
        self.assertEqual([row['date'] for row in monthly_prices(rows)],
                         ['2026-09-30', '2026-10-01'])

    def test_rejects_another_fund_and_nonpositive_price(self):
        with self.assertRaises(ValueError):
            parse_announcements('USG', [{'id': 1, 'companyCode': 'USG',
                                       'title': 'EUF NTA 01-10-2026 $3.07061'}])
        with self.assertRaises(ValueError):
            parse_announcements('USG', [{'id': 1, 'companyCode': 'USG',
                                       'title': 'USG NTA 01-10-2026 $0.00000'}])


if __name__ == '__main__':
    unittest.main()
