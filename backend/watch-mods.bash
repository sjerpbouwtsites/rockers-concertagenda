#!/bin/sh
inotifywait -e modify -e create mods --format "%f" | while read file; 
do eslint --quiet --fix "/var/www/html/concertagenda/backend/mods/${file}"; 
prettier --config .prettierrc "/var/www/html/concertagenda/backend/mods/${file}" --write; 
done;
bash './watch-mods.bash';