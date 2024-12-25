#!/bin/sh
inotifywait -e modify -e create scrapers --format "%f" | while read file; do
    eslint --quiet --fix "/var/www/html/rockagenda/backend/scrapers/${file}"
    prettier --config .prettierrc "/var/www/html/rockagenda/backend/scrapers/${file}" --write
done
bash './watch-scrapers.bash'
