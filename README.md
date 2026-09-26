# ruko-site

Public pages for the Ruko Android app, served by GitHub Pages from `main`:

- `index.html`: privacy policy, https://harsh-m-10.github.io/ruko-site/
- `terms.html`: terms of use
- `shops.html`: for shops (what Ruko reads, how to ask for exclusion)
- `shops.json`: the remote shop switch. Ruko fetches it at most once a day and skips every shop listed in
  `disabled` (Ruko's retailer ids, e.g. `"croma"`). Keep the format exactly:
  `{"version":1,"disabled":[],"updated":"YYYY-MM-DD"}`. A malformed file is ignored by the app.
