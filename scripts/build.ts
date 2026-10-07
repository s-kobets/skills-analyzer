import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['bin/skills-analyzer.js'],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist/skills-analyzer.js',
  banner: { js: '#!/usr/bin/env node' },
  external: [],
});

console.log('Built dist/skills-analyzer.js');
