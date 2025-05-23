cd /home/sjerp/hosted/rockagenda/backend
killall -s 9 chrome
clear
node index.js \
    workers=3 \
    removeBaseEvents=false \
    removePublicEventImages=false \
    removeLongTextFiles=false \
    removeSinglePageCache=false \
    scraperEventsLongTextDebug=false \
    artistDBWrite=true \
    noLocPrint=true \
    debugLongHTML=false

# removeTextFiles = false || all || 013%paradiso
# removePublicEventImages = false || all || 013%paradiso
# debugLongHTML=false || all || 013%paradiso
# removeBaseEvents=false || all || 013%paradiso
# removeSinglePageCache=false || all || 013%paradiso
# prettier --write "../public/texts/**/*.html"
