#!/bin/sh
inotifywait -e modify -e create scrapers/gedeeld --format "%f" | while read file; do
    eslint --quiet --fix "/var/www/html/rockagenda/backend/scrapers/gedeeld/${file}"
    prettier --config .prettierrc "/var/www/html/rockagenda/backend/scrapers/gedeeld/${file}" --write
done
bash './watch-scrapers-gedeeld.bash'
