# Preparing stock exposure

`prepare.py` creates seven dated stock allocation values for the existing reviewed-update pipeline. It reads saved public provider files and no personal holdings or balances. The caller attaches the current instrument revision from a fresh Koru export before uploading the proposal.

```sh
python3 tools/holdings/prepare.py \
  --sources /path/to/public-provider-downloads \
  --output /path/to/stock-allocations.json
python3 -m unittest discover -s tools/holdings -p 'test_*.py'
```

Required files are `vug-holdings.json`, `vgk-holdings.json`, `vt-holdings.json`, `iuit-product-data.xls`, `hostplus-holdings-2026-06.csv`, `MDZ-2026-Q2.txt` and `simplicity-2026-Q2.txt`. Extract the PDF tables with `pdftotext -layout` and inspect the published table when changing the dated source files.

`--refresh-vanguard` downloads the three official JSON tables from the public APIs used by Vanguard's advisor product pages. The script preserves the returned effective date. The other sources and Smart wrapper factors are deliberately pinned to the reviewed 2026 snapshots; refresh those together with their source dates and regression checks.

## Sources and calculation

| Holding                      | Source                                                                                                                                                                                     | Calculation                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| USG                          | [VUG holdings](https://advisors.vanguard.com/investments/products/api/funds/0967/holdings/latest)                                                                                          | Issuer weights × June 2026 Smart VUG wrapper weight 99.89%                  |
| EUF                          | [VGK holdings](https://advisors.vanguard.com/investments/products/api/funds/0963/holdings/latest)                                                                                          | Issuer weights × Smart VGK wrapper weight 99.92%                            |
| TWF                          | [VT holdings](https://advisors.vanguard.com/investments/products/api/funds/3141/holdings/latest)                                                                                           | Issuer weights × Smart VT wrapper weight 99.92%                             |
| UST                          | [iShares 280510](https://www.ishares.com/uk/individual/en/products/280510)                                                                                                                 | September 2026 equity weights × June 2026 Smart gross ETF weight 106.22%    |
| MDZ                          | [Smart June 2026 update](https://doc.smartinvest.co.nz/fund-updates/etf/nz-shares/2026/Q2/smart-exchange-traded-funds-fund-update-smart-nz-mid-cap-etf.pdf)                                | Published top ten investment weights, 56.01% of net assets                  |
| Simplicity High Growth       | [June 2026 KiwiSaver update](https://simplicity.kiwi/assets/Uploads/Simplicity-High-Growth-Fund-update-30-June-2026.pdf)                                                                   | Nine listed stocks in top ten table, 24.10% of net assets                   |
| Hostplus Indexed High Growth | [June 2026 holdings CSV](https://hostplus.com.au/content/dam/hostplus-program/site/resources/investments/investment-holdings/accumulation-investment-holdings/Indexed%20High%20Growth.csv) | Published listed-equity weights; cash, derivatives and pooled ETFs excluded |

The iShares download is an XML workbook despite its `.xls` extension. The parser reads the `Holdings` worksheet and validates its date. Obtain it from the provider's [product download endpoint](https://www.blackrock.com/varnish-api/uk-retail01-product-data/product-data/api/v1/get-fund-document?appSubType=ISHARES&appType=PRODUCT_PAGE&component=fundDownloadV2&locale=en_GB&portfolioId=280510&targetSite=ishares-uk&userType=individual).

Vanguard, iShares and Hostplus retain their reported weights, including rounding and omitted tiny positions. All output uses `complete: false`. Stocks are grouped before selecting the top 100. A missing constituent remains unattributed and is never rescaled into another stock. Smart wrapper and underlying fund dates differ; each allocation's evidence says this is a mixed-date estimate. UST reports gross stock exposure above 100%; its cash, currency hedges and liabilities are not stock exposure or additional net wealth.

Simplicity Living is unlisted property, so it is excluded from the stock list. Listed property companies remain listed stocks. Hostplus pooled ETF units are excluded because their companies require another underlying holdings source.

## Issuer identity

An identical security identifier groups the same security across providers. US ISINs contain their CUSIP. Other identifiers remain separate unless the explicit `ISSUERS` mapping joins them. Unmapped names are never merged by spelling similarity. The map includes verified provider-record pairs for the main cross-fund stocks and explicit share-class pairs such as Alphabet, Roche, Samsung and Berkshire Hathaway. Different underlying subsidiaries stay separate.

Vanguard US ticker records identify iShares securities where the exact ticker has a unique CUSIP; ambiguous ticker mappings fail. Issuer aliases include a corporate-action pair for ExxonMobil. The [NYSE notice filed with the SEC](https://www.sec.gov/Archives/edgar/data/34088/000087666126000593/ruleprovisionnotice.htm) explicitly links old CUSIP `30231G102` to new `30233Q108` after the July 2026 redomiciliation.

The tests verify actual cross-provider identifier pairs, share-class grouping before truncation, exact decimal wrapper weights, exclusion of cash and ETFs, and omission of unpublished weights. The map is intentionally incomplete. New issuer aliases need source evidence and a pair regression check.
