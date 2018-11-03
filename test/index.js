const request = require('request-promise');

const url = (path) => `${process.env.ROOT}${path}`;

async function runTests() {
  console.log('starting tests...');
  const result1 = await request(url('/spotify.com'));
  const result2 = await request(url('/spotify.com'));
  console.log('assert true', result1 == result2);
  console.log('finished tests!');
}

runTests();
