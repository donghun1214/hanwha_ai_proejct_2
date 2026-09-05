'use client';

import { useState } from 'react';
import { createScheduleEmail, type EmailWork } from '../lib/schedule-email';

export function ScheduleEmail({ date, works, disabled }: { date: string; works: EmailWork[]; disabled: boolean }) {
  const [recipient, setRecipient] = useState('');
  const { subject, body } = createScheduleEmail(date, works);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const stale = preview && (preview.subject !== subject || preview.body !== body);

  return (
    <section className="schedule-email" aria-label="작업 일정 문자 전달">
      <h3>작업 일정 문자 전달</h3>
      <p>AI가 분석한 일정과 배치 근거를 확인하고 문자로 전달하세요.</p>
      <button type="button" disabled={disabled || sending} onClick={() => { setPreview({ subject, body }); setMessage(''); }}>문자 미리보기</button>
      {disabled && <p>내일 작업 일정을 먼저 생성해주세요. 실제 기상 예보가 필요합니다.</p>}
      {preview && (
        <form onSubmit={(event) => event.preventDefault()}>
          <label>받는 사람 전화번호<input type="tel" required maxLength={20} value={recipient} disabled={sending} onChange={(event) => setRecipient(event.target.value)} placeholder="받는 사람 전화번호" /></label>
          <h4>{preview.subject}</h4>
          <pre>{preview.body}</pre>
          {stale && <p role="alert">일정이 변경되었습니다. 미리보기를 다시 열어주세요.</p>}
          <div className="schedule-email-actions">
            <button type="submit" disabled>문자 발송 기능 준비 중</button>
            <small>SOLAPI 문자 발송은 발신번호 인증이 필요해 현재 연동을 보류 중입니다.</small>
          </div>
          <button type="button" disabled={sending} onClick={() => setPreview(null)}>닫기</button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
