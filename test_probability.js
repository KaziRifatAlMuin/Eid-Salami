#!/usr/bin/env node

// Test script to verify probability distribution across 1000 spins

const values = [35, 10, 80, 25, 60, 12, 70, 17, 100, 27, 45, 20, 50, 30, 40, 23, 90, 15];

const cdfTargets = [
  { max: 15, p: 0.90 },
  { max: 20, p: 0.99 },
  { max: 25, p: 0.999 },
  { max: 30, p: 0.9999 },
  { max: 35, p: 0.99999 },
  { max: 40, p: 0.999999 },
  { max: 50, p: 0.9999999 },
  { max: 60, p: 0.99999999 },
  { max: 70, p: 0.999999999 },
  { max: 80, p: 0.9999999999 },
  { max: 90, p: 0.99999999999 },
  { max: 100, p: 1 },
];

function buildWeightsFromCdf(valuesList, cdfPoints) {
  const weights = new Array(valuesList.length).fill(0);
  let prevP = 0;
  let prevMax = -Infinity;

  for (const point of cdfPoints) {
    const bucketProb = Math.max(0, Math.min(1, point.p) - prevP);
    const bucketIdx = [];
    for (let i = 0; i < valuesList.length; i++) {
      const v = valuesList[i];
      if (v > prevMax && v <= point.max) bucketIdx.push(i);
    }

    if (bucketIdx.length > 0 && bucketProb > 0) {
      const each = bucketProb / bucketIdx.length;
      for (const i of bucketIdx) weights[i] += each;
    }

    prevP = Math.max(prevP, Math.min(1, point.p));
    prevMax = point.max;
  }

  // Normalize (floating-point safety)
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return weights.map(() => 1 / weights.length);
  }
  return weights.map((w) => w / total);
}

function pickWeighted(valuesList, weightsList) {
  const total = weightsList.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weightsList.length; i++) {
    r -= weightsList[i];
    if (r <= 0) return { index: i, value: valuesList[i] };
  }
  return { index: valuesList.length - 1, value: valuesList[valuesList.length - 1] };
}

const weights = buildWeightsFromCdf(values, cdfTargets);

console.log('=== Probability Distribution Test (1000 Spins) ===\n');
console.log('Weights per value:');
values.forEach((v, i) => {
  console.log(`  ৳${v}: ${(weights[i] * 100).toFixed(4)}%`);
});
console.log();

// Run 1000 spins
const numSpins = 1000;
const results = {};
values.forEach(v => (results[v] = 0));

for (let i = 0; i < numSpins; i++) {
  const picked = pickWeighted(values, weights);
  results[picked.value]++;
}

console.log(`\n=== Results from ${numSpins} Spins ===\n`);

// Sort by value for display
const sortedValues = [...values].sort((a, b) => a - b);
const uniqueValues = [...new Set(sortedValues)];

console.log('Value | Count | Actual % | Expected %');
console.log('------|-------|----------|----------');

uniqueValues.forEach(v => {
  const count = results[v];
  const actualPct = (count / numSpins) * 100;
  const expectedPct = weights[values.indexOf(v)] * 100;
  console.log(`  ${v.toString().padStart(3)} |   ${count.toString().padStart(2)} |  ${actualPct.toFixed(2)}%   |  ${expectedPct.toFixed(2)}%`);
});

// Verify CDF compliance
console.log('\n=== Cumulative Distribution Verification ===\n');
let cumulativeCount = 0;
let cumulativeProb = 0;

console.log('Max Value | Expected CDF | Actual Count | Actual CDF');
console.log('----------|--------------|--------------|----------');

cdfTargets.forEach(target => {
  const valuesUpTo = values.filter(v => v <= target.max);
  const expectedCdf = target.p;
  
  // Recalculate cumulative count
  let countUpTo = 0;
  valuesUpTo.forEach(v => {
    countUpTo += results[v] || 0;
  });
  
  const actualCdf = countUpTo / numSpins;
  const diff = Math.abs(actualCdf - expectedCdf);
  
  const status = diff < 0.02 ? '✓' : '✗';
  console.log(`    ${target.max.toString().padStart(2)}   |    ${(expectedCdf * 100).toFixed(2)}%     |     ${countUpTo.toString().padStart(3)}      |   ${(actualCdf * 100).toFixed(2)}%   ${status}`);
});

console.log('\n=== Summary ===');
console.log(`Total spins: ${numSpins}`);
console.log(`Values tested: ${uniqueValues.join(', ')}`);
console.log('\n✓ Test complete. CDF distribution should show ✓ marks.');
