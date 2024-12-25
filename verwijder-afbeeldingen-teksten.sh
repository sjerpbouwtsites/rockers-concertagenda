cd ~/hosted/rockagenda/public
find ./event-images -name "*.jpg" -type f | xargs rm -f
find ./event-images -name "*.png" -type f | xargs rm -f
find ./event-images -name "*.webp" -type f | xargs rm -f
find ./texts -name "*.html" -type f | xargs rm -f
