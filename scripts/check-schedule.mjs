import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

process.loadEnvFile('.env.local');
const page = ts.createSourceFile('page.tsx', fs.readFileSync('app/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const values = {};
for (const statement of page.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (['initialTasks', 'initialWorkforce', 'previewWeatherSlots'].includes(declaration.name.getText(page))) {
      values[declaration.name.getText(page)] = vm.runInNewContext(`(${declaration.initializer.getText(page)})`);
    }
  }
}
const nativeFetch = globalThis.fetch;
const weather = await (await nativeFetch('http://localhost:3000/api/weather/tomorrow')).json();
if (!weather.slots?.length) throw new Error('Actual forecast unavailable');
let calls = 0;
globalThis.fetch = async (...args) => {
  calls++;
  const response = await nativeFetch(...args);
  const data = await response.clone().json();
  const text = data.output?.flatMap((message) => message.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (text) {
    const result = JSON.parse(text);
    const items = Array.isArray(result.items) ? result.items : Object.values(result.items);
    console.log('AI structural output:', JSON.stringify(items.map(({taskId,startTime,endTime,riskScore}) => ({taskId,startTime,endTime,riskScore}))));
    console.log('Allowed starts:', weather.slots.map((slot) => slot.time));
  }
  return response;
};
const source = fs.readFileSync('app/api/schedule/recommend/route.ts', 'utf8').replace("import { NextResponse } from 'next/server';", 'const NextResponse = Response;');
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { POST } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const response = await POST(new Request('http://localhost/api/schedule/recommend', {method:'POST',body:JSON.stringify({tasks:values.initialTasks,workers:values.initialWorkforce,totalCrew:12,weatherSlots:weather.slots})}));
const result = await response.json();
console.log('Result:', response.status, 'Tasks:', result.items?.length, 'Calls:', calls, 'Error:', result.message ?? 'none');
if (!response.ok) process.exitCode = 1;
