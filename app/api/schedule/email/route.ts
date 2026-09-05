import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { createScheduleEmail, type EmailWork } from '../../../lib/schedule-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastRequest = 0;
// Short-lived single-process deduplication. SMTP has no provider idempotency key.
const attempts = new Map<string, { hash: string; expires: number; status: number; result: { id?: string; message?: string } }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isShortText(value: unknown, maximum = 300): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEmailWork(value: unknown): value is EmailWork {
  if (!isRecord(value) || !isRecord(value.task) || !isRecord(value.slot) || !Array.isArray(value.assignedWorkers)) return false;
  return isShortText(value.task.name)
    && isShortText(value.task.target)
    && (value.task.location === 'inside' || value.task.location === 'outside')
    && Number.isInteger(value.task.requiredCrew) && (value.task.requiredCrew as number) >= 0 && (value.task.requiredCrew as number) <= 100
    && isShortText(value.task.detail, 2000)
    && isShortText(value.slot.time, 20)
    && isFiniteNumber(value.slot.feelsLike)
    && isFiniteNumber(value.slot.rain)
    && isFiniteNumber(value.slot.wind)
    && isShortText(value.endTime, 20)
    && isShortText(value.decision, 30)
    && value.assignedWorkers.length <= 100
    && value.assignedWorkers.every((worker) => isRecord(worker) && isShortText(worker.name, 100));
}

export async function POST(request: Request) {
  // Allow anonymous visitors to send from this website in development and production.
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) {
    return Response.json({ message: '홈페이지에서 이메일 발송을 요청해주세요.' }, { status: 403 });
  }
  const user = process.env.NAVER_EMAIL?.trim();
  const password = process.env.NAVER_APP_PASSWORD;
  if (!user || !/^[a-zA-Z0-9._-]+@naver\.com$/i.test(user) || !password) {
    return Response.json({ message: '네이버 발송 계정 설정이 필요합니다. NAVER_EMAIL과 NAVER_APP_PASSWORD를 설정해주세요.' }, { status: 503 });
  }
  const raw = await request.text();
  if (raw.length > 40000) return Response.json({ message: '이메일 내용이 너무 깁니다.' }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch {
    return Response.json({ message: '올바른 이메일 요청이 아닙니다.' }, { status: 400 });
  }
  const idempotencyKey = request.headers.get('idempotency-key') || '';
  if (!isRecord(input) || typeof input.to !== 'string' || input.to.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to)
    || !isShortText(input.date, 80)
    || !Array.isArray(input.works) || !input.works.length || input.works.length > 100 || !input.works.every(isEmailWork)
    || !/^[a-f0-9-]{36}$/.test(idempotencyKey)) {
    return Response.json({ message: '수신 이메일과 작업 일정을 확인해주세요.' }, { status: 400 });
  }
  const { subject, body } = createScheduleEmail(input.date, input.works);
  for (const [key, attempt] of attempts) {
    if (attempt.expires < Date.now()) attempts.delete(key);
  }
  const hash = createHash('sha256').update(JSON.stringify([user, input.to, subject, body])).digest('hex');
  const previous = attempts.get(idempotencyKey);
  if (previous) {
    if (previous.hash !== hash) return Response.json({ message: '발송 내용이 변경되었습니다. 미리보기를 다시 열어주세요.' }, { status: 409 });
    return Response.json(previous.result, { status: previous.status });
  }
  if (Date.now() - lastRequest < 10000 || attempts.size >= 1000) {
    return Response.json({ message: '10초 후 다시 시도해주세요.' }, { status: 429 });
  }
  lastRequest = Date.now();
  const attempt = {
    hash,
    expires: Date.now() + 24 * 60 * 60 * 1000,
    status: 409,
    result: { message: '발송 처리 중입니다. 잠시 후 다시 확인해주세요.' } as { id?: string; message?: string },
  };
  attempts.set(idempotencyKey, attempt);
  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.naver.com',
      // STARTTLS on 587 is more reliable than implicit TLS on 465 in the
      // hosted runtime's outbound socket layer.
      port: 587,
      secure: false,
      requireTLS: true,
      family: 4,
      tls: { servername: 'smtp.naver.com' },
      auth: { user, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      from: { name: '한화시스템 김동훈 연구원', address: user },
      to: [{ address: input.to, name: '' }],
      subject,
      text: body,
    });
    if (!result.accepted.length) {
      attempts.delete(idempotencyKey);
      return Response.json({ message: '수신 주소가 거부되었습니다. 이메일 주소를 확인해주세요.' }, { status: 502 });
    }
    attempt.status = 200;
    attempt.result = { id: result.messageId };
    return Response.json(attempt.result);
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number };
    console.error('Schedule email SMTP failure', {
      code: failure.code || 'UNKNOWN',
      responseCode: failure.responseCode || null,
    });
    if (failure.code === 'EAUTH' || failure.code === 'EENVELOPE' || (failure.responseCode && failure.responseCode >= 400)) {
      attempts.delete(idempotencyKey);
      return Response.json({ message: failure.code === 'EAUTH'
        ? '네이버 인증에 실패했습니다. SMTP 사용 설정과 애플리케이션 비밀번호를 확인해주세요.'
        : '네이버 메일 서버가 발송을 거부했습니다. 수신 주소와 발송 제한 여부를 확인해주세요.' }, { status: 502 });
    }
    attempt.status = 502;
    attempt.result = { message: '발송 결과를 확인하지 못했습니다. 중복 방지를 위해 재발송을 보류했습니다. 수신 여부를 확인해주세요.' };
    return Response.json(attempt.result, { status: attempt.status });
  }
}
