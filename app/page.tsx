'use client';

import { FormEvent, useMemo, useState } from 'react';

type LocationType = 'outside' | 'inside';
type Decision = '진행' | '주의' | '내부 우선' | '중단 검토';

type Task = {
  id: number;
  name: string;
  target: string;
  location: LocationType;
  duration: number;
  requiredCrew: number;
  priority: number;
  detail: string;
};

type WeatherSlot = {
  time: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  rain: number;
  wind: number;
};

type ScheduledTask = {
  task: Task;
  slot: WeatherSlot;
  endTime: string;
  decision: Decision;
  riskScore: number;
  remainingCrew: number;
  reason: string;
};

const initialTasks: Task[] = [
  {
    id: 1,
    name: '외부 설비 점검',
    target: '공조 설비',
    location: 'outside',
    duration: 2,
    requiredCrew: 4,
    priority: 1,
    detail: '외부 설비 상태 확인, 이상음 및 누수 여부 점검',
  },
  {
    id: 2,
    name: '설비 보수 작업',
    target: '현장 펌프',
    location: 'outside',
    duration: 2,
    requiredCrew: 3,
    priority: 1,
    detail: '장비 분리 후 원인 확인이 필요한 외부 보수 작업',
  },
  {
    id: 3,
    name: '내부 설비 점검',
    target: '전기실',
    location: 'inside',
    duration: 2,
    requiredCrew: 3,
    priority: 2,
    detail: '분전반, 배선, 차단기 상태 점검',
  },
  {
    id: 4,
    name: '자재 및 작업 기록 정리',
    target: '정비실',
    location: 'inside',
    duration: 1,
    requiredCrew: 2,
    priority: 3,
    detail: '자재 재고 확인, 점검 결과 정리, 다음 작업 준비',
  },
];

const weatherSlots: WeatherSlot[] = [
  { time: '09:00', temp: 28, feelsLike: 31, humidity: 68, rain: 0, wind: 2 },
  { time: '10:00', temp: 30, feelsLike: 33, humidity: 70, rain: 0, wind: 3 },
  { time: '11:00', temp: 31, feelsLike: 35, humidity: 74, rain: 0, wind: 4 },
  { time: '13:00', temp: 32, feelsLike: 37, humidity: 78, rain: 2, wind: 5 },
  { time: '14:00', temp: 33, feelsLike: 39, humidity: 82, rain: 5, wind: 6 },
  { time: '15:00', temp: 32, feelsLike: 38, humidity: 84, rain: 8, wind: 7 },
  { time: '16:00', temp: 30, feelsLike: 34, humidity: 76, rain: 1, wind: 4 },
];

const emptyTask = {
  name: '',
  target: '',
  location: 'outside' as LocationType,
  duration: 1,
  requiredCrew: 2,
  priority: 2,
  detail: '',
};

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour + hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getDecision(task: Task, weather: WeatherSlot): Decision {
  if (task.location === 'inside') return '진행';
  if (weather.rain >= 5 || weather.feelsLike >= 38) return '중단 검토';
  if (weather.rain > 0 || weather.feelsLike >= 35) return '내부 우선';
  if (weather.wind >= 6) return '주의';
  return '진행';
}

function calculateRisk(task: Task, weather: WeatherSlot) {
  if (task.location === 'inside') {
    return weather.rain > 0 || weather.feelsLike >= 35 ? 18 : 10;
  }

  let score = 18;
  score += Math.max(0, weather.feelsLike - 30) * 5;
  score += weather.rain * 7;
  score += Math.max(0, weather.wind - 3) * 5;
  score += Math.max(0, weather.humidity - 70) * 0.8;
  return Math.min(Math.round(score), 100);
}

function makeReason(task: Task, weather: WeatherSlot, decision: Decision) {
  if (task.location === 'inside') {
    if (weather.rain > 0 || weather.feelsLike >= 35) {
      return `비 또는 체감온도 ${weather.feelsLike}도 조건 때문에 외부 작업보다 내부 작업을 먼저 배치했습니다.`;
    }
    return '내부 작업이라 기상 영향이 낮고 남는 공수를 안정적으로 투입할 수 있습니다.';
  }

  if (decision === '진행') {
    return `체감온도 ${weather.feelsLike}도, 강수 ${weather.rain}mm로 외부 작업 진행이 가능한 시간대입니다.`;
  }

  if (decision === '주의') {
    return `풍속 ${weather.wind}m/s 조건을 고려해 안전 확인 후 진행이 필요합니다.`;
  }

  if (decision === '내부 우선') {
    return `체감온도 ${weather.feelsLike}도 또는 강수 조건 때문에 내부 작업을 먼저 배치하는 것이 적절합니다.`;
  }

  return `체감온도 ${weather.feelsLike}도, 강수 ${weather.rain}mm로 외부 작업 중단 또는 시간 변경 검토가 필요합니다.`;
}

function createSchedule(tasks: Task[], totalCrew: number) {
  const orderedTasks = [...tasks].sort((a, b) => a.priority - b.priority);
  const availableSlots = [...weatherSlots];
  const schedule: ScheduledTask[] = [];

  for (const task of orderedTasks) {
    if (availableSlots.length === 0) break;

    const ranked = availableSlots
      .map((slot, index) => {
        const decision = getDecision(task, slot);
        const riskScore = calculateRisk(task, slot);
        const crewPenalty = task.requiredCrew > totalCrew ? 100 : 0;
        const outsidePenalty =
          task.location === 'outside' && (decision === '내부 우선' || decision === '중단 검토')
            ? 60
            : 0;

        return {
          slot,
          index,
          decision,
          riskScore,
          sortScore: riskScore + crewPenalty + outsidePenalty,
        };
      })
      .sort((a, b) => {
        if (a.sortScore !== b.sortScore) return a.sortScore - b.sortScore;
        return a.index - b.index;
      });

    const selected = ranked[0];
    const remainingCrew = totalCrew - task.requiredCrew;
    schedule.push({
      task,
      slot: selected.slot,
      endTime: addHours(selected.slot.time, task.duration),
      decision: task.requiredCrew > totalCrew ? '중단 검토' : selected.decision,
      riskScore: selected.riskScore,
      remainingCrew,
      reason:
        task.requiredCrew > totalCrew
          ? `필요 인원 ${task.requiredCrew}명이 현재 가능 인원 ${totalCrew}명보다 많아 인력 조정이 필요합니다.`
          : makeReason(task, selected.slot, selected.decision),
    });

    availableSlots.splice(selected.index, Math.min(task.duration, availableSlots.length));
  }

  return schedule.sort((a, b) => a.slot.time.localeCompare(b.slot.time));
}

function decisionTone(decision: Decision) {
  if (decision === '진행') return 'tone-go';
  if (decision === '주의') return 'tone-watch';
  if (decision === '내부 우선') return 'tone-inside';
  return 'tone-stop';
}

function priorityLabel(priority: number) {
  if (priority === 1) return '높음';
  if (priority === 2) return '보통';
  return '낮음';
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [totalCrew, setTotalCrew] = useState(12);
  const [form, setForm] = useState(emptyTask);
  const [selectedId, setSelectedId] = useState<number>(initialTasks[0].id);
  const schedule = useMemo(() => createSchedule(tasks, totalCrew), [tasks, totalCrew]);
  const selected = schedule.find((item) => item.task.id === selectedId) ?? schedule[0];
  const assignedCrew = schedule.reduce((sum, item) => sum + item.task.requiredCrew, 0);
  const outsideBlocked = schedule.filter(
    (item) => item.task.location === 'outside' && item.decision !== '진행',
  ).length;
  const firstOutsideSlot = schedule.find(
    (item) => item.task.location === 'outside' && item.decision === '진행',
  );
  const hottestSlot = weatherSlots.reduce((max, slot) =>
    slot.feelsLike > max.feelsLike ? slot : max,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.target.trim()) return;

    const nextTask: Task = {
      id: Date.now(),
      name: form.name.trim(),
      target: form.target.trim(),
      location: form.location,
      duration: Number(form.duration),
      requiredCrew: Number(form.requiredCrew),
      priority: Number(form.priority),
      detail: form.detail.trim() || '상세 내용 없음',
    };

    setTasks((current) => [...current, nextTask]);
    setSelectedId(nextTask.id);
    setForm(emptyTask);
  }

  function removeTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  return (
    <main className="site-shell">
      <header className="global-header">
        <a className="brand" href="#top" aria-label="Hanwha field scheduler">
          <img src="/hanwha-logo.jpg" alt="Hanwha" />
        </a>
        <nav className="global-nav" aria-label="주요 화면">
          <a href="#crew">공수</a>
          <a href="#dispatch">일정</a>
          <a href="#weather">기상</a>
        </nav>
        <a className="hub-link" href="#dispatch">오늘 일정 보기</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">FIELD WORKFORCE CONTROL</p>
          <h1>
            현장 공수와 날씨를 보고
            <span>오늘 작업 순서를 결정합니다.</span>
          </h1>
          <p>
            10~12명 규모의 현장직 투입 인원, 외부/내부 작업 구분, 체감온도 35도 기준,
            강수 여부를 함께 판단해 현장에 전달할 작업 순서를 만듭니다.
          </p>
        </div>

        <div className="hero-board" aria-label="오늘 작업 요약">
          <div className="hero-board-head">
            <span>LIVE PLAN</span>
            <b>{schedule.length} WORKS</b>
          </div>
          <div className="hero-metrics">
            <div>
              <span>가능 인원</span>
              <strong>{totalCrew}</strong>
              <small>명</small>
            </div>
            <div>
              <span>외부 주의</span>
              <strong>{outsideBlocked}</strong>
              <small>건</small>
            </div>
            <div>
              <span>최고 체감</span>
              <strong>{hottestSlot.feelsLike}</strong>
              <small>도</small>
            </div>
          </div>
          <div className="hero-alert">
            <span />
            {firstOutsideSlot
              ? `${firstOutsideSlot.slot.time}부터 외부 작업 진행 가능`
              : '외부 작업은 내부 작업 이후 재검토'}
          </div>
        </div>
      </section>

      <section className="workspace" id="crew">
        <div className="section-heading">
          <p>01 / CONTROL</p>
          <h2>
            공수와 작업을
            <span>먼저 입력합니다.</span>
          </h2>
        </div>

        <div className="control-grid">
          <aside className="crew-panel">
            <div className="panel-head">
              <span>CREW</span>
              <b>10~12명 기준</b>
            </div>
            <label className="field">
              작업 가능 인원
              <input
                type="number"
                min={1}
                max={20}
                value={totalCrew}
                onChange={(event) => setTotalCrew(Number(event.target.value))}
              />
            </label>
            <div className="crew-stats">
              <div>
                <span>총원</span>
                <strong>{totalCrew}</strong>
              </div>
              <div>
                <span>등록 작업</span>
                <strong>{tasks.length}</strong>
              </div>
              <div>
                <span>누적 투입</span>
                <strong>{assignedCrew}</strong>
              </div>
            </div>
          </aside>

          <form className="task-form" onSubmit={handleSubmit}>
            <div className="panel-head">
              <span>ADD WORK</span>
              <b>작업 등록</b>
            </div>

            <div className="form-grid">
              <label className="field">
                작업명
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="예: 외부 설비 점검"
                />
              </label>
              <label className="field">
                설비명 또는 대상
                <input
                  value={form.target}
                  onChange={(event) => setForm({ ...form, target: event.target.value })}
                  placeholder="예: 공조 설비"
                />
              </label>
              <label className="field">
                장소
                <select
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value as LocationType })
                  }
                >
                  <option value="outside">외부</option>
                  <option value="inside">내부</option>
                </select>
              </label>
              <label className="field">
                필요 인원
                <select
                  value={form.requiredCrew}
                  onChange={(event) =>
                    setForm({ ...form, requiredCrew: Number(event.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count}명
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                소요 시간
                <select
                  value={form.duration}
                  onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })}
                >
                  <option value={1}>1시간</option>
                  <option value={2}>2시간</option>
                  <option value={3}>3시간</option>
                </select>
              </label>
              <label className="field">
                우선순위
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                >
                  <option value={1}>높음</option>
                  <option value={2}>보통</option>
                  <option value={3}>낮음</option>
                </select>
              </label>
            </div>

            <label className="field full">
              작업 내용
              <textarea
                value={form.detail}
                onChange={(event) => setForm({ ...form, detail: event.target.value })}
                placeholder="작업 내용과 주의 사항"
              />
            </label>

            <button className="primary-action">작업 추가</button>
          </form>
        </div>
      </section>

      <section className="dispatch-section" id="dispatch">
        <div className="section-heading compact">
          <p>02 / DISPATCH</p>
          <h2>
            현장직에게 전달할
            <span>작업 순서입니다.</span>
          </h2>
        </div>

        <div className="dispatch-layout">
          <section className="dispatch-panel">
            <div className="panel-head dark">
              <span>TODAY PLAN</span>
              <b>행 기반 작업 패널</b>
            </div>

            <div className="dispatch-header-row">
              <span>순번</span>
              <span>시간</span>
              <span>작업 정보</span>
              <span>공수</span>
              <span>기상</span>
              <span>판단</span>
            </div>

            <div className="dispatch-row-list">
              {schedule.map((item, index) => (
                <button
                  key={item.task.id}
                  className={`dispatch-row ${selected?.task.id === item.task.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(item.task.id)}
                >
                  <span className="dispatch-index">{String(index + 1).padStart(2, '0')}</span>

                  <div className="dispatch-time">
                    <strong>{item.slot.time}</strong>
                    <small>{item.endTime} 종료</small>
                  </div>

                  <div className="dispatch-work">
                    <div className="work-title-line">
                      <strong>{item.task.name}</strong>
                      <span>{item.task.location === 'outside' ? '외부' : '내부'}</span>
                    </div>
                    <small>{item.task.target}</small>
                    <p>{item.reason}</p>
                  </div>

                  <div className="dispatch-crew">
                    <strong>{item.task.requiredCrew}명</strong>
                    <small>남는 인원 {Math.max(0, item.remainingCrew)}명</small>
                  </div>

                  <div className="dispatch-weather">
                    <strong>{item.slot.feelsLike}도</strong>
                    <small>비 {item.slot.rain}mm · 바람 {item.slot.wind}m/s</small>
                  </div>

                  <div className="dispatch-decision">
                    <b className={decisionTone(item.decision)}>{item.decision}</b>
                    <small>위험 {item.riskScore}</small>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="detail-stack">
            <section className="selected-card">
              <div className="panel-head">
                <span>SELECTED WORK</span>
                <b>{selected ? priorityLabel(selected.task.priority) : '-'}</b>
              </div>
              {selected ? (
                <>
                  <h3>{selected.task.name}</h3>
                  <p>{selected.task.detail}</p>
                  <dl>
                    <div>
                      <dt>작업 장소</dt>
                      <dd>{selected.task.location === 'outside' ? '외부' : '내부'}</dd>
                    </div>
                    <div>
                      <dt>필요 인원</dt>
                      <dd>{selected.task.requiredCrew}명</dd>
                    </div>
                    <div>
                      <dt>남는 인원</dt>
                      <dd>{Math.max(0, selected.remainingCrew)}명</dd>
                    </div>
                    <div>
                      <dt>위험 점수</dt>
                      <dd>{selected.riskScore}</dd>
                    </div>
                  </dl>
                  <button className="secondary-action" onClick={() => removeTask(selected.task.id)}>
                    선택 작업 삭제
                  </button>
                </>
              ) : (
                <p>등록된 작업이 없습니다.</p>
              )}
            </section>

            <section className="rule-card">
              <div className="panel-head">
                <span>STANDARD</span>
                <b>판단 기준</b>
              </div>
              <ul>
                <li>
                  <span>체감온도</span>
                  <strong>35도 이상 주의</strong>
                </li>
                <li>
                  <span>강수 발생</span>
                  <strong>내부 작업 우선</strong>
                </li>
                <li>
                  <span>외부 작업</span>
                  <strong>시간대 재배치</strong>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </section>

      <section className="weather-section" id="weather">
        <div className="section-heading compact">
          <p>03 / WEATHER</p>
          <h2>
            시간대별 기상 조건을
            <span>작업 판단에 반영합니다.</span>
          </h2>
        </div>

        <div className="weather-grid">
          {weatherSlots.map((slot) => (
            <article key={slot.time} className="weather-card">
              <div>
                <span>{slot.time}</span>
                <strong>{slot.feelsLike}도</strong>
              </div>
              <p>체감온도</p>
              <div className="weather-bar">
                <i style={{ width: `${Math.min(100, slot.feelsLike * 2.3)}%` }} />
              </div>
              <dl>
                <div>
                  <dt>강수</dt>
                  <dd>{slot.rain}mm</dd>
                </div>
                <div>
                  <dt>풍속</dt>
                  <dd>{slot.wind}m/s</dd>
                </div>
                <div>
                  <dt>습도</dt>
                  <dd>{slot.humidity}%</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
