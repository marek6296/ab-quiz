import { build } from 'vite';

build({
  logLevel: 'info',
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') {
          console.warn('CIRCULAR DEPENDENCY:', warning.message);
        } else {
          warn(warning);
        }
      }
    }
  }
}).then(() => console.log('done')).catch(e => console.error(e));
