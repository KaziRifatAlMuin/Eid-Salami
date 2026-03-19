#!/usr/bin/env node

const values = [35, 10, 80, 25, 60, 12, 70, 17, 100, 27, 45, 20, 50, 30, 40, 23, 90, 15];
const counts = {};
values.forEach(v=>counts[v]=0);
const N=10000;
for(let i=0;i<N;i++){
  const idx = Math.floor(Math.random()*values.length);
  counts[values[idx]]++;
}
console.log(`Uniform pick test (${N} samples):`);
values.forEach(v=>{
  console.log(`${v}: ${counts[v]} (${((counts[v]/N)*100).toFixed(2)}%)`);
});
