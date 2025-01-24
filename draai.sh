cd /home/sjerp/hosted/rockagenda/backend
killall -s 9 chrome
clear
node index.js workers=3 \
    keepImages=true \
    keepBaseEvents=true \
    artistDBWrite=false \
    ;
prettier --write "../public/texts/**/*.html"
