'use client';

import { FormEvent, useRef, useState } from 'react';
import { createScheduleEmail, type EmailWork } from '../lib/schedule-email';

export function ScheduleEmail({ date, works, disabled }: { date: string; works: EmailWork[]; disabled: boolean }) {
  const [recipient, setRecipient] = useState('');
  const { subject, body } = createScheduleEmail(date, works);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const attempt = useRef<{ content: string; key: string } | null>(null);
  const stale = preview && (preview.subject !== subject || preview.body !== body);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || stale || sending || disabled) return;
    setSending(true);
    setMessage('');
    const content = JSON.stringify({ to: recipient.trim(), date, works });
    if (attempt.current?.content !== content) {
      attempt.current = { content, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch('/api/schedule/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key },
        body: content,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '이메일 발송 요청에 실패했습니다.');
      setMessage('이메일 발송이 접수되었습니다. 수신함과 스팸함을 확인해주세요.');
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이메일 발송 요청에 실패했습니다.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="schedule-email" aria-label="작업 일정 이메일 전달">
      <h3>작업 일정 이메일 전달</h3>
      <p>AI가 분석한 일정과 배치 근거를 확인하고 전달하세요.</p>
      <button type="button" disabled={disabled || sending} onClick={() => { setPreview({ subject, body }); setMessage(''); }}>이메일 미리보기</button>
      {disabled && <p>내일 작업 일정을 먼저 생성해주세요. 실제 기상 예보가 필요합니다.</p>}
      {preview && (
        <form onSubmit={send}>
          <label>받는 사람 이메일<input type="email" required maxLength={254} value={recipient} disabled={sending} onChange={(event) => setRecipient(event.target.value)} placeholder="받는 사람 이메일 주소" /></label>
          <small>연결된 네이버 메일 계정으로 작업 일정을 전달합니다.</small>
          <h4>{preview.subject}</h4>
          <pre>{preview.body}</pre>
          {stale && <p role="alert">일정이 변경되었습니다. 미리보기를 다시 열어주세요.</p>}
          <button type="submit" disabled={sending || disabled || Boolean(stale)}>{sending ? '발송 요청 중…' : '이 내용으로 이메일 보내기'}</button>
          <button type="button" disabled={sending} onClick={() => setPreview(null)}>닫기</button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
