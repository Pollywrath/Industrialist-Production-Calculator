import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const iconsDir = path.join(process.cwd(), 'public', 'icons');

async function convertAll() {
  const files = fs.readdirSync(iconsDir);
  let count = 0;

  for (const file of files) {
    if (file.endsWith('.png')) {
      const pngPath = path.join(iconsDir, file);
      const webpPath = path.join(iconsDir, file.replace('.png', '.webp'));

      try {
        await sharp(pngPath)
          .webp({ quality: 80, effort: 6 }) // High compression effort
          .toFile(webpPath);
        
        // Delete original png to save space
        fs.unlinkSync(pngPath);
        count++;
        console.log(`Converted: ${file} -> ${path.basename(webpPath)}`);
      } catch (err) {
        console.error(`Error converting ${file}:`, err);
      }
    }
  }

  console.log(`\nSuccessfully converted ${count} images to WebP!`);
}

convertAll().catch(console.error);
