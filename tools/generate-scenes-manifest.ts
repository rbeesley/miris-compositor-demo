// tools/generate-scenes-manifest.ts

import fs from 'node:fs';
import path from 'node:path';

const scenesDir = path.join(process.cwd(), 'public', 'scenes');
const manifestPath = path.join(scenesDir, 'manifest.json');

function generateManifest() {
    if (!fs.existsSync(scenesDir)) {
        console.error(`Scenes directory not found: ${scenesDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(scenesDir).filter((f: string) => f.endsWith('.json') && f !== 'manifest.json');
    const scenes = files.map((file: string) => {
        const filePath = path.join(scenesDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const id = (content.id as string) || file.replace('.json', '');
        const label = (content.label as string) || id;
        return { id, label, file };
    });

    fs.writeFileSync(manifestPath, JSON.stringify(scenes, null, 2));
    console.log(`Generated manifest with ${scenes.length} scenes at ${manifestPath}`);
}

generateManifest();
