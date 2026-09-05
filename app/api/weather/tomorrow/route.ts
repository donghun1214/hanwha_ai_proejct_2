import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const KMA_ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

// Hanwha Aerospace Yeosu Site, 411 Sinwol-ro, Yeosu-si.
// KMA short-term forecast grid is approximately 5 km per cell.
const YEOSU_SITE_GRID = { nx: 73, ny: 66 };
const WORK_HOURS = new Set(['0900', '1000', '1100', '1300', '1400', '1500', '1600']);

type ForecastItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
};

function kstDate(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getLatestBaseTime() {
  const kst = getKstNow();
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes() - 20;
  const issueTimes = [23 * 60, 20 * 60, 17 * 60, 14 * 60, 11 * 60, 8 * 60, 5 * 60, 2 * 60];
  const issue = issueTimes.find((time) => time <= minutes);

  if (issue === undefined) {
    kst.setUTCDate(kst.getUTCDate() - 1);
    return { baseDate: kstDate(kst), baseTime: '2300' };
  }

  return { baseDate: kstDate(kst), baseTime: `${String(Math.floor(issue / 60)).padStart(2, '0')}00` };
}

function getTomorrow() {
  const date = getKstNow();
  date.setUTCDate(date.getUTCDate() + 1);
  return kstDate(date);
}

function precipitation(value: string) {
  if (!value || value.includes('강수없음')) return 0;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function feelsLike(temp: number, humidity: number, wind: number) {
  if (temp >= 27) {
    const heatIndex =
      -8.784695 +
      1.61139411 * temp +
      2.338549 * humidity -
      0.14611605 * temp * humidity -
      0.012308094 * temp ** 2 -
      0.016424828 * humidity ** 2 +
      0.002211732 * temp ** 2 * humidity +
      0.00072546 * temp * humidity ** 2 -
      0.000003582 * temp ** 2 * humidity ** 2;
    return Math.round(heatIndex);
  }

  if (temp <= 10 && wind > 1.3) {
    return Math.round(13.12 + 0.6215 * temp - 11.37 * wind ** 0.16 + 0.3965 * temp * wind ** 0.16);
  }

  return Math.round(temp);
}

export async function GET() {
  const rawKey = process.env.KMA_SERVICE_KEY;

  if (!rawKey) {
    return NextResponse.json({ message: '기상청 인증키가 설정되지 않았습니다.' }, { status: 500 });
  }

  const { baseDate, baseTime } = getLatestBaseTime();
  const params = new URLSearchParams({
    serviceKey: decodeURIComponent(rawKey),
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(YEOSU_SITE_GRID.nx),
    ny: String(YEOSU_SITE_GRID.ny),
  });

  try {
    const response = await fetch(`${KMA_ENDPOINT}?${params}`, { next: { revalidate: 1800 } });
    const payload = await response.json();
    const header = payload?.response?.header;

    if (!response.ok || header?.resultCode !== '00') {
      throw new Error(header?.resultMsg || '기상청 예보를 조회하지 못했습니다.');
    }

    const tomorrow = getTomorrow();
    const items = (payload.response.body.items.item as ForecastItem[]).filter(
      (item) => item.fcstDate === tomorrow && WORK_HOURS.has(item.fcstTime),
    );
    const byTime = new Map<string, Map<string, string>>();

    for (const item of items) {
      const values = byTime.get(item.fcstTime) ?? new Map<string, string>();
      values.set(item.category, item.fcstValue);
      byTime.set(item.fcstTime, values);
    }

    const slots = [...byTime.entries()]
      .map(([time, values]) => {
        const temp = Number(values.get('TMP'));
        const humidity = Number(values.get('REH'));
        const wind = Number(values.get('WSD'));
        const rain = Math.max(
          precipitation(values.get('PCP') ?? ''),
          Number(values.get('PTY')) > 0 ? 0.1 : 0,
        );

        if (![temp, humidity, wind].every(Number.isFinite)) return null;

        return {
          time: `${time.slice(0, 2)}:${time.slice(2)}`,
          temp,
          feelsLike: feelsLike(temp, humidity, wind),
          humidity,
          rain,
          wind,
        };
      })
      .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
      .sort((a, b) => a.time.localeCompare(b.time));

    if (slots.length === 0) {
      throw new Error('내일 작업 시간대의 예보가 아직 발표되지 않았습니다.');
    }

    return NextResponse.json({ forecastDate: tomorrow, baseDate, baseTime, slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : '기상청 예보를 조회하지 못했습니다.';
    return NextResponse.json({ message }, { status: 502 });
  }
}
