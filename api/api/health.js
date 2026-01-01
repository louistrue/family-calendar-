/**
 * Health Check Endpoint
 * Returns API status and configuration info
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const calendarsConfigured = [
    !!process.env.CAL_1_URL,
    !!process.env.CAL_2_URL,
    !!process.env.CAL_3_URL,
    !!process.env.CAL_4_URL,
  ];

  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    calendars: {
      cal_1: calendarsConfigured[0] ? 'configured' : 'missing',
      cal_2: calendarsConfigured[1] ? 'configured' : 'missing',
      cal_3: calendarsConfigured[2] ? 'configured' : 'missing',
      cal_4: calendarsConfigured[3] ? 'configured' : 'missing',
    },
    allConfigured: calendarsConfigured.every(Boolean),
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
