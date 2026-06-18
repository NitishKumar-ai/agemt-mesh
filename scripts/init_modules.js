const fs = require('fs');
const path = require('path');

const dirs = [
  'common',
  'common-persistence',
  'core',
  'rest',
  'ai',
  'server-lite',
  'server',
  'cassandra-persistence',
  'es7-persistence',
  'es8-persistence',
  'mysql-persistence',
  'os-persistence-v2',
  'os-persistence-v3',
  'postgres-persistence',
  'redis-persistence',
  'sqlite-persistence',
  'redis-api',
  'redis-concurrency-limit',
  'redis-configuration',
  'redis-lock',
  'http-task',
  'json-jq-task',
  'kafka',
  'kafka-event-queue',
  'nats',
  'awss3-storage',
  'azureblob-storage',
  'gcs-storage',
  'local-file-storage',
  'postgres-external-storage',
  'workflow-event-listener',
  'task-status-listener',
  'scheduler',
  'annotations',
  'annotations-processor',
  'amqp',
];

dirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    const pkg = {
      name: `@agentmesh/${dir}`,
      version: '0.0.0',
      private: true,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        lint: 'eslint src/',
        test: 'vitest run',
      },
    };
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    }

    const tsconfig = {
      extends: '../tsconfig.base.json',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src/main/typescript',
      },
      include: ['src/main/typescript/**/*', 'src/test/typescript/**/*'],
      exclude: ['node_modules', 'dist'],
    };
    // overwrite existing tsconfig.json in `ai` folder as well, since it just has some empty template probably
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // Create basic file structure so TS doesn't complain about no inputs
    const srcDir = path.join(dir, 'src', 'main', 'typescript');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }
    if (!fs.existsSync(path.join(srcDir, 'index.ts'))) {
      fs.writeFileSync(path.join(srcDir, 'index.ts'), `export const name = '${dir}';\n`);
    }
  }
});
