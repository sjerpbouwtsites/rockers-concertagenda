cd /home/sjerp/hosted/rockagenda/backend
killall -s 9 chrome
clear
node index.js workers=2 \
    force=all \
    keepImages=true \
    keepBaseEvents=true \
    artistDBWrite=true \
    ;
# prettier --write "../public/texts/**/*.html"
