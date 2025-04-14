cd /home/sjerp/hosted/rockagenda/backend
killall -s 9 chrome
clear
node index.js workers=3 \
    removePublicEventImages=013 \
    removeSinglePageCache=false \
    removeLongTextFiles=all \
    artistDBWrite=false \
    noLocPrint=true \
    debugLongHTML=false

# removeTextFiles = false || all || 013%paradiso
# removePublicEventImages = false || all || 013%paradiso
# debugLongHTML=false || all || 013%paradiso
# removeBaseEvents=false || all || 013%paradiso
# removeSinglePageCache=false || all || 013%paradiso
# prettier --write "../public/texts/**/*.html"
