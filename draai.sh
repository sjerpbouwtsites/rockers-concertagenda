cd /home/sjerp/dev/apache/concertagenda/backend;\
killall -s 9 chrome; clear;\
node index.js workers=3 \
keepImages=true \
DONTkeepBaseEvents=true \
force=all;