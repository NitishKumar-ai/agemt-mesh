import { scalekit } from './packages/core/src/scalekit-client';

async function test() {
  console.log(Object.keys(scalekit));
  console.log('connections:', Object.keys(scalekit.connection || scalekit.connections || {}));
}
test().catch(console.error);
