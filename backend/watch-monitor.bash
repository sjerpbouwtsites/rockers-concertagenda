#!/bin/sh
inotifywait -r -e modify -e create monitor --format "%f" | while read file; 
do eslint --quiet --fix "/var/www/html/concertagenda/backend/monitor/${file}"; 
prettier --config .prettierrc "/var/www/html/concertagenda/backend/monitor/${file}" --write; 
done;
bash './watch-monitor.bash';