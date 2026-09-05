import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('app/api/schedule/email/route.ts', 'utf8')
  .replace("import nodemailer from 'nodemailer';", 'const nodemailer = globalThis.mockMailer;')
  .replace("import { createScheduleEmail, type EmailWork } from '../../../lib/schedule-email';", 'const createScheduleEmail = globalThis.createScheduleEmail;');
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
process.env.NAVER_EMAIL = 'sender@naver.com';
process.env.NAVER_APP_PASSWORD = 'test-only';
process.env.NODE_ENV = 'production';
let calls = 0;
let fail;
globalThis.mockMailer = {createTransport(options) {
  assert.equal(options.host,'smtp.naver.com');
  assert.equal(options.port,587);
  assert.equal(options.secure,false);
  assert.equal(options.requireTLS,true);
  return {async sendMail(mail) {
    calls++;
    assert.equal(mail.from.address,'sender@naver.com');
    assert.equal(mail.to[0].address,'recipient@gmail.com');
    assert.match(mail.subject,/2026년 9월 6일 작업 일정/);
    assert.match(mail.text,/배관 점검/);
    if (fail) throw fail;
    return {accepted:['recipient@gmail.com'],messageId:'mock-message'};
  }};
}};
globalThis.createScheduleEmail = (date, works) => ({subject:`[여수 사업장] ${date} 작업 일정(안) 공유`,body:`${works[0].task.name} 일정`});
const {POST} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const work = {task:{name:'배관 점검',target:'A구역',location:'outside',requiredCrew:1,detail:'배관 상태 확인'},slot:{time:'09:00',feelsLike:25,rain:0,wind:2},endTime:'10:00',decision:'진행',assignedWorkers:[{name:'김작업'}]};
const input = {to:'recipient@gmail.com',date:'2026년 9월 6일',works:[work]};
const request = (body = input, key = '12345678-1234-1234-1234-123456789012', origin = 'https://schedule.example.org') => new Request('https://schedule.example.org/api/schedule/email', {method:'POST',headers:{origin,'idempotency-key':key},body:JSON.stringify(body)});
try {
  assert.equal((await POST(request(input,undefined,'https://other.example.org'))).status,403);
  assert.equal((await POST(request({...input,to:'bad\r\nBcc: other@example.org'}))).status,400);
  assert.equal(calls,0);
  assert.equal((await POST(request())).status,200);
  assert.equal((await POST(request())).status,200);
  assert.equal(calls,1);
  assert.equal((await POST(request({...input,date:'2026년 9월 7일'}))).status,409);
  const another = '22345678-1234-1234-1234-123456789012';
  assert.equal((await POST(request(input,another))).status,429);
  now += 11000;
  fail = {code:'EAUTH'};
  assert.match((await (await POST(request(input,another))).json()).message,/인증에 실패/);
  now += 11000;
  fail = undefined;
  assert.equal((await POST(request(input,another))).status,200);
  now += 11000;
  fail = {code:'ETIMEDOUT'};
  const uncertain = '32345678-1234-1234-1234-123456789012';
  assert.equal((await POST(request(input,uncertain))).status,502);
  const before = calls;
  now += 11000;
  assert.equal((await POST(request(input,uncertain))).status,502);
  assert.equal(calls,before);
  delete process.env.NAVER_APP_PASSWORD;
  assert.equal((await POST(request())).status,503);
  console.log('PASS: SMTP config, Unicode content, anonymous production send, validation, deduplication, rate limit, auth retry, uncertain delivery hold, missing config. No real email sent.');
} finally {
  Date.now = realNow;
  delete globalThis.mockMailer;
  delete globalThis.createScheduleEmail;
}
