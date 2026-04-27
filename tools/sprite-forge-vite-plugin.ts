import { Plugin } from 'vite';
import { cp } from 'fs/promises';
import { join } from 'path';

export const spriteForgePlugin = (): Plugin => {
  return {
    name: 'sprite-forge-copy',
    configureServer() {
      const sourceDir = join(process.cwd(), 'tools', 'sprite-forge', 'out');
      const destDir = join(process.cwd(), 'public', 'sprites');
      
      (async () => {
        try {
          await cp(sourceDir, destDir, { recursive: true, force: true });
          console.log('Copied sprite-forge output to public/sprites/');
        } catch (error) {
          console.error('Failed to copy sprite-forge output:', error);
        }
      })();
    },
  };
};