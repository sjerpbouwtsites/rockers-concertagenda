import fs from 'fs';

function sorteerStoreOpLengteVanKeys() {
  const storeFiles = ['allowed-artists.json', 'allowed-events.json', 'refused.json', 'unclear-artists.json'];
  storeFiles.forEach((store) => {
    const file = JSON.parse(fs.readdirSync(`../store/${store}`));
    const fileKeys = Object.keys(file);
    const sortedKeys = fileKeys.sort((a, b) => {
      if (a.length > b.length) return -1;
      if (b.length > a.length) return 1;
      return 0;
    });
    const nieuweFile = sortedKeys.forEach((key) => {
      nieuweFile[key] = file[key];
    });
    fs.writeFileSync(`../store/${store}`, JSON.stringify(nieuweFile, null, 2), 'utf-8');
  });
}

sorteerStoreOpLengteVanKeys();
