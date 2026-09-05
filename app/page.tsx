'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type LocationType = 'outside' | 'inside';
type Decision = '진행' | '주의' | '내부 우선' | '중단 검토';
type Skill = 'mechanical' | 'electrical' | 'general';

type Worker = {
  id: number;
  name: string;
  skill: Skill;
  level: number;
};

type Task = {
  id: number;
  name: string;
  target: string;
  location: LocationType;
  duration: number;
  requiredCrew: number;
  priority: number;
  detail: string;
  skill: Skill;
  minSkill: number;
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
  assignedWorkers: Worker[];
};

type AiScheduleAnalysis = {
  summary: string;
  items: Array<{
    taskId: number;
    startTime: string;
    endTime: string;
    decision: Decision;
    riskScore: number;
    reason: string;
    assignedWorkerIds: number[];
  }>;
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
    skill: 'mechanical',
    minSkill: 3,
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
    skill: 'mechanical',
    minSkill: 3,
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
    skill: 'electrical',
    minSkill: 3,
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
    skill: 'general',
    minSkill: 1,
  },
];

const initialWorkforce: Worker[] = [
  { id: 1, name: '김현우', skill: 'mechanical', level: 5 }, { id: 2, name: '박서준', skill: 'mechanical', level: 5 },
  { id: 3, name: '최민석', skill: 'mechanical', level: 4 }, { id: 4, name: '정우진', skill: 'mechanical', level: 3 },
  { id: 5, name: '이은지', skill: 'electrical', level: 5 }, { id: 6, name: '한지민', skill: 'electrical', level: 4 },
  { id: 7, name: '오세훈', skill: 'electrical', level: 3 }, { id: 8, name: '윤서연', skill: 'general', level: 4 },
  { id: 9, name: '김도윤', skill: 'general', level: 4 }, { id: 10, name: '문지후', skill: 'general', level: 3 },
  { id: 11, name: '배수빈', skill: 'general', level: 3 }, { id: 12, name: '임하늘', skill: 'general', level: 2 },
];

const previewWeatherSlots: WeatherSlot[] = [
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
  skill: 'general' as Skill,
  minSkill: 1,
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

function createSchedule(tasks: Task[], totalCrew: number, weatherSlots: WeatherSlot[], workforce: Worker[]) {
  const orderedTasks = [...tasks].sort((a, b) => a.priority - b.priority);
  const schedule: ScheduledTask[] = [];
  const activeWorkers = workforce.slice(0, totalCrew);
  const bookings = new Map<number, Array<{ start: number; end: number }>>();

  for (const task of orderedTasks) {
    const ranked = weatherSlots
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

    const selected = ranked.find(({ slot }) => {
      const start = timeToMinutes(slot.time);
      const end = start + task.duration * 60;
      return activeWorkers.filter((worker) => {
        const overlaps = (bookings.get(worker.id) ?? []).some((booking) => start < booking.end && end > booking.start);
        return !overlaps && (worker.skill === task.skill || task.skill === 'general') && worker.level >= task.minSkill;
      }).length >= task.requiredCrew;
    }) ?? ranked[0];
    const start = timeToMinutes(selected.slot.time);
    const end = start + task.duration * 60;
    const assignedWorkers = activeWorkers
      .filter((worker) => {
        const overlaps = (bookings.get(worker.id) ?? []).some((booking) => start < booking.end && end > booking.start);
        return !overlaps && (worker.skill === task.skill || task.skill === 'general') && worker.level >= task.minSkill;
      })
      .sort((a, b) => b.level - a.level)
      .slice(0, task.requiredCrew);
    const hasQualifiedCrew = assignedWorkers.length === task.requiredCrew;

    if (hasQualifiedCrew) {
      for (const worker of assignedWorkers) {
        const workerBookings = bookings.get(worker.id) ?? [];
        workerBookings.push({ start, end });
        bookings.set(worker.id, workerBookings);
      }
    }

    const remainingCrew = activeWorkers.length - assignedWorkers.length;
    schedule.push({
      task,
      slot: selected.slot,
      endTime: addHours(selected.slot.time, task.duration),
      decision: !hasQualifiedCrew || task.requiredCrew > totalCrew ? '중단 검토' : selected.decision,
      riskScore: selected.riskScore,
      remainingCrew,
      reason:
        !hasQualifiedCrew || task.requiredCrew > totalCrew
          ? `${task.skill === 'mechanical' ? '기계 정비' : task.skill === 'electrical' ? '전기 설비' : '일반 작업'} 숙련도 ${task.minSkill} 이상 인력이 ${task.requiredCrew}명 확보되지 않아 인력 조정이 필요합니다.`
          : makeReason(task, selected.slot, selected.decision),
      assignedWorkers,
    });
  }

  return schedule.sort((a, b) => a.slot.time.localeCompare(b.slot.time));
}

function decisionTone(decision: Decision) {
  if (decision === '진행') return 'tone-go';
  if (decision === '주의') return 'tone-watch';
  if (decision === '내부 우선') return 'tone-inside';
  return 'tone-stop';
}

function criterionState(value: number, safeLimit: number, watchLimit: number) {
  if (value <= safeLimit) return { status: '적합', tone: 'safe' };
  if (value <= watchLimit) return { status: '주의', tone: 'watch' };
  return { status: '재검토', tone: 'stop' };
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [workers, setWorkers] = useState<Worker[]>(initialWorkforce);
  const [totalCrew, setTotalCrew] = useState(12);
  const [form, setForm] = useState(emptyTask);
  const [selectedId, setSelectedId] = useState<number>(initialTasks[0].id);
  const [weatherSlots, setWeatherSlots] = useState<WeatherSlot[]>(previewWeatherSlots);
  const [forecastDate, setForecastDate] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiScheduleAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTomorrowForecast() {
      try {
        const response = await fetch('/api/weather/tomorrow');
        const data = (await response.json()) as {
          forecastDate?: string;
          message?: string;
          slots?: WeatherSlot[];
        };

        if (!response.ok || !data.forecastDate || !data.slots?.length) {
          throw new Error(data.message || '내일 예보를 불러오지 못했습니다.');
        }

        if (!cancelled) {
          setWeatherSlots(data.slots);
          setForecastDate(data.forecastDate);
          setWeatherError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherError(error instanceof Error ? error.message : '내일 예보를 불러오지 못했습니다.');
        }
      }
    }

    loadTomorrowForecast();
    return () => {
      cancelled = true;
    };
  }, []);

  const ruleSchedule = useMemo(
    () => createSchedule(tasks, totalCrew, weatherSlots, workers),
    [tasks, totalCrew, weatherSlots, workers],
  );
  const schedule = useMemo(() => {
    if (!aiAnalysis) return ruleSchedule;

    const recommendations = new Map(aiAnalysis.items.map((item) => [item.taskId, item]));
    return ruleSchedule
      .map((item) => {
        const recommendation = recommendations.get(item.task.id);
        const slot = recommendation ? weatherSlots.find((weather) => weather.time === recommendation.startTime) : undefined;
        if (!recommendation || !slot) return item;
        return {
          ...item,
          slot,
          endTime: recommendation.endTime,
          decision: recommendation.decision,
          riskScore: recommendation.riskScore,
          reason: recommendation.reason,
          assignedWorkers: recommendation.assignedWorkerIds
            .map((workerId) => workers.find((worker) => worker.id === workerId))
            .filter((worker): worker is Worker => Boolean(worker)),
        };
      })
      .sort((a, b) => a.slot.time.localeCompare(b.slot.time));
  }, [aiAnalysis, ruleSchedule, weatherSlots, workers]);
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
  const planDateLabel = forecastDate
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(
        new Date(`${forecastDate.slice(0, 4)}-${forecastDate.slice(4, 6)}-${forecastDate.slice(6, 8)}T00:00:00`),
      )
    : '내일';
  const selectedCriteria = selected
    ? [
        {
          label: '체감온도',
          value: `${selected.slot.feelsLike}°C`,
          ...criterionState(selected.slot.feelsLike, 30, 35),
        },
        {
          label: '강수',
          value: `${selected.slot.rain}mm`,
          ...criterionState(selected.slot.rain, 0, 4),
        },
        {
          label: '풍속',
          value: `${selected.slot.wind}m/s`,
          ...criterionState(selected.slot.wind, 6, 8),
        },
        {
          label: '가용 인원',
          value: `${totalCrew} / ${selected.task.requiredCrew}명`,
          ...(totalCrew >= selected.task.requiredCrew
            ? { tone: 'safe', status: '충분' }
            : { tone: 'stop', status: '부족' }),
        },
        {
          label: '작업 위험도',
          value: `${selected.riskScore}점`,
          ...(selected.riskScore < 30
            ? { tone: 'safe', status: '적합' }
            : selected.riskScore < 50
              ? { tone: 'watch', status: '주의' }
              : { tone: 'stop', status: '재검토' }),
        },
      ]
    : [];
  const selectedRecommendation = selected
    ? aiAnalysis
      ? selected.reason
      : `${selected.slot.time}–${selected.endTime}은 체감온도 ${selected.slot.feelsLike}°C, 강수 ${selected.slot.rain}mm, 풍속 ${selected.slot.wind}m/s 조건입니다. ${selected.task.location === 'outside' ? '외부 작업이 가능한 기상 조건과' : '기상 영향이 낮은 내부 작업 특성과'} ${selected.task.requiredCrew}명 인력 확보, 예상 ${selected.task.duration}시간의 작업시간, 위험도 ${selected.riskScore}점을 함께 분석해 이 시간대를 추천했습니다.`
    : '';

  async function requestAiSchedule() {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/schedule/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks, weatherSlots, totalCrew, workers: workers.slice(0, totalCrew) }),
      });
      const data = (await response.json()) as AiScheduleAnalysis & { message?: string };
      if (!response.ok || !data.items?.length) {
        throw new Error(data.message || 'AI 일정 분석을 완료하지 못했습니다.');
      }
      setAiAnalysis(data);
    } catch (error) {
      setAiAnalysis(null);
      setAiError(error instanceof Error ? error.message : 'AI 일정 분석을 완료하지 못했습니다.');
    } finally {
      setAiLoading(false);
    }
  }

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
      skill: form.skill,
      minSkill: Number(form.minSkill),
    };

    setTasks((current) => [...current, nextTask]);
    setSelectedId(nextTask.id);
    setForm(emptyTask);
    setAiAnalysis(null);
  }

  function removeTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
    setAiAnalysis(null);
  }

  return (
    <main className="site-shell">
      <header className="global-header">
        <a className="brand" href="#top" aria-label="Hanwha field scheduler">
          <img className="brand-logo" src="/image2.png" alt="Hanwha" />
        </a>
        <nav className="global-nav" aria-label="주요 화면">
          <a href="#crew">공수 관리</a>
          <a href="#dispatch">작업 일정</a>
          <a href="#weather">기상 예보</a>
        </nav>
        <a className="hub-link" href="#dispatch">내일 일정 보기</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">FIELD WORKFORCE CONTROL</p>
          <h1>
            현장 공수와 날씨를 보고
            <span>내일 작업 순서를 결정합니다.</span>
          </h1>
          <p>
            한화에어로스페이스 여수 사업장의 내일 예보와 현장 공수를 함께 판단해,
            작업자에게 전달할 작업 순서를 만듭니다.
          </p>
        </div>

        <div className="hero-board" aria-label="내일 작업 요약">
          <div className="hero-board-head">
            <span>TOMORROW PLAN · {planDateLabel}</span>
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
              <b>내일 투입 기준</b>
            </div>
            <label className="field">
              작업 가능 인원
              <input
                type="number"
                min={1}
                max={20}
                value={totalCrew}
                onChange={(event) => {
                  setTotalCrew(Number(event.target.value));
                  setAiAnalysis(null);
                }}
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
            <div className="worker-roster"><b>투입 인력 · 직무 / 숙련도</b>{workers.slice(0, totalCrew).map((worker) => (
              <div key={worker.id}><span>{worker.name}</span><select value={worker.skill} onChange={(event) => { setWorkers((current) => current.map((item) => item.id === worker.id ? { ...item, skill: event.target.value as Skill } : item)); setAiAnalysis(null); }}><option value="mechanical">기계</option><option value="electrical">전기</option><option value="general">일반</option></select><select value={worker.level} onChange={(event) => { setWorkers((current) => current.map((item) => item.id === worker.id ? { ...item, level: Number(event.target.value) } : item)); setAiAnalysis(null); }}>{[1,2,3,4,5].map((level) => <option key={level} value={level}>숙련 {level}</option>)}</select></div>
            ))}</div>
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
              <label className="field">
                필요 직무
                <select value={form.skill} onChange={(event) => setForm({ ...form, skill: event.target.value as Skill })}>
                  <option value="mechanical">기계 정비</option><option value="electrical">전기 설비</option><option value="general">일반 작업</option>
                </select>
              </label>
              <label className="field">
                최소 숙련도
                <select value={form.minSkill} onChange={(event) => setForm({ ...form, minSkill: Number(event.target.value) })}>
                  {[1,2,3,4,5].map((level) => <option key={level} value={level}>숙련 {level} 이상</option>)}
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
            내일의 작업을
            <span>안전하게 최적화합니다.</span>
          </h2>
        </div>

        <div className="optimizer-overview">
          <div>
            <p className="optimizer-eyebrow"><i /> AI SCHEDULE OPTIMIZER</p>
            <h3>
              {firstOutsideSlot ? (
                <>내일은 <strong>{firstOutsideSlot.slot.time} 외부 작업</strong>부터<br />시작하는 것이 적합해요.</>
              ) : (
                <>내일은 <strong>내부 작업</strong>을 먼저<br />진행하는 것이 안전해요.</>
              )}
            </h3>
            <p>{aiAnalysis?.summary ?? '기상청 예보, 작업 우선순위와 필요 인원을 분석해 위험도가 낮은 순서로 배치했습니다.'}</p>
            {aiError && <p className="ai-error">AI 분석 연결 오류: {aiError}</p>}
          </div>
          <div className="optimizer-metrics">
            <div>
              <small>외부 작업 권장 시작</small>
              <strong>{firstOutsideSlot?.slot.time ?? '재검토'}</strong>
              <b>{firstOutsideSlot ? `위험도 ${firstOutsideSlot.riskScore} · ${firstOutsideSlot.decision}` : '기상 조건 확인 필요'}</b>
            </div>
            <div>
              <small>내일 분석 작업</small>
              <strong>{schedule.length}<em>개</em></strong>
              <b>총 예상 {schedule.reduce((sum, item) => sum + item.task.duration, 0)}시간</b>
            </div>
            <button type="button" className="ai-refresh" onClick={requestAiSchedule} disabled={aiLoading}>
              <span>{aiLoading ? '내일 작업 일정을 분석하고 있습니다...' : aiAnalysis ? '내일 작업 일정 다시 만들기' : '내일 작업 일정 만들기'}</span><b aria-hidden="true">→</b>
            </button>
          </div>
        </div>

        <section className="schedule-board" aria-label="내일의 AI 추천 작업 보드">
          <div className="board-toolbar">
            <div>
              <span className="board-status"><i /> AI 추천 일정</span>
              <h3>{planDateLabel} 작업 보드</h3>
            </div>
            <div className="board-toolbar-meta"><span>한화에어로스페이스 여수 사업장</span><b>내일 일정</b></div>
          </div>

          <div className="board-weather">
            <div><span>☀</span><strong>여수 {weatherSlots[0]?.temp ?? '-'}°</strong><small>내일 예보 · 강수 {weatherSlots.some((slot) => slot.rain > 0) ? '있음' : '없음'}</small></div>
            <div className="risk-legend"><i className="safe" /> 적합 <i className="watch" /> 주의 <i className="stop" /> 재검토</div>
            <p><b>AI INSIGHT</b> {firstOutsideSlot ? `${firstOutsideSlot.slot.time}부터 외부 작업 진행이 가능한 것으로 분석됐습니다.` : '외부 작업은 내부 작업 이후 재검토를 권장합니다.'}</p>
          </div>

          <div className="timeline-head">
            <div>작업 목록 <span>{schedule.length}개 · 병렬 레인</span></div>
            <div className="timeline-hours"><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span><span>17:00</span><span>18:00</span></div>
            <div>판단</div>
          </div>

          <div className="timeline-list">
            {schedule.map((item, index) => {
              const start = timeToMinutes(item.slot.time);
              const end = timeToMinutes(item.endTime);
              const left = Math.max(0, ((start - 540) / 540) * 100);
              const width = Math.min(100 - left, Math.max(8, ((end - start) / 540) * 100));

              return (
                <button type="button" key={item.task.id} className={`timeline-row ${selected?.task.id === item.task.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(item.task.id)} aria-pressed={selected?.task.id === item.task.id}>
                  <div className="timeline-task">
                    <span className="timeline-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`location-pill ${item.task.location === 'outside' ? 'outdoor' : 'indoor'}`}>{item.task.location === 'outside' ? '외부' : '내부'}</span>
                    <div><strong>{item.task.name}</strong><small>{item.task.target} · {item.task.requiredCrew}명 · {item.task.duration}시간 · {item.assignedWorkers.map((worker) => worker.name).join('·') || '배정 필요'}</small></div>
                  </div>
                  <div className="timeline-track">
                    <span className="timeline-grid" />
                    <span className={`timeline-bar ${item.task.location === 'inside' ? 'bar-indoor' : `bar-${item.decision === '진행' ? 'safe' : item.decision === '주의' ? 'watch' : 'stop'}`}`} style={{ left: `${left}%`, width: `${width}%` }}><b>{item.slot.time}–{item.endTime}</b></span>
                  </div>
                  <div className={`timeline-state ${decisionTone(item.decision)}`}><b>{item.decision}</b><small>위험 {item.riskScore}</small></div>
                </button>
              );
            })}
          </div>
          <div className="board-footer"><span>기상청 단기예보 기준 · 여수 사업장</span><span>작업을 선택하면 상세 내용을 확인할 수 있습니다.</span></div>
        </section>

        <div className="dispatch-layout">
          <aside className="detail-stack">
            <section className="selected-card">
              {selected ? (
                <>
                  <div className="selected-summary">
                    <div>
                      <span className="detail-kicker">선택 작업 상세</span>
                      <h3>{selected.task.name}</h3>
                      <p>{selected.task.detail}</p>
                    </div>
                    <div className="selected-time"><span>AI 추천 시간</span><strong>{selected.slot.time}–{selected.endTime}</strong></div>
                  </div>
                  <dl className="detail-metrics">
                    <div>
                      <dt>작업 장소</dt><dd>{selected.task.location === 'outside' ? '외부' : '내부'} · {selected.task.target}</dd>
                    </div>
                    <div>
                      <dt>예상 작업시간</dt><dd>{selected.task.duration}시간</dd>
                    </div>
                    <div>
                      <dt>필요 / 가용 인원</dt><dd>{selected.task.requiredCrew}명 / {totalCrew}명</dd>
                    </div>
                    <div>
                      <dt>작업 위험도</dt><dd className={decisionTone(selected.decision)}>{selected.riskScore}점 · {selected.decision}</dd>
                    </div>
                    <div>
                      <dt>배정 인력</dt><dd>{selected.assignedWorkers.length ? selected.assignedWorkers.map((worker) => `${worker.name}(${worker.level})`).join(' · ') : '배정 필요'}</dd>
                    </div>
                  </dl>
                  <div className="ai-reason"><div><span>AI 추천 이유</span><b>{selected.slot.time}–{selected.endTime} 배치</b></div><p>{selectedRecommendation}</p></div>
                  <button type="button" className="remove-task" onClick={() => removeTask(selected.task.id)}>선택 작업 삭제</button>
                </>
              ) : (
                <p>등록된 작업이 없습니다.</p>
              )}
            </section>

            <section className="rule-card">
              <div className="rule-heading"><h3>작업 판단 기준</h3><p>현재 선택된 작업의 조건 충족 여부입니다.</p></div>
              <ul className="criteria-list">
                {selectedCriteria.map((criterion) => (
                  <li key={criterion.label}>
                    <span>{criterion.label}</span><strong>{criterion.value}</strong><b className={`criterion-status ${criterion.tone}`}>{criterion.status}</b>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </section>

      <section className="weather-section" id="weather">
        <div className="section-heading compact">
          <p>03 / WEATHER</p>
          <h2>
            내일 시간대별 예보를
            <span>작업 판단에 반영합니다.</span>
          </h2>
        </div>

        <p className={`weather-status${weatherError ? ' is-error' : ''}`}>
          {weatherError
            ? `기상청 예보 연결 오류: ${weatherError} (표시값은 미리보기입니다.)`
            : `기상청 단기예보 · 한화에어로스페이스 여수 사업장 · ${planDateLabel}`}
        </p>
        <p className="weather-source">
          기상 정보 제공: 기상청 「단기예보 조회서비스」 · 공공데이터포털
        </p>

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
